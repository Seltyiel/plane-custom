# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33a:
#  Endpoints per il sistema Time Tracking.
#
#  Strutturati in 2 view:
#   - IssueTimeLogEndpoint:    /workspaces/<slug>/projects/<projectId>/issues/<issueId>/time-logs/
#                              POST (create), GET (list per issue)
#   - WorkspaceTimeLogEndpoint: /workspaces/<slug>/time-logs/[<id>/]
#                              GET list (report query con filtri),
#                              GET/PATCH/DELETE detail
#
#  Permessi:
#   - Create: workspace MEMBER/ADMIN, solo per se stesso (user = request.user).
#   - List per issue: chiunque sia member del progetto vede tutti i log
#     dell'issue (trasparenza intra-team).
#   - List workspace report: workspace MEMBER vede solo i propri,
#     workspace ADMIN vede tutti.
#   - Detail GET: chiunque puo' leggere i log dei progetti dove e' member.
#   - Detail PATCH/DELETE: owner del log finche' approval_status='auto'
#     o 'pending'; admin sempre. Se 'approved'/'rejected' solo admin.
#
#  v1.33a NON include /approve/ /reject/ - vanno con v1.33e che aggiunge
#  il setting workspace `time_tracking_approval_required`.
#  Tutti i log creati ora sono `approval_status='auto'`.

from datetime import datetime

from django.db.models import Q, Sum, F
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, Project, ProjectMember, Workspace, WorkspaceMember
from plane.db.models.time_log import TimeLog, TimeLogApprovalStatus, TimeLogSource

# PATCH v1.33e: feature settings per gating approval workflow.
from plane.db.models.workspace_feature_settings import get_workspace_feature

# Import locale del serializer (vedi serializers/time_log.py installato dalla patch).
from plane.app.serializers.time_log import TimeLogSerializer


# Helper: parse query date param "YYYY-MM-DD" o ISO datetime.
def _parse_date_param(value):
    if not value:
        return None
    try:
        # Try date first
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _user_is_workspace_admin(user, workspace):
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        member=user,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()


def _user_is_project_member(user, workspace, project_id):
    return ProjectMember.objects.filter(
        workspace=workspace,
        project_id=project_id,
        member=user,
        is_active=True,
    ).exists()


