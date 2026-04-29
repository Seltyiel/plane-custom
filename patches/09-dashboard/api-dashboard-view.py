# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.26a:
#  Endpoint GET /api/workspaces/<slug>/me/dashboard/?user_id=<uuid>
#
#  Restituisce i KPI personali per la dashboard custom della home.
#  - user_id opzionale: default = request.user
#  - Se user_id e' passato e != current user, verifica permesso ADMIN o MEMBER
#    del workspace (4b: "View dashboard as <user>").
#
#  Response shape:
#    {
#      "user": {id, first_name, last_name, display_name, email, avatar_url},
#      "kpi": {
#        "total_assigned": int,
#        "due_today": int,
#        "overdue": int,
#        "due_this_week": int  # today -> sunday (ISO)
#      },
#      "today_issues": [...top 5 issue serializzate...],
#      "overdue_issues": [...top 5 issue serializzate...]
#    }
#
#  Filtri:
#    - "Active" issue = state group in (backlog, unstarted, started)
#    - overdue = target_date < today AND active
#    - due_today = target_date == today AND active
#    - due_this_week = today <= target_date <= sunday_iso AND active
#  Ordinamenti default su today/overdue: target_date ASC poi priority desc.
#
#  Access-control: solo task di progetti dove il requesting user e' membro
#  attivo (non leak di dati cross-project).

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from rest_framework import serializers
from plane.app.permissions import allow_permission, ROLE
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, ProjectMember, Workspace, WorkspaceMember, User


# PATCH v1.26a hotfix: IssueLiteSerializer stock ha solo id/sequence_id/
# project_id - manca name, target_date, priority. Per la dashboard ci
# servono tutti i campi che il frontend mostra: faccio un serializer
# inline con quello che serve.
class _DashboardIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Issue
        fields = ["id", "name", "target_date", "priority", "project_id", "sequence_id"]
        read_only_fields = fields


# State group considerati "attivi" (escludi completed/cancelled).
ACTIVE_STATE_GROUPS = ("backlog", "unstarted", "started")
TOP_LIMIT = 5


def _resolve_target_user(request, slug, requested_user_id):
    """
    Risolve l'utente bersaglio della dashboard.
    - se requested_user_id e' assente -> request.user
    - se uguale a request.user.id -> request.user (no extra check)
    - se diverso -> verifica che il requesting user sia ADMIN/MEMBER del
      workspace (allow_permission lo fa gia' a monte) E che il target sia
      effettivamente member del workspace; altrimenti 404.
    Returns (user, error_response). error_response e' None su successo.
    """
    if not requested_user_id or str(requested_user_id) == str(request.user.id):
        return request.user, None

    is_target_member = WorkspaceMember.objects.filter(
        workspace__slug=slug,
        member_id=requested_user_id,
        is_active=True,
    ).exists()
    if not is_target_member:
        return None, Response(
            {"error": "Target user is not a member of this workspace"},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        target = User.objects.get(pk=requested_user_id, is_active=True)
    except User.DoesNotExist:
        return None, Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    return target, None


def _serialize_user(user):
    return {
        "id": str(user.id),
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "display_name": user.display_name or "",
        "email": user.email,
        "avatar_url": getattr(user, "avatar_url", None) or None,
    }


class MyDashboardEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        # Workspace lookup
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        # Resolve target user (current o altri se admin/member)
        requested_user_id = request.query_params.get("user_id")
        target_user, error_response = _resolve_target_user(request, slug, requested_user_id)
        if error_response is not None:
            return error_response

        # Date di riferimento (date locali del server; in produzione si dovrebbe
        # tener conto del fuso orario dell'utente, scope ridotto per ora).
        today = timezone.localdate()
        # ISO weekday: monday=1 .. sunday=7. weekday() di Python: monday=0..sunday=6
        # Vogliamo "questa settimana fino a domenica inclusa".
        days_to_sunday = 6 - today.weekday()  # 0 se oggi e' domenica
        sunday = today + timedelta(days=days_to_sunday)
        # PATCH v1.30: anche il lunedi' della settimana corrente per il
        # mini-calendario settimanale.
        monday = today - timedelta(days=today.weekday())

        # Project a cui il requesting user (NON il target) ha accesso.
        accessible_project_ids = ProjectMember.objects.filter(
            workspace=workspace,
            member=request.user,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("project_id", flat=True)

        # Base queryset: issue assegnate al target_user, in workspace,
        # progetti accessibili al requester, non archiviate, non eliminate.
        # PATCH v1.30 hotfix: .distinct() necessario perche' filtrare per
        # `assignees=target_user` (relazione M2M tramite IssueAssignee) +
        # `state__group__in` (JOIN con State) puo' produrre righe duplicate
        # (es. piu' righe IssueAssignee per stesso issue, o JOIN multipli).
        # Senza distinct: count gonfiati e issue duplicate nel response.
        base = Issue.objects.filter(
            workspace=workspace,
            project_id__in=list(accessible_project_ids),
            assignees=target_user,
            archived_at__isnull=True,
            deleted_at__isnull=True,
        ).distinct()

        # Filtro "active" su state group.
        active_q = Q(state__group__in=ACTIVE_STATE_GROUPS)

        # KPI counters (4 query semplici - veloci con index su target_date+state).
        total_assigned = base.filter(active_q).count()
        due_today = base.filter(active_q, target_date=today).count()
        overdue = base.filter(active_q, target_date__lt=today).count()
        due_this_week = base.filter(active_q, target_date__gte=today, target_date__lte=sunday).count()

        # Top 5 today: ordinati per priority desc poi name.
        today_qs = (
            base.filter(active_q, target_date=today)
            .select_related("state", "project")
            .order_by("-priority", "name")[:TOP_LIMIT]
        )
        # Top 5 overdue: ordinati per quanto sono scaduti (target_date asc).
        overdue_qs = (
            base.filter(active_q, target_date__lt=today)
            .select_related("state", "project")
            .order_by("target_date", "-priority")[:TOP_LIMIT]
        )

        # PATCH v1.30: tutti i task della settimana corrente (Lun-Dom) con
        # target_date in range. Cap a 100 per evitare payload pesanti se
        # un utente ha tante deadlines in una settimana.
        WEEK_CAP = 100
        week_qs = (
            base.filter(active_q, target_date__gte=monday, target_date__lte=sunday)
            .select_related("state", "project")
            .order_by("target_date", "-priority", "name")[:WEEK_CAP]
        )

        return Response(
            {
                "user": _serialize_user(target_user),
                "kpi": {
                    "total_assigned": total_assigned,
                    "due_today": due_today,
                    "overdue": overdue,
                    "due_this_week": due_this_week,
                },
                "today_issues": _DashboardIssueSerializer(today_qs, many=True).data,
                "overdue_issues": _DashboardIssueSerializer(overdue_qs, many=True).data,
                # PATCH v1.30: week_issues per il mini-calendario settimanale.
                "week_issues": _DashboardIssueSerializer(week_qs, many=True).data,
                "week_range": {
                    "monday": monday.isoformat(),
                    "sunday": sunday.isoformat(),
                },
            },
            status=status.HTTP_200_OK,
        )
