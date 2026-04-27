# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.19b - Team dashboard: per-member issue list.
#
# NUOVO file (additivo, non sostituisce codice stock):
#   apps/api/plane/app/views/workspace/team_issues.py
#
# Serve la People page riscritta come tabella espandibile: quando l'utente
# clicca su una riga (un membro), il frontend fa lazy-load dei task di quel
# membro con questo endpoint e costruisce lato client l'albero task/subtask
# usando parent_id.
#
# Route (registrata in urls/workspace.py):
#   GET /api/workspaces/<slug>/members/<uuid:user_id>/issues/
#
# Permission: WorkspaceViewerPermission (come gli altri endpoint del team
# dashboard). L'access-control di progetto e' in query: solo issue di
# progetti a cui il requesting user appartiene come membro attivo.
#
# Scope: solo work item ATTIVI (state group in backlog/unstarted/started),
# stessa cosa che v1.18 conta negli aggregati -> parita' visiva tra il
# "total_active" della riga e il numero di task espansi.
#
# Query params opzionali:
#   project=<uuid>[&project=<uuid2>...]   filtra ai soli progetti specificati
#
# Response shape (flat, ordinata per project identifier + sequence_id):
#   [
#     {
#       "id": "uuid",
#       "name": "...",
#       "sequence_id": 42,
#       "project_id": "uuid",
#       "project_identifier": "PROJ",
#       "project_name": "...",
#       "state_id": "uuid",
#       "state_name": "In Progress",
#       "state_group": "started",
#       "state_color": "#3f76ff",
#       "priority": "high" | "medium" | "low" | "urgent" | "none",
#       "start_date": "YYYY-MM-DD" | null,
#       "target_date": "YYYY-MM-DD" | null,
#       "parent_id": "uuid" | null,
#       "assignee_ids": ["uuid", ...],
#       "created_at": "ISO-8601"
#     },
#     ...
#   ]
#
# Il frontend raggruppa per parent_id per renderizzare la struttura ad albero:
#   - task root: parent_id is null OPPURE parent_id non e' presente nel set
#     di id ritornati (es. subtask di un parent non assegnato a quel membro
#     o di un parent gia' completato / escluso dallo scope "attivi").
#   - subtask: parent_id presente nel set.
#
# Nota: includiamo anche task non direttamente assegnati? NO. Vogliamo
# mostrare solo il "carico" del membro. Se una subtask e' assegnata al
# membro ma il parent no, la trattiamo come "orphan root" nel tree.

# Django imports
from django.db.models import Q

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceViewerPermission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue


ACTIVE_STATE_GROUPS = ("backlog", "unstarted", "started")


class WorkspaceMemberIssuesEndpoint(BaseAPIView):
    """
    Flat list of active work items assigned to a given member.

    GET /api/workspaces/<slug>/members/<uuid:user_id>/issues/
    """

    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug, user_id):
        # Access control + scope: workspace slug, member of project, project
        # non archiviato, issue non archiviata (issue_objects gia' filtra
        # draft + archived).
        qs = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                assignees__id=user_id,
                state__group__in=ACTIVE_STATE_GROUPS,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("state", "project")
            .prefetch_related("assignees")
            .distinct()
            .order_by("project__identifier", "sequence_id")
        )

        # Optional project filter (repeat ?project=<uuid> or ?project=a,b,c).
        project_ids = request.query_params.getlist("project", [])
        if len(project_ids) == 1 and "," in project_ids[0]:
            project_ids = [p.strip() for p in project_ids[0].split(",") if p.strip()]
        if project_ids:
            qs = qs.filter(project_id__in=project_ids)

        result = []
        for i in qs:
            state = i.state
            project = i.project
            result.append(
                {
                    "id": str(i.id),
                    "name": i.name,
                    "sequence_id": i.sequence_id,
                    "project_id": str(project.id) if project else None,
                    "project_identifier": project.identifier if project else "",
                    "project_name": project.name if project else "",
                    "state_id": str(state.id) if state else None,
                    "state_name": state.name if state else "",
                    "state_group": state.group if state else "",
                    "state_color": state.color if state else "",
                    "priority": i.priority or "none",
                    "start_date": i.start_date.isoformat() if i.start_date else None,
                    "target_date": i.target_date.isoformat() if i.target_date else None,
                    "parent_id": str(i.parent_id) if i.parent_id else None,
                    "assignee_ids": [str(a.id) for a in i.assignees.all()],
                    "created_at": i.created_at.isoformat() if i.created_at else None,
                }
            )

        return Response(result, status=status.HTTP_200_OK)
