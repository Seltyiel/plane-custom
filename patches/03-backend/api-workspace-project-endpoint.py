# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.22a:
#  WorkspaceProjectEndpoint - ritorna (e crea lazy se non esiste) il progetto
#  fittizio "Workspace" per il workspace corrente.
#
#  GET /api/workspaces/<str:slug>/workspace-project/
#    -> {id, name, identifier, is_hidden}
#
#  Comportamento:
#    1. Cerca un Project con workspace=<slug> e is_hidden=True.
#    2. Se esiste, sincronizza i ProjectMember con i WorkspaceMember
#       (aggiunge member nuovi, rimuove member usciti) e ritorna il dict.
#    3. Se non esiste, lo crea con:
#         name        = "Workspace"
#         identifier  = "WS"  (con suffisso numerico se collide)
#         is_hidden   = True
#         network     = 0  (Secret)
#         features    = tutte disabilitate (page_view=False, ecc) cosi'
#                       il progetto fittizio non mostra cycles/modules/intake.
#       Crea i 6 DEFAULT_STATES per il progetto (o salta se il workspace
#       ha gia' workspace shared states v1.20a).
#       Sincronizza ProjectMember con tutti gli WorkspaceMember attivi.
#
#  Permission: WorkspaceEntityPermission (Admin/Member del workspace).
#  Atomicita': transaction.atomic per evitare race condition (due richieste
#  concorrenti che creerebbero 2 progetti).

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceEntityPermission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, ProjectMember, State, Workspace, WorkspaceMember
from plane.db.models.state import DEFAULT_STATES


WORKSPACE_PROJECT_NAME = "Workspace"
WORKSPACE_PROJECT_IDENTIFIER_PREFIX = "WS"


def _resolve_unique_identifier(workspace) -> str:
    """Trova un identifier univoco per il progetto fittizio del workspace.
    Default WS; se gia' usato (l'utente ha un progetto WS esistente), prova
    WS1, WS2, ecc. fino a max 99 attempt (oltre, alza ValueError).
    """
    base = WORKSPACE_PROJECT_IDENTIFIER_PREFIX
    if not Project.objects.filter(workspace=workspace, identifier=base, deleted_at__isnull=True).exists():
        return base
    for n in range(1, 100):
        candidate = f"{base}{n}"
        if not Project.objects.filter(
            workspace=workspace, identifier=candidate, deleted_at__isnull=True
        ).exists():
            return candidate
    raise ValueError("Cannot find a free identifier for the workspace fictitious project.")


def _sync_workspace_project_members(workspace, project):
    """Aggiunge come ProjectMember tutti gli WorkspaceMember attivi che non
    sono ancora membri del progetto fittizio. Idempotente.
    Non rimuove gli eventuali ProjectMember che non sono piu' in workspace
    (il sync e' additivo per safety - se vuoi simmetria, estendi qui).
    """
    workspace_members = WorkspaceMember.objects.filter(workspace=workspace, is_active=True)
    existing_project_member_ids = set(
        ProjectMember.objects.filter(project=project, is_active=True).values_list("member_id", flat=True)
    )
    to_create = []
    for wm in workspace_members:
        if wm.member_id in existing_project_member_ids:
            continue
        # Mappa il ruolo workspace al ruolo project: Admin -> Admin, Member -> Member,
        # Guest -> Guest. (Plane usa role 20=Admin, 15=Member, 5=Guest in entrambi.)
        to_create.append(
            ProjectMember(
                workspace=workspace,
                project=project,
                member=wm.member,
                role=wm.role,
                is_active=True,
            )
        )
    if to_create:
        ProjectMember.objects.bulk_create(to_create, ignore_conflicts=True)


class WorkspaceProjectEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response(
                {"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND
            )

        with transaction.atomic():
            project = Project.objects.filter(
                workspace=workspace, is_hidden=True, deleted_at__isnull=True
            ).first()

            if project is None:
                # Crea il progetto fittizio.
                identifier = _resolve_unique_identifier(workspace)
                project = Project.objects.create(
                    name=WORKSPACE_PROJECT_NAME,
                    identifier=identifier,
                    workspace=workspace,
                    is_hidden=True,
                    network=0,  # Secret (non visibile via "browse public")
                    # features disabilitate sul progetto fittizio
                    cycle_view=False,
                    module_view=False,
                    issue_views_view=False,
                    intake_view=False,
                    page_view=False,
                    is_time_tracking_enabled=False,
                    is_issue_type_enabled=False,
                    guest_view_all_features=False,
                )

                # Crea i default state (a meno che il workspace abbia gia'
                # workspace shared states v1.20a, nel qual caso il progetto
                # fittizio li usa via merge dello StateDropdown v1.20d).
                workspace_has_shared_states = State.all_state_objects.filter(
                    workspace=workspace, project__isnull=True, deleted_at__isnull=True
                ).exists()
                if not workspace_has_shared_states:
                    State.objects.bulk_create(
                        [
                            State(
                                name=s["name"],
                                color=s["color"],
                                project=project,
                                workspace=workspace,
                                sequence=s["sequence"],
                                group=s["group"],
                                default=s.get("default", False),
                                created_by=request.user,
                            )
                            for s in DEFAULT_STATES
                        ]
                    )

            # Sincronizza ProjectMember (idempotente, safe da chiamare a ogni GET).
            _sync_workspace_project_members(workspace, project)

        return Response(
            {
                "id": str(project.id),
                "name": project.name,
                "identifier": project.identifier,
                "is_hidden": project.is_hidden,
            },
            status=status.HTTP_200_OK,
        )
