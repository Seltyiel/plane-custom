# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.20b:
#  Workspace-level shared states - API endpoints CRUD.
#
#  STEP 2 di 4 della milestone v1.20.
#
#  Estende il file stock workspace/state.py (originale: solo GET aggregato)
#  con i nuovi endpoint per gestire i workspace shared states (project=NULL):
#
#    - GET    /workspaces/<slug>/states/                  (aggregato, esistente, esteso)
#    - POST   /workspaces/<slug>/states/                  (CREATE workspace shared state)
#    - GET    /workspaces/<slug>/states/<uuid:pk>/        (RETRIEVE singolo)
#    - PATCH  /workspaces/<slug>/states/<uuid:pk>/        (UPDATE)
#    - DELETE /workspaces/<slug>/states/<uuid:pk>/        (DELETE, con check issue empty)
#    - POST   /workspaces/<slug>/states/<uuid:pk>/mark-default/   (set as default)
#
#  Permission:
#    - GET (list / retrieve): WorkspaceEntityPermission (Admin/Member/Guest)
#    - POST/PATCH/DELETE/mark-default: WorkSpaceAdminPermission (solo Admin)
#
#  GET aggregato (modificato vs stock):
#    Lo stock filtrava per project__project_projectmember__member=request.user,
#    cioe' solo project states dove l'utente e' membro. Con v1.20a esistono
#    state con project=NULL: queste vanno SEMPRE incluse perche' sono
#    workspace-level e visibili a tutti i workspace member.
#    Quindi: Q(project__isnull=True) OR Q(project__memberhip-check stock).
#
#  POST (create) accetta: name, color, group, sequence (opzionale), default.
#  Se sequence e' assente, usa il save() override del model State che calcola
#  max(sequence)+15000 fra workspace shared states.
#
#  PATCH puo' modificare name, color, group, sequence, default. Non permette
#  di cambiare scope (project_id resta NULL).
#
#  DELETE: vieta delete se default=True o se Issue.state_id=pk esiste.
#
#  mark-default: setta default=False su tutti gli altri workspace shared states
#  dello stesso workspace, poi default=True su questo.

# Python imports
from collections import defaultdict

# Django imports
from django.db.models import Q
from django.db.utils import IntegrityError

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.serializers import StateSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import State, Issue, Workspace
from plane.app.permissions import WorkspaceEntityPermission, WorkSpaceAdminPermission


class WorkspaceStatesEndpoint(BaseAPIView):
    """
    GET  /workspaces/<slug>/states/   list aggregato (project + shared states)
    POST /workspaces/<slug>/states/   crea uno workspace shared state (project=NULL)
    """

    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_permissions(self):
        # POST richiede admin; GET basta member.
        if self.request.method == "POST":
            return [WorkSpaceAdminPermission()]
        return [WorkspaceEntityPermission()]

    def get(self, request, slug):
        # Modificato vs stock: include anche shared states (project=NULL)
        # che per definizione sono visibili a tutti i workspace member.
        states = State.objects.filter(
            workspace__slug=slug,
            is_triage=False,
        ).filter(
            Q(project__isnull=True)
            | Q(
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
        ).distinct()

        grouped_states = defaultdict(list)
        for state in states:
            grouped_states[state.group].append(state)

        for group, group_states in grouped_states.items():
            count = len(group_states)
            for index, state in enumerate(group_states, start=1):
                state.order = index / count

        serializer = StateSerializer(states, many=True).data
        return Response(serializer, status=status.HTTP_200_OK)

    def post(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            data = request.data.copy()
            # Garantiamo project=None per workspace shared state.
            data.pop("project", None)
            data.pop("project_id", None)

            serializer = StateSerializer(data=data)
            if serializer.is_valid():
                serializer.save(workspace=workspace, project=None)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e) or "duplicate" in str(e):
                return Response(
                    {"name": "A workspace state with this name already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"error": "Integrity error: " + str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Workspace.DoesNotExist:
            return Response(
                {"error": "Workspace not found"},
                status=status.HTTP_404_NOT_FOUND,
            )


class WorkspaceStateDetailEndpoint(BaseAPIView):
    """
    GET    /workspaces/<slug>/states/<uuid:pk>/   retrieve singolo workspace shared state
    PATCH  /workspaces/<slug>/states/<uuid:pk>/   update
    DELETE /workspaces/<slug>/states/<uuid:pk>/   delete (con check issue empty)
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [WorkspaceEntityPermission()]
        return [WorkSpaceAdminPermission()]

    def _get_state(self, slug, pk):
        # Recupera SOLO state workspace-shared (project=NULL).
        # Per modificare/cancellare project states usare gli endpoint
        # /projects/<pid>/states/<pk>/ stock.
        return State.objects.get(workspace__slug=slug, pk=pk, project__isnull=True)

    def get(self, request, slug, pk):
        try:
            state = self._get_state(slug, pk)
            return Response(StateSerializer(state).data, status=status.HTTP_200_OK)
        except State.DoesNotExist:
            return Response(
                {"error": "Workspace state not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    def patch(self, request, slug, pk):
        try:
            state = self._get_state(slug, pk)
            data = request.data.copy()
            # Mantiene project=NULL: non permettiamo "promote" a project state.
            data.pop("project", None)
            data.pop("project_id", None)

            serializer = StateSerializer(state, data=data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except State.DoesNotExist:
            return Response(
                {"error": "Workspace state not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except IntegrityError as e:
            if "already exists" in str(e) or "duplicate" in str(e):
                return Response(
                    {"name": "A workspace state with this name already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"error": "Integrity error: " + str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def delete(self, request, slug, pk):
        try:
            state = self._get_state(slug, pk)
        except State.DoesNotExist:
            return Response(
                {"error": "Workspace state not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if state.default:
            return Response(
                {"error": "Default state cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check: nessun issue del workspace usa questo state.
        if Issue.objects.filter(state_id=pk).exists():
            return Response(
                {"error": "The state is not empty, only empty states can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        state.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceStateMarkDefaultEndpoint(BaseAPIView):
    """
    POST /workspaces/<slug>/states/<uuid:pk>/mark-default/

    Setta default=True su questo workspace state, default=False su tutti
    gli altri workspace shared states del medesimo workspace.
    Non tocca i project states (default per progetto resta indipendente).
    """

    permission_classes = [WorkSpaceAdminPermission]

    def post(self, request, slug, pk):
        try:
            state = State.objects.get(workspace__slug=slug, pk=pk, project__isnull=True)
        except State.DoesNotExist:
            return Response(
                {"error": "Workspace state not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Reset default su altri workspace shared states (stesso workspace).
        State.all_state_objects.filter(
            workspace=state.workspace,
            project__isnull=True,
            default=True,
        ).update(default=False)
        # Set default su questo.
        state.default = True
        state.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
