# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.18 - Team dashboard backend.
#
# NUOVO file (additivo, non sostituisce codice stock):
#   apps/api/plane/app/views/workspace/team_stats.py
#
# Espone un endpoint aggregato per la pagina "People" (Team dashboard) richiesta
# da Ciro: per ogni membro attivo del workspace restituisce i conteggi di work
# item raggruppati per state_group, piu' metriche "overdue / due this week /
# no target date" calcolate sui soli work item attivi (backlog+unstarted+started).
#
# Non c'e' ancora un endpoint stock equivalente: WorkspaceUserProfileStatsEndpoint
# calcola stats per UN utente specifico (slug + user_id) ed e' pensato per la
# profile page. Qui serve l'aggregato su TUTTI i membri in una singola
# chiamata, per poter mostrare una riga/card per ciascuno.
#
# Route (registrata in urls/workspace.py patchato in v1.18):
#   GET /api/workspaces/<slug>/members/stats/
#
# Permission: WorkspaceViewerPermission (stesso requisito della user profile
# stats stock). L'access-control di progetto viene fatto in query: gli issue
# aggregati sono limitati ai progetti dove il requesting user e' membro attivo.
#
# Query params opzionali:
#   project=<uuid>[&project=<uuid2>...]  filtra ai soli progetti specificati
#
# Response shape (ordinata alfabeticamente su display_name, case-insensitive):
#   [
#     {
#       "member": {
#         "id": "uuid",
#         "first_name": "...",
#         "last_name": "...",
#         "display_name": "...",
#         "email": "...",
#         "avatar_url": "..." | null,
#         "role": 20 | 15 | 5   # ADMIN / MEMBER / GUEST
#       },
#       "stats": {
#         "backlog": 0,
#         "unstarted": 0,
#         "started": 0,
#         "completed": 0,
#         "cancelled": 0,
#         "total_active": 0,      # backlog + unstarted + started
#         "overdue": 0,            # target_date < today  AND group in (backlog|unstarted|started)
#         "due_this_week": 0,      # today <= target_date <= today+7 AND group in (...)
#         "no_target_date": 0      # target_date is null  AND group in (...)
#       }
#     },
#     ...
#   ]
#
# Strategia di query (due SELECT, poi merge in Python):
#   1) Elenco membri attivi -> workspace_members (ordinati)
#   2) IssueAssignee GROUP BY (assignee_id, state_group) con Count distinct di
#      issue_id: produce i totali per gruppo di stato.
#   3) IssueAssignee GROUP BY assignee_id (limitato ai gruppi attivi) con
#      Count(filter=...) per overdue / due_this_week / no_target_date.
#   4) Zip in Python -> response.
#
# Nota sui guest: WorkspaceMember include ruolo 5 (GUEST) quando is_active=True;
# vengono inclusi nel risultato. Il frontend (v1.19) potra' distinguerli via
# member.role e mostrare un badge "Guest" se serve.

# Python imports
from datetime import timedelta

# Django imports
from django.db.models import Count, Q, Sum
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceViewerPermission
from plane.app.views.base import BaseAPIView
from plane.db.models import IssueAssignee, WorkspaceMember
# PATCH v1.33i: Time Tracking total per user
from plane.db.models.time_log import TimeLog


ACTIVE_STATE_GROUPS = ("backlog", "unstarted", "started")
ALL_STATE_GROUPS = ("backlog", "unstarted", "started", "completed", "cancelled")


def _empty_stats():
    return {
        "backlog": 0,
        "unstarted": 0,
        "started": 0,
        "completed": 0,
        "cancelled": 0,
        "overdue": 0,
        "due_this_week": 0,
        "no_target_date": 0,
        # PATCH v1.33i: total ore loggate da QUESTO user nel workspace
        # (esclude rejected). Default 0 se nessun log.
        "total_logged_seconds": 0,
    }


