# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.34b + v1.34c + v1.34h-4 + v1.35a-1:
#  v1.35a-1: RRULE expansion per Meeting ricorrenti. Helper
#            `_expand_meeting_occurrences` + integrazione nel GET list
#            endpoint che ora espande i meeting con `recurrence_rule` in
#            N occorrenze virtuali entro la finestra [from, to]. Le
#            occorrenze ritornano col flag `is_occurrence: true` e
#            `occurrence_date: "YYYY-MM-DD"`.
#
# Originale (v1.34b/c):
#  Endpoint REST per Meeting + Attendee + IssueLink + RSVP.
#  v1.34c: hook email task post-create / post-patch / post-delete /
#          post-add-attendee. Solo attendees interni ricevono email.
#
#  Routes (registrate in urls/workspace.py):
#   POST   /workspaces/<slug>/meetings/                          create
#   GET    /workspaces/<slug>/meetings/?from=&to=&project_id=    list visibili
#   GET    /workspaces/<slug>/meetings/<id>/                     detail
#   PATCH  /workspaces/<slug>/meetings/<id>/                     edit (creator only)
#   DELETE /workspaces/<slug>/meetings/<id>/                     cancel (creator only)
#
#   POST   /workspaces/<slug>/meetings/<id>/rsvp/                body: {status, comment?}
#   POST   /workspaces/<slug>/meetings/<id>/attendees/           body: {user_id} OR {external_email, display_name?}
#   DELETE /workspaces/<slug>/meetings/<id>/attendees/<aid>/
#
#   POST   /workspaces/<slug>/meetings/<id>/issue-links/         body: {issue_id}
#   DELETE /workspaces/<slug>/meetings/<id>/issue-links/<lid>/
#
#  Privacy ("solo invitati"):
#   - Default: il meeting e' visibile a chi e' creator OR e' attendee
#     interno (user_id non null).
#   - Workspace ADMIN con flag `meetings_admin_audit_mode=true` vedono
#     i meeting altrui via MeetingLightSerializer (solo metadata: title,
#     start/end, attendee count). NO description, location, attendee names.
#   - Mutazioni (edit/cancel/add/remove): solo creator. Eccezione: workspace
#     ADMIN puo' subentrare se il creator e' rimosso dal workspace
#     (ownership transfer, non implementato in v1.34b - rinviato).

import secrets
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, IssueActivity, ProjectMember, User, Workspace, WorkspaceMember
from plane.db.models.meeting import Meeting, MeetingAttendee, MeetingIssueLink
from plane.db.models.workspace_feature_settings import get_workspace_feature

from plane.app.serializers.meeting import (
    MeetingAttendeeSerializer,
    MeetingIssueLinkSerializer,
    MeetingLightSerializer,
    MeetingSerializer,
)

# v1.34c: email tasks (Celery shared_task, lazy import per evitare circolari).
try:
    from plane.bgtasks.meeting_email_task import (
        send_meeting_invite,
        send_meeting_update,
        send_meeting_cancel,
    )
    EMAIL_TASKS_AVAILABLE = True
except ImportError:
    EMAIL_TASKS_AVAILABLE = False


def _safe_delay(task, *args, **kwargs):
    """Wrapper anti-fallimento: se Celery non disponibile o task assente,
    log silente. Le email NON sono critical-path per il flusso applicativo."""
    if not EMAIL_TASKS_AVAILABLE:
        return
    try:
        task.delay(*args, **kwargs)
    except Exception:
        # logging gestito dal task stesso, qui swallowiamo broker errors
        pass


def _significant_change(old, new):
    """Ritorna True se i campi rilevanti per l'email update sono cambiati."""
    significant = ("title", "start_at", "end_at", "location", "all_day")
    return any(getattr(old, f) != getattr(new, f) for f in significant)


