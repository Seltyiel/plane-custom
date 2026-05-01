# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33b:
#  Endpoint per il timer attivo del Time Tracking.
#
#  Routes:
#   GET    /workspaces/<slug>/timer/         ritorna timer attivo del request.user
#                                            (o 204 se non ce n'e')
#   POST   /workspaces/<slug>/timer/start/   body: {issue_id, description?}
#                                            crea ActiveTimer; 409 se gia' attivo
#   POST   /workspaces/<slug>/timer/stop/    body: {description?}
#                                            calcola duration, crea TimeLog,
#                                            cancella ActiveTimer
#   DELETE /workspaces/<slug>/timer/         cancella timer SENZA creare TimeLog
#
#  Permessi:
#   - Tutti: l'utente puo' agire SOLO sul proprio timer (request.user).
#     Nessun "stop timer for someone else" (out of MVP scope).
#   - Start: serve essere project member dell'issue su cui parte il timer.
#
#  Edge cases gestiti:
#   - Start con timer gia' attivo -> 409 Conflict, ritorna il timer corrente
#     (frontend puo' chiedere "fermo l'altro e ne avvio uno nuovo?")
#   - Stop con issue nel frattempo cancellata -> ActiveTimer.issue=NULL,
#     200 con warning "issue gone, timer cancelled, no log created"
#   - Stop con duration < 1s -> 400 (non logghiamo durate ridicole)
#   - Stop con duration > 7 giorni -> 400 (timer dimenticato? CheckConstraint
#     del TimeLog rifiuterebbe comunque)

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, ProjectMember, Workspace
from plane.db.models.active_timer import ActiveTimer
from plane.db.models.time_log import (
    TIME_LOG_MAX_DURATION_SECONDS,
    TimeLog,
    TimeLogApprovalStatus,
    TimeLogSource,
)

from plane.app.serializers.active_timer import ActiveTimerSerializer
from plane.app.serializers.time_log import TimeLogSerializer


def _user_is_project_member(user, workspace, project_id):
    return ProjectMember.objects.filter(
        workspace=workspace,
        project_id=project_id,
        member=user,
        is_active=True,
    ).exists()


class ActiveTimerEndpoint(BaseAPIView):
    """
    GET    /workspaces/<slug>/timer/    ritorna timer attivo (200) o 204 se assente
    DELETE /workspaces/<slug>/timer/    cancella timer attivo (no TimeLog creato)
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        timer = ActiveTimer.objects.filter(user=request.user, workspace=workspace).first()
        if not timer:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(ActiveTimerSerializer(timer).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        deleted, _ = ActiveTimer.objects.filter(user=request.user, workspace=workspace).delete()
        if deleted == 0:
            return Response({"error": "No active timer"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TimerStartEndpoint(BaseAPIView):
    """
    POST /workspaces/<slug>/timer/start/
    body: {issue_id (uuid), description? (str)}
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        issue_id = request.data.get("issue_id")
        if not issue_id:
            return Response({"error": "issue_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            issue = Issue.objects.select_related("project", "workspace").get(
                pk=issue_id, workspace=workspace
            )
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Project membership check.
        if not _user_is_project_member(request.user, workspace, issue.project_id):
            return Response(
                {"error": "Not a member of this project"}, status=status.HTTP_403_FORBIDDEN
            )

        # Timer gia' attivo? 409 Conflict + ritorna il timer corrente.
        existing = ActiveTimer.objects.filter(user=request.user, workspace=workspace).first()
        if existing:
            return Response(
                {
                    "error": "Timer already running. Stop or cancel it first.",
                    "active_timer": ActiveTimerSerializer(existing).data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        timer = ActiveTimer.objects.create(
            user=request.user,
            workspace=workspace,
            issue=issue,
            description=request.data.get("description"),
        )
        return Response(ActiveTimerSerializer(timer).data, status=status.HTTP_201_CREATED)


class TimerStopEndpoint(BaseAPIView):
    """
    POST /workspaces/<slug>/timer/stop/
    body: {description? (str) - sovrascrive quella settata a start}

    Calcola duration_seconds = NOW - started_at, crea TimeLog, cancella
    ActiveTimer. Atomico: o crea log + cancella timer, o niente.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        timer = ActiveTimer.objects.filter(user=request.user, workspace=workspace).first()
        if not timer:
            return Response({"error": "No active timer"}, status=status.HTTP_404_NOT_FOUND)

        # Edge case: issue eliminata mentre timer girava (issue FK e' SET_NULL)
        if timer.issue_id is None:
            timer.delete()
            return Response(
                {
                    "error": "Issue was deleted while timer was running. Timer cancelled, no log created.",
                    "log_created": False,
                },
                status=status.HTTP_200_OK,
            )

        # Calcola duration
        now = timezone.now()
        duration_seconds = int((now - timer.started_at).total_seconds())

        if duration_seconds < 1:
            # Hack quasi-impossibile (timer creato in futuro?), ma blocchiamo.
            timer.delete()
            return Response(
                {"error": "Duration < 1 second. Timer cancelled, no log created."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if duration_seconds > TIME_LOG_MAX_DURATION_SECONDS:
            return Response(
                {
                    "error": (
                        f"Timer running for more than 7 days "
                        f"({duration_seconds // 3600}h). Probably forgotten. "
                        f"Cancel it manually with DELETE /timer/ instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Description: payload override > timer description > None
        description = request.data.get("description")
        if description is None:
            description = timer.description

        # Crea TimeLog. workspace+project copiati da issue via TimeLog.save().
        from django.db import transaction

        with transaction.atomic():
            log = TimeLog.objects.create(
                workspace=workspace,
                project=timer.issue.project,
                issue=timer.issue,
                user=request.user,
                duration_seconds=duration_seconds,
                logged_at=now,
                description=description,
                source=TimeLogSource.TIMER,
                timer_started_at=timer.started_at,
                approval_status=TimeLogApprovalStatus.AUTO,
            )
            timer.delete()

        return Response(
            {
                "log_created": True,
                "log": TimeLogSerializer(log).data,
            },
            status=status.HTTP_201_CREATED,
        )