class WorkspaceMembersStatsEndpoint(BaseAPIView):
    """
    Aggregated per-member work item stats for the Team Dashboard page.

    GET /api/workspaces/<slug>/members/stats/
    """

    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug):
        today = timezone.now().date()
        week_end = today + timedelta(days=7)

        # Optional project filter (repeat ?project=<uuid> or ?project=a,b,c).
        project_ids = request.query_params.getlist("project", [])
        if len(project_ids) == 1 and "," in project_ids[0]:
            project_ids = [p.strip() for p in project_ids[0].split(",") if p.strip()]

        # 1) Members: attivi, select_related avatar, sort alfabetico case-insensitive
        #    lato Python perche' Postgres default order e' case-sensitive.
        workspace_members = list(
            WorkspaceMember.objects.filter(
                workspace__slug=slug, is_active=True
            ).select_related("member", "member__avatar_asset")
        )

        def _sort_key(wm):
            name = (wm.member.display_name or wm.member.first_name or wm.member.email or "")
            return name.casefold()

        workspace_members.sort(key=_sort_key)

        member_ids = [wm.member_id for wm in workspace_members]
        if not member_ids:
            return Response([], status=status.HTTP_200_OK)

        # 2) Base access control: solo issue di progetti dove il requester e'
        #    membro attivo. Filtro su IssueAssignee (tabella M2M soft-delete).
        base_filter = Q(
            issue__workspace__slug=slug,
            issue__project__project_projectmember__member=request.user,
            issue__project__project_projectmember__is_active=True,
            issue__project__archived_at__isnull=True,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
            deleted_at__isnull=True,  # IssueAssignee soft-delete marker
            assignee_id__in=member_ids,
        )

        if project_ids:
            base_filter &= Q(issue__project_id__in=project_ids)

        # 3) State group totali per membro: una riga per (assignee, state_group).
        state_rows = (
            IssueAssignee.objects.filter(base_filter)
            .values("assignee_id", "issue__state__group")
            .annotate(count=Count("issue_id", distinct=True))
        )

        # 4) Date buckets (solo work item ancora attivi).
        date_rows = (
            IssueAssignee.objects.filter(
                base_filter, issue__state__group__in=ACTIVE_STATE_GROUPS
            )
            .values("assignee_id")
            .annotate(
                overdue=Count(
                    "issue_id",
                    filter=Q(issue__target_date__lt=today),
                    distinct=True,
                ),
                due_this_week=Count(
                    "issue_id",
                    filter=Q(
                        issue__target_date__gte=today,
                        issue__target_date__lte=week_end,
                    ),
                    distinct=True,
                ),
                no_target_date=Count(
                    "issue_id",
                    filter=Q(issue__target_date__isnull=True),
                    distinct=True,
                ),
            )
        )

        # 5) Merge in Python.
        by_member = {mid: _empty_stats() for mid in member_ids}

        for row in state_rows:
            group = row["issue__state__group"]
            stats = by_member.get(row["assignee_id"])
            if stats is not None and group in ALL_STATE_GROUPS:
                stats[group] = row["count"]

        for row in date_rows:
            stats = by_member.get(row["assignee_id"])
            if stats is not None:
                stats["overdue"] = row["overdue"]
                stats["due_this_week"] = row["due_this_week"]
                stats["no_target_date"] = row["no_target_date"]

        # PATCH v1.33i: ore loggate per user nel workspace.
        # Filter:
        #  - workspace slug
        #  - user in member_ids (limita ai member visibili)
        #  - approval_status != 'rejected' (lavoro respinto non conta)
        #  - issue su un progetto a cui il requester accede
        #  - issue/log non soft-deleted (gia' filtrato da default manager)
        # PATCH v1.33l: filtri opzionali su Hours stat.
        # Query params:
        #   ?hours_period=today|this_week|this_month|last_30_days|all  (default: all)
        #   ?hours_states=active|completed|cancelled|all (default: all)
        # Calcoliamo from/to date in base al period.
        from datetime import datetime, time as dt_time
        period = (request.query_params.get("hours_period") or "all").lower()
        states_filter = (request.query_params.get("hours_states") or "all").lower()

        period_from = None
        if period == "today":
            period_from = datetime.combine(today, dt_time.min)
        elif period == "this_week":
            # Monday della settimana corrente
            monday = today - timedelta(days=today.weekday())
            period_from = datetime.combine(monday, dt_time.min)
        elif period == "this_month":
            first = today.replace(day=1)
            period_from = datetime.combine(first, dt_time.min)
        elif period == "last_30_days":
            past = today - timedelta(days=30)
            period_from = datetime.combine(past, dt_time.min)
        # period == "all" -> period_from None, no filter

        time_log_filter = Q(
            workspace__slug=slug,
            user_id__in=member_ids,
            issue__project__project_projectmember__member=request.user,
            issue__project__project_projectmember__is_active=True,
            issue__project__archived_at__isnull=True,
            issue__archived_at__isnull=True,
            issue__deleted_at__isnull=True,
        ) & ~Q(approval_status="rejected")

        if project_ids:
            time_log_filter &= Q(project_id__in=project_ids)

        # PATCH v1.33l: filtro period (logged_at >= period_from)
        if period_from is not None:
            time_log_filter &= Q(logged_at__gte=period_from)

        # PATCH v1.33l: filtro state group (active|completed|cancelled).
        if states_filter == "active":
            time_log_filter &= Q(issue__state__group__in=ACTIVE_STATE_GROUPS)
        elif states_filter == "completed":
            time_log_filter &= Q(issue__state__group="completed")
        elif states_filter == "cancelled":
            time_log_filter &= Q(issue__state__group="cancelled")
        # states_filter == "all" -> no filter

        time_rows = (
            TimeLog.objects.filter(time_log_filter)
            .values("user_id")
            .annotate(total=Sum("duration_seconds"))
        )
        for row in time_rows:
            stats = by_member.get(row["user_id"])
            if stats is not None:
                stats["total_logged_seconds"] = row["total"] or 0

        # 6) Build response.
        result = []
        for wm in workspace_members:
            stats = by_member.get(wm.member_id, _empty_stats())
            member = wm.member

            avatar_url = None
            try:
                # User.avatar_url e' una property calcolata su avatar_asset
                # (select_related gia' incluso sopra). Se non esiste fallback a None.
                avatar_url = member.avatar_url
            except Exception:
                avatar_url = None

            result.append(
                {
                    "member": {
                        "id": str(member.id),
                        "first_name": member.first_name or "",
                        "last_name": member.last_name or "",
                        "display_name": member.display_name or "",
                        "email": member.email,
                        "avatar_url": avatar_url,
                        "role": wm.role,
                    },
                    "stats": {
                        **stats,
                        "total_active": (
                            stats["backlog"] + stats["unstarted"] + stats["started"]
                        ),
                    },
                }
            )

        return Response(result, status=status.HTTP_200_OK)