def _changes_summary(old, new):
    """Stringa human-readable dei campi cambiati."""
    parts = []
    if old.title != new.title:
        parts.append(f"titolo: '{old.title}' -> '{new.title}'")
    if old.start_at != new.start_at:
        parts.append(f"inizio cambiato")
    if old.end_at != new.end_at:
        parts.append(f"fine cambiata")
    if old.location != new.location:
        parts.append(f"luogo cambiato")
    if old.all_day != new.all_day:
        parts.append(f"all-day toggled")
    return "; ".join(parts) if parts else "Dettagli aggiornati"


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


def _parse_dt(value):
    """Parse ISO-8601 string to aware datetime. Return None on bad input."""
    if not value:
        return None
    try:
        # supporta sia "...Z" sia "...+00:00"
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _gen_rsvp_token():
    """Token URL-safe 32 char per RSVP via magic link (v1.35b)."""
    return secrets.token_urlsafe(24)


def _log_meeting_activity(issue, meeting, verb, comment, actor):
    """
    PATCH v1.34h-4: crea sincrono un IssueActivity record per un evento
    meeting (link/unlink/cancel). Bypass del Celery dispatcher
    issue_activities_task.py per evitare full-replacement di quel file
    (1600+ righe stock). Niente notification email ai watcher (in caso
    serva, si fa migrazione al pattern Celery in v1.34h-4b).

    verb: "created" (linked), "deleted" (unlinked), "cancelled" (meeting
    cancelled).
    """
    try:
        IssueActivity.objects.create(
            issue=issue,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            actor=actor,
            field="meeting",
            verb=verb,
            new_value=meeting.title or "",
            new_identifier=meeting.id,
            comment=comment,
            epoch=int(timezone.now().timestamp()),
        )
    except Exception:
        # Activity log non e' critical-path; se fallisce, swallow.
        pass


# v1.35a-1: cap di sicurezza per la RRULE expansion. Evita DoS da
# rule mal formate (es. "FREQ=MINUTELY") o finestre troppo larghe.
_MAX_OCCURRENCES_PER_MEETING = 365
_MAX_RECURRENCE_HORIZON_DAYS = 365 * 5  # 5 anni dal master.start_at se nessun cap


def _expand_meeting_occurrences(meeting, date_from, date_to,
                                 max_occurrences=_MAX_OCCURRENCES_PER_MEETING):
    """
    PATCH v1.35a-1: espande un Meeting con `recurrence_rule` settato in N
    occorrenze virtuali entro la finestra [date_from, date_to]. Ritorna
    lista di dict con override `start_at`, `end_at` e `occurrence_date`.

    Le occorrenze in `excluded_dates` (cancellate singolarmente) sono
    saltate.

    Cap di sicurezza:
    - max 365 occorrenze per singola request (DoS protection)
    - max 5 anni dal master.start_at se nessun UNTIL/COUNT/recurrence_until

    Ritorna [] se: meeting non ricorrente, RRULE non parsabile, finestra
    incompatibile, o python-dateutil non disponibile.
    """
    if not meeting.recurrence_rule:
        return []
    try:
        from dateutil.rrule import rrulestr
    except ImportError:
        return []

    excluded = set(meeting.excluded_dates or [])
    duration = meeting.end_at - meeting.start_at

    # Lower bound: vogliamo includere occorrenze il cui end_at e' >= date_from.
    # Quindi facciamo lookup partendo da date_from - duration. Ma se
    # window_start scende sotto master.start_at, lo riportiamo li.
    if date_from:
        window_start = date_from - duration
        if window_start < meeting.start_at:
            window_start = meeting.start_at
    else:
        window_start = meeting.start_at

    # Upper bound: prendi il minimo tra date_to (richiesta), recurrence_until
    # (settato dal creator) e cap di 5 anni.
    five_year_cap = meeting.start_at + timedelta(days=_MAX_RECURRENCE_HORIZON_DAYS)
    candidates = [c for c in [date_to, meeting.recurrence_until, five_year_cap] if c]
    if not candidates:
        return []
    window_end = min(candidates)

    if window_end < window_start:
        return []

    try:
        rule = rrulestr(meeting.recurrence_rule, dtstart=meeting.start_at)
    except Exception:
        return []

    occurrences = []
    try:
        for occ_dt in rule.between(window_start, window_end, inc=True):
            if len(occurrences) >= max_occurrences:
                break
            occ_date_str = occ_dt.date().isoformat()
            if occ_date_str in excluded:
                continue
            occurrences.append({
                "occurrence_date": occ_date_str,
                "start_at": occ_dt,
                "end_at": occ_dt + duration,
            })
    except Exception:
        return []

    return occurrences