class IssueTimeLogEndpoint(BaseAPIView):
    """
    POST  -> create new time log on issue
    GET   -> list time logs of the issue
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, project_id, issue_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _user_is_project_member(request.user, workspace, project_id):
            return Response({"error": "Not a project member"}, status=status.HTTP_403_FORBIDDEN)

        try:
            issue = Issue.objects.get(pk=issue_id, project_id=project_id, workspace=workspace)
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        qs = (
            TimeLog.objects.filter(issue=issue)
            .select_related("user", "issue", "project")
            .order_by("-logged_at", "-created_at")
        )
        return Response(TimeLogSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, project_id, issue_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        # Project membership: il MEMBER deve appartenere al progetto specifico
        # (non basta essere workspace member).
        if not _user_is_project_member(request.user, workspace, project_id):
            return Response({"error": "Not a project member"}, status=status.HTTP_403_FORBIDDEN)

        try:
            issue = Issue.objects.get(pk=issue_id, project_id=project_id, workspace=workspace)
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Build payload: forziamo workspace/project/issue/user dal context.
        # source resta quello di default 'manual' (POST normale = manual entry).
        # approval_status resta 'auto' fino a v1.33e che attiva il workflow.
        data = {
            "duration_seconds": request.data.get("duration_seconds"),
            "logged_at": request.data.get("logged_at") or timezone.now().isoformat(),
            "description": request.data.get("description"),
        }

        serializer = TimeLogSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # PATCH v1.33e: gating approval workflow.
        # Se il setting workspace `time_tracking_approval_required` e'
        # ON, il log nasce 'pending' e va approvato dall'admin prima di
        # contare nei totali approvati. Altrimenti 'auto' (immediato).
        approval_required = get_workspace_feature(
            workspace, "time_tracking_approval_required", False
        )
        initial_status = (
            TimeLogApprovalStatus.PENDING if approval_required else TimeLogApprovalStatus.AUTO
        )

        log = TimeLog.objects.create(
            workspace=workspace,
            project_id=project_id,
            issue=issue,
            user=request.user,
            duration_seconds=serializer.validated_data["duration_seconds"],
            logged_at=serializer.validated_data["logged_at"],
            description=serializer.validated_data.get("description"),
            source=TimeLogSource.MANUAL,
            approval_status=initial_status,
        )
        return Response(TimeLogSerializer(log).data, status=status.HTTP_201_CREATED)


class WorkspaceTimeLogEndpoint(BaseAPIView):
    """
    Without <log_id>:
      GET  -> list with filters (report query)
    With <log_id>:
      GET    -> detail
      PATCH  -> edit (owner if pending/auto, admin always)
      DELETE -> soft delete (same rules as PATCH)
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, log_id=None):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = _user_is_workspace_admin(request.user, workspace)

        if log_id is not None:
            try:
                log = TimeLog.objects.select_related("user", "issue", "project").get(
                    pk=log_id, workspace=workspace
                )
            except TimeLog.DoesNotExist:
                return Response({"error": "Log not found"}, status=status.HTTP_404_NOT_FOUND)
            # Visibility: owner sempre, admin sempre, project member del log
            # vede gli altri log del proprio progetto.
            if log.user_id != request.user.id and not is_admin:
                if not _user_is_project_member(request.user, workspace, log.project_id):
                    return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
            return Response(TimeLogSerializer(log).data, status=status.HTTP_200_OK)

        # Report query con filtri
        qp = request.query_params
        date_from = _parse_date_param(qp.get("from"))
        date_to = _parse_date_param(qp.get("to"))
        user_id = qp.get("user_id")
        project_id = qp.get("project_id")
        approval_status = qp.get("approval_status")

        # Project access scope: l'utente vede solo i log dei progetti
        # dove e' member (privacy data inter-progetto).
        accessible_project_ids = ProjectMember.objects.filter(
            workspace=workspace,
            member=request.user,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("project_id", flat=True)

        qs = TimeLog.objects.filter(
            workspace=workspace,
            project_id__in=list(accessible_project_ids),
        ).select_related("user", "issue", "project")

        # MEMBER vede solo i propri (admin vede tutti).
        if not is_admin:
            qs = qs.filter(user=request.user)

        # Filtri opzionali.
        if user_id:
            # Solo admin puo' filtrare per user diverso da se stesso.
            if not is_admin and str(user_id) != str(request.user.id):
                return Response(
                    {"error": "Cannot filter by other users (admin only)"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            qs = qs.filter(user_id=user_id)
        if project_id:
            qs = qs.filter(project_id=project_id)
        if approval_status:
            qs = qs.filter(approval_status=approval_status)
        if date_from:
            qs = qs.filter(logged_at__gte=date_from)
        if date_to:
            qs = qs.filter(logged_at__lte=date_to)

        qs = qs.order_by("-logged_at", "-created_at")

        # Aggregati: il frontend deve mostrare summary cards "Total: 42h"
        # senza dover paginare tutto.
        totals = qs.aggregate(
            total_seconds=Sum("duration_seconds"),
            approved_seconds=Sum(
                "duration_seconds",
                filter=Q(approval_status__in=["approved", "auto"]),
            ),
            pending_seconds=Sum(
                "duration_seconds",
                filter=Q(approval_status="pending"),
            ),
        )
        # Default 0 se nessun log
        totals = {k: v or 0 for k, v in totals.items()}

        return Response(
            {
                "logs": TimeLogSerializer(qs, many=True).data,
                "totals": totals,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, log_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            log = TimeLog.objects.get(pk=log_id, workspace=workspace)
        except TimeLog.DoesNotExist:
            return Response({"error": "Log not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = _user_is_workspace_admin(request.user, workspace)
        is_owner = log.user_id == request.user.id

        # Edit rules:
        # - owner puo' editare se status in (auto, pending)
        # - admin puo' sempre
        if not is_admin:
            if not is_owner:
                return Response({"error": "Not the owner"}, status=status.HTTP_403_FORBIDDEN)
            if log.approval_status not in (TimeLogApprovalStatus.AUTO, TimeLogApprovalStatus.PENDING):
                return Response(
                    {"error": "Cannot edit approved/rejected logs (admin only)"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Solo questi campi sono editabili (gli altri read_only_fields nel serializer)
        editable = {}
        for field in ("duration_seconds", "logged_at", "description"):
            if field in request.data:
                editable[field] = request.data[field]

        if not editable:
            return Response({"error": "No editable fields"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = TimeLogSerializer(log, data=editable, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(TimeLogSerializer(log).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, log_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            log = TimeLog.objects.get(pk=log_id, workspace=workspace)
        except TimeLog.DoesNotExist:
            return Response({"error": "Log not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = _user_is_workspace_admin(request.user, workspace)
        is_owner = log.user_id == request.user.id

        if not is_admin:
            if not is_owner:
                return Response({"error": "Not the owner"}, status=status.HTTP_403_FORBIDDEN)
            if log.approval_status not in (TimeLogApprovalStatus.AUTO, TimeLogApprovalStatus.PENDING):
                return Response(
                    {"error": "Cannot delete approved/rejected logs (admin only)"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        log.delete()  # soft delete via SoftDeleteModel
        return Response(status=status.HTTP_204_NO_CONTENT)


# PATCH v1.33e: approve/reject endpoints per il workflow di approvazione.
# Solo workspace ADMIN. Body opzionale: {reason: "..."} per reject.

class TimeLogApproveEndpoint(BaseAPIView):
    """
    POST /workspaces/<slug>/time-logs/<id>/approve/
    Cambia approval_status pending -> approved.
    Solo ADMIN. Logs gia' approved/rejected/auto -> 400.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, log_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            log = TimeLog.objects.get(pk=log_id, workspace=workspace)
        except TimeLog.DoesNotExist:
            return Response({"error": "Log not found"}, status=status.HTTP_404_NOT_FOUND)

        if log.approval_status != TimeLogApprovalStatus.PENDING:
            return Response(
                {"error": f"Cannot approve log with status '{log.approval_status}'. Only 'pending' is approvable."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        log.approval_status = TimeLogApprovalStatus.APPROVED
        log.approved_by = request.user
        log.approved_at = timezone.now()
        log.rejection_reason = None
        log.save()
        return Response(TimeLogSerializer(log).data, status=status.HTTP_200_OK)


class TimeLogRejectEndpoint(BaseAPIView):
    """
    POST /workspaces/<slug>/time-logs/<id>/reject/  body: {reason?: str}
    Cambia approval_status pending -> rejected.
    Solo ADMIN. La reason e' opzionale ma fortemente consigliata
    (l'UI dovrebbe richiederla).
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, log_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            log = TimeLog.objects.get(pk=log_id, workspace=workspace)
        except TimeLog.DoesNotExist:
            return Response({"error": "Log not found"}, status=status.HTTP_404_NOT_FOUND)

        if log.approval_status != TimeLogApprovalStatus.PENDING:
            return Response(
                {"error": f"Cannot reject log with status '{log.approval_status}'. Only 'pending' is rejectable."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data or {}).get("reason", "").strip() or None

        log.approval_status = TimeLogApprovalStatus.REJECTED
        log.approved_by = request.user  # usato anche per rejected: chi ha agito
        log.approved_at = timezone.now()
        log.rejection_reason = reason
        log.save()
        return Response(TimeLogSerializer(log).data, status=status.HTTP_200_OK)