def _get_visible_meetings(workspace, user):
    """Ritorna queryset Meeting visibile all'utente."""
    return (
        Meeting.objects.filter(workspace=workspace)
        .filter(Q(created_by=user) | Q(attendees__user=user))
        .distinct()
        .select_related("created_by", "cancelled_by", "project", "workspace")
        .prefetch_related("attendees", "attendees__user", "issue_links", "issue_links__issue", "issue_links__issue__project")
    )


def _get_audit_meetings(workspace):
    """Per audit mode: tutti i meeting del workspace, no privacy filter."""
    return (
        Meeting.objects.filter(workspace=workspace)
        .select_related("created_by")
        .prefetch_related("attendees")
    )


class MeetingListCreateEndpoint(BaseAPIView):
    """
    GET    /workspaces/<slug>/meetings/?from=&to=&project_id=
    POST   /workspaces/<slug>/meetings/
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = _user_is_workspace_admin(request.user, workspace)
        audit_mode = get_workspace_feature(workspace, "meetings_admin_audit_mode", False)

        # Range filtri (opzionali)
        date_from = _parse_dt(request.query_params.get("from"))
        date_to = _parse_dt(request.query_params.get("to"))
        project_id = request.query_params.get("project_id")

        # Queryset di base: visibili all'utente
        qs = _get_visible_meetings(workspace, request.user)

        # Audit mode: admin vede ANCHE i meeting di cui non e' attendee
        # (visibili come light = solo metadata).
        light_extra_qs = None
        if is_admin and audit_mode:
            visible_ids = list(qs.values_list("id", flat=True))
            light_extra_qs = (
                _get_audit_meetings(workspace)
                .exclude(id__in=visible_ids)
            )

        # v1.35a-1: separa meeting ricorrenti da non-ricorrenti.
        # I non-ricorrenti applicano i filtri data classici. I ricorrenti
        # bypassano il filtro start/end perche' il master e' la PRIMA
        # occorrenza e potrebbe stare fuori finestra ma generare occorrenze
        # dentro finestra; vengono filtrati solo per project + cancellation.
        non_recurring_qs = qs.filter(
            Q(recurrence_rule__isnull=True) | Q(recurrence_rule="")
        )
        recurring_qs = qs.exclude(
            Q(recurrence_rule__isnull=True) | Q(recurrence_rule="")
        )

        # Apply filters al qs non-ricorrente.
        if date_from:
            non_recurring_qs = non_recurring_qs.filter(end_at__gte=date_from)
            if light_extra_qs is not None:
                light_extra_qs = light_extra_qs.filter(end_at__gte=date_from)
        if date_to:
            non_recurring_qs = non_recurring_qs.filter(start_at__lte=date_to)
            if light_extra_qs is not None:
                light_extra_qs = light_extra_qs.filter(start_at__lte=date_to)
        if project_id:
            non_recurring_qs = non_recurring_qs.filter(project_id=project_id)
            recurring_qs = recurring_qs.filter(project_id=project_id)
            if light_extra_qs is not None:
                light_extra_qs = light_extra_qs.filter(project_id=project_id)

        non_recurring_qs = (
            non_recurring_qs.filter(cancelled_at__isnull=True).order_by("start_at")
        )
        recurring_qs = recurring_qs.filter(cancelled_at__isnull=True)

        result = MeetingSerializer(non_recurring_qs, many=True).data

        # v1.35a-1: espandi i meeting ricorrenti in occorrenze virtuali.
        # Ogni occorrenza eredita tutto il payload del master e si
        # differenzia per start_at/end_at calcolati + flag `is_occurrence`.
        for master in recurring_qs:
            occurrences = _expand_meeting_occurrences(master, date_from, date_to)
            if not occurrences:
                continue
            master_data = MeetingSerializer(master).data
            for occ in occurrences:
                result.append({
                    **master_data,
                    "start_at": occ["start_at"].isoformat(),
                    "end_at": occ["end_at"].isoformat(),
                    "occurrence_date": occ["occurrence_date"],
                    "is_occurrence": True,
                })

        # Audit-only: aggiungi i light alla fine, marker is_audit_only=true.
        # NB: in v1.35a-1 non espandiamo le occorrenze in audit mode
        # (admin vede solo il master). Espansione audit rinviata a v1.35a-1b
        # se serve.
        if light_extra_qs is not None:
            light_extra_qs = light_extra_qs.filter(cancelled_at__isnull=True).order_by("start_at")
            for entry in MeetingLightSerializer(light_extra_qs, many=True).data:
                result.append({**entry, "is_audit_only": True})

        return Response(result, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        # Project access check (se specificato).
        project_id = request.data.get("project")
        if project_id:
            if not _user_is_project_member(request.user, workspace, project_id):
                return Response(
                    {"error": "Not a member of this project"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Validation via serializer (campi base)
        serializer = MeetingSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Forziamo workspace + created_by dal context (read-only nel serializer)
        with transaction.atomic():
            meeting = Meeting.objects.create(
                workspace=workspace,
                project_id=project_id,
                title=serializer.validated_data["title"],
                description=serializer.validated_data.get("description"),
                location=serializer.validated_data.get("location"),
                start_at=serializer.validated_data["start_at"],
                end_at=serializer.validated_data["end_at"],
                all_day=serializer.validated_data.get("all_day", False),
                timezone=serializer.validated_data.get("timezone", "UTC"),
                reminder_minutes_before=serializer.validated_data.get("reminder_minutes_before", 15),
                # v1.35a-1: campi recurrence se forniti dal client
                recurrence_rule=serializer.validated_data.get("recurrence_rule") or None,
                recurrence_until=serializer.validated_data.get("recurrence_until"),
                excluded_dates=serializer.validated_data.get("excluded_dates", []),
                created_by=request.user,
            )

            # Auto-aggiungi il creator come attendee accepted.
            MeetingAttendee.objects.create(
                meeting=meeting,
                user=request.user,
                status="accepted",
                responded_at=timezone.now(),
            )

        # Re-fetch con prefetch per la response
        meeting = (
            Meeting.objects
            .select_related("created_by", "project")
            .prefetch_related("attendees", "attendees__user", "issue_links")
            .get(pk=meeting.id)
        )
        return Response(MeetingSerializer(meeting).data, status=status.HTTP_201_CREATED)


class MeetingDetailEndpoint(BaseAPIView):
    """
    GET    /workspaces/<slug>/meetings/<id>/
    PATCH  /workspaces/<slug>/meetings/<id>/
    DELETE /workspaces/<slug>/meetings/<id>/  -> cancel
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, meeting_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = (
                Meeting.objects
                .select_related("created_by", "project", "cancelled_by", "workspace")
                .prefetch_related(
                    "attendees", "attendees__user",
                    "issue_links", "issue_links__issue", "issue_links__issue__project",
                )
                .get(pk=meeting_id, workspace=workspace)
            )
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        # Visibility check
        is_admin = _user_is_workspace_admin(request.user, workspace)
        audit_mode = get_workspace_feature(workspace, "meetings_admin_audit_mode", False)
        is_creator = meeting.created_by_id == request.user.id
        is_attendee = meeting.attendees.filter(user=request.user).exists()

        if is_creator or is_attendee:
            return Response(MeetingSerializer(meeting).data, status=status.HTTP_200_OK)
        if is_admin and audit_mode:
            data = MeetingLightSerializer(meeting).data
            data["is_audit_only"] = True
            return Response(data, status=status.HTTP_200_OK)
        return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, meeting_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        # Solo creator puo' editare
        if meeting.created_by_id != request.user.id:
            return Response({"error": "Only the meeting creator can edit"}, status=status.HTTP_403_FORBIDDEN)

        editable_fields = (
            "title", "description", "location",
            "start_at", "end_at", "all_day", "timezone",
            "reminder_minutes_before", "project",
            # v1.35a-1: recurrence editabili (whole-series edit). Edit di
            # singola occorrenza vs serie e' v1.35a-4 con endpoint dedicato.
            "recurrence_rule", "recurrence_until", "excluded_dates",
        )
        editable = {k: v for k, v in request.data.items() if k in editable_fields}
        if not editable:
            return Response({"error": "No editable fields provided"}, status=status.HTTP_400_BAD_REQUEST)

        # Project access check se cambia project
        if "project" in editable and editable["project"]:
            if not _user_is_project_member(request.user, workspace, editable["project"]):
                return Response(
                    {"error": "Not a member of the new project"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Snapshot pre-save per detect significant changes (v1.34c email).
        old_snapshot = Meeting.objects.get(pk=meeting.id)

        serializer = MeetingSerializer(meeting, data=editable, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        # v1.34c: notify attendees se cambia qualcosa di rilevante.
        meeting.refresh_from_db()
        if _significant_change(old_snapshot, meeting):
            summary = _changes_summary(old_snapshot, meeting)
            _safe_delay(send_meeting_update, str(meeting.id), summary)

        meeting = (
            Meeting.objects
            .select_related("created_by", "project")
            .prefetch_related("attendees", "attendees__user", "issue_links")
            .get(pk=meeting.id)
        )
        return Response(MeetingSerializer(meeting).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, meeting_id):
        """Soft-cancel del meeting (set cancelled_at + reason)."""
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.created_by_id != request.user.id:
            return Response({"error": "Only the meeting creator can cancel"}, status=status.HTTP_403_FORBIDDEN)

        reason = (request.data or {}).get("reason") or None
        meeting.cancelled_at = timezone.now()
        meeting.cancelled_by = request.user
        meeting.cancellation_reason = reason
        meeting.save()

        # v1.34c: notify cancellation
        _safe_delay(send_meeting_cancel, str(meeting.id), reason)

        # PATCH v1.34h-4: log nell'activity feed di ogni issue linkato.
        linked_issues = Issue.objects.filter(meeting_links__meeting=meeting).distinct()
        for linked in linked_issues:
            _log_meeting_activity(
                issue=linked,
                meeting=meeting,
                verb="cancelled",
                comment="cancelled a linked meeting",
                actor=request.user,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class MeetingRsvpEndpoint(BaseAPIView):
    """
    POST /workspaces/<slug>/meetings/<id>/rsvp/  body: {status, comment?}
    Solo l'attendee corrente (request.user) puo' cambiare il proprio RSVP.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, meeting_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.cancelled_at is not None:
            return Response({"error": "Meeting is cancelled"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            attendee = MeetingAttendee.objects.get(meeting=meeting, user=request.user)
        except MeetingAttendee.DoesNotExist:
            return Response({"error": "You are not invited to this meeting"}, status=status.HTTP_403_FORBIDDEN)

        new_status = (request.data or {}).get("status")
        if new_status not in ("accepted", "tentative", "declined", "invited"):
            return Response(
                {"error": "Invalid status. Must be one of: accepted, tentative, declined, invited"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attendee.status = new_status
        attendee.rsvp_comment = (request.data or {}).get("comment") or None
        attendee.responded_at = timezone.now()
        attendee.save()
        return Response(MeetingAttendeeSerializer(attendee).data, status=status.HTTP_200_OK)


class MeetingAttendeesEndpoint(BaseAPIView):
    """
    POST   /workspaces/<slug>/meetings/<id>/attendees/  body: {user_id} or {external_email, display_name?}
    DELETE /workspaces/<slug>/meetings/<id>/attendees/<attendee_id>/
    Solo creator puo' aggiungere/rimuovere attendees.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, meeting_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.created_by_id != request.user.id:
            return Response({"error": "Only the meeting creator can manage attendees"}, status=status.HTTP_403_FORBIDDEN)

        user_id = (request.data or {}).get("user_id")
        external_email = (request.data or {}).get("external_email")
        display_name = (request.data or {}).get("display_name")

        if user_id and external_email:
            return Response({"error": "Provide user_id OR external_email, not both"}, status=status.HTTP_400_BAD_REQUEST)
        if not user_id and not external_email:
            return Response({"error": "Provide user_id or external_email"}, status=status.HTTP_400_BAD_REQUEST)

        if user_id:
            # Verifica che sia membro del workspace
            if not WorkspaceMember.objects.filter(
                workspace=workspace, member_id=user_id, is_active=True
            ).exists():
                return Response({"error": "User is not an active workspace member"}, status=status.HTTP_404_NOT_FOUND)

            # Anti-duplicate
            if MeetingAttendee.objects.filter(meeting=meeting, user_id=user_id).exists():
                return Response({"error": "User is already an attendee"}, status=status.HTTP_409_CONFLICT)

            attendee = MeetingAttendee.objects.create(
                meeting=meeting,
                user_id=user_id,
                status="invited",
            )
            # v1.34c: invio invite (solo internal)
            _safe_delay(send_meeting_invite, str(meeting.id), str(attendee.id))
        else:
            # External
            if MeetingAttendee.objects.filter(meeting=meeting, external_email=external_email).exists():
                return Response({"error": "Email is already an attendee"}, status=status.HTTP_409_CONFLICT)

            attendee = MeetingAttendee.objects.create(
                meeting=meeting,
                external_email=external_email,
                display_name=display_name or None,
                status="invited",
                rsvp_token=_gen_rsvp_token(),
            )
            # v1.34c: external NON ricevono email (rinviato a v1.35b magic link)

        return Response(MeetingAttendeeSerializer(attendee).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, meeting_id, attendee_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.created_by_id != request.user.id:
            return Response({"error": "Only the meeting creator can manage attendees"}, status=status.HTTP_403_FORBIDDEN)

        try:
            attendee = MeetingAttendee.objects.get(pk=attendee_id, meeting=meeting)
        except MeetingAttendee.DoesNotExist:
            return Response({"error": "Attendee not found"}, status=status.HTTP_404_NOT_FOUND)

        # Non permettere di rimuovere il creator
        if attendee.user_id == meeting.created_by_id:
            return Response({"error": "Cannot remove the meeting creator"}, status=status.HTTP_400_BAD_REQUEST)

        attendee.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeetingSkipOccurrenceEndpoint(BaseAPIView):
    """
    PATCH (plane-custom) v1.35a-4:

    POST /workspaces/<slug>/meetings/<id>/skip-occurrence/
        body: {"occurrence_date": "YYYY-MM-DD"}

    Permette di cancellare una singola occorrenza di un meeting ricorrente
    senza toccare la serie. Aggiunge `occurrence_date` all'array
    `excluded_dates` del master. La GET list endpoint poi salta quella
    occorrenza durante l'espansione (vedi `_expand_meeting_occurrences`).

    Solo il creator del meeting puo' skipare un'occorrenza.

    Ritorna il meeting aggiornato (incluso il nuovo excluded_dates).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, meeting_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.created_by_id != request.user.id:
            return Response(
                {"error": "Only the meeting creator can skip an occurrence"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not meeting.recurrence_rule:
            return Response(
                {"error": "Meeting is not recurring; nothing to skip"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        occurrence_date = (request.data or {}).get("occurrence_date")
        if not occurrence_date:
            return Response(
                {"error": "occurrence_date is required (format YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validazione formato.
        try:
            datetime.strptime(occurrence_date, "%Y-%m-%d")
        except ValueError:
            return Response(
                {"error": "occurrence_date must be YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        excluded = list(meeting.excluded_dates or [])
        if occurrence_date in excluded:
            # idempotente: gia' skipata, no-op.
            return Response(
                MeetingSerializer(meeting).data, status=status.HTTP_200_OK
            )
        excluded.append(occurrence_date)
        meeting.excluded_dates = excluded
        meeting.save(update_fields=["excluded_dates", "updated_at"])

        # Refetch con prefetch per la response.
        meeting = (
            Meeting.objects
            .select_related("created_by", "project")
            .prefetch_related("attendees", "attendees__user", "issue_links")
            .get(pk=meeting.id)
        )
        return Response(MeetingSerializer(meeting).data, status=status.HTTP_200_OK)


class MeetingIssueLinksEndpoint(BaseAPIView):
    """
    POST   /workspaces/<slug>/meetings/<id>/issue-links/  body: {issue_id}
    DELETE /workspaces/<slug>/meetings/<id>/issue-links/<link_id>/
    Solo creator puo' linkare/unlinkare issue.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, meeting_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.created_by_id != request.user.id:
            return Response({"error": "Only the meeting creator can manage issue links"}, status=status.HTTP_403_FORBIDDEN)

        issue_id = (request.data or {}).get("issue_id")
        if not issue_id:
            return Response({"error": "issue_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            issue = Issue.objects.select_related("project").get(pk=issue_id, workspace=workspace)
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # User must be project member of issue's project
        if not _user_is_project_member(request.user, workspace, issue.project_id):
            return Response({"error": "Not a member of the issue's project"}, status=status.HTTP_403_FORBIDDEN)

        if MeetingIssueLink.objects.filter(meeting=meeting, issue=issue).exists():
            return Response({"error": "Issue is already linked"}, status=status.HTTP_409_CONFLICT)

        link = MeetingIssueLink.objects.create(meeting=meeting, issue=issue)
        # PATCH v1.34h-4: log nell'activity feed dell'issue.
        _log_meeting_activity(
            issue=issue,
            meeting=meeting,
            verb="created",
            comment="scheduled a meeting",
            actor=request.user,
        )
        return Response(MeetingIssueLinkSerializer(link).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, meeting_id, link_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            meeting = Meeting.objects.get(pk=meeting_id, workspace=workspace)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.created_by_id != request.user.id:
            return Response({"error": "Only the meeting creator can manage issue links"}, status=status.HTTP_403_FORBIDDEN)

        try:
            link = MeetingIssueLink.objects.select_related("issue").get(pk=link_id, meeting=meeting)
        except MeetingIssueLink.DoesNotExist:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)

        # PATCH v1.34h-4: snapshot pre-delete per logging activity.
        unlinked_issue = link.issue
        link.delete()
        # Log nell'activity feed dell'issue.
        if unlinked_issue is not None:
            _log_meeting_activity(
                issue=unlinked_issue,
                meeting=meeting,
                verb="deleted",
                comment="unlinked a meeting",
                actor=request.user,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueMeetingsEndpoint(BaseAPIView):
    """
    GET /workspaces/<slug>/issues/<issue_id>/meetings/
    Lista dei meeting linkati a un'issue, filtrati per visibility:
    solo meeting di cui l'utente e' creator/attendee.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, issue_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            issue = Issue.objects.get(pk=issue_id, workspace=workspace)
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Project access
        if not _user_is_project_member(request.user, workspace, issue.project_id):
            return Response({"error": "Not a member of this project"}, status=status.HTTP_403_FORBIDDEN)

        from django.db.models import Q

        meetings = (
            Meeting.objects.filter(workspace=workspace, issue_links__issue=issue)
            .filter(Q(created_by=request.user) | Q(attendees__user=request.user))
            .distinct()
            .select_related("created_by")
            .prefetch_related("attendees", "attendees__user", "issue_links")
            .order_by("start_at")
        )
        return Response(MeetingSerializer(meetings, many=True).data, status=status.HTTP_200_OK)
