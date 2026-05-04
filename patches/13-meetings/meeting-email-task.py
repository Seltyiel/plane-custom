# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.34c:
#  Celery tasks per Meeting email notifications.
#
#  Tasks:
#   - send_meeting_invite(meeting_id, attendee_id)
#       Invio email invito a uno specifico attendee. Setta
#       invitation_email_sent_at sull'attendee.
#   - send_meeting_update(meeting_id, changes_summary)
#       Invio update a TUTTI gli attendees interni del meeting.
#       Usato dopo un PATCH che cambia campi rilevanti (start, end,
#       location, title).
#   - send_meeting_cancel(meeting_id, reason)
#       Invio cancel a TUTTI gli attendees interni del meeting.
#   - send_meeting_reminder(meeting_id, attendee_id)
#       Invio reminder pre-meeting a uno specifico attendee. Setta
#       reminder_email_sent_at sull'attendee.
#
#  Design choices:
#   - Solo attendees INTERNI ricevono email in v1.34c (user is not null).
#     External attendees (external_email) hanno il rsvp_token salvato
#     ma email non inviata fino a v1.35b (RSVP via magic link).
#   - Idempotenza: se invitation_email_sent_at e' gia' set, skip silente.
#   - SMTP config letta da god-mode (InstanceConfiguration) tramite
#     get_email_configuration(), stesso pattern di magic_link_code_task.
#   - Errori loggati ma NON re-raise: un fallimento email non deve
#     bloccare la transazione applicativa che lo ha schedulato.

import logging
from datetime import timedelta

from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import timezone

from plane.license.utils.instance_value import get_email_configuration
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.bgtasks.meeting_email")


def _build_connection():
    """Ritorna SMTP backend configurato da god-mode + falli sani su default."""
    (
        EMAIL_HOST,
        EMAIL_HOST_USER,
        EMAIL_HOST_PASSWORD,
        EMAIL_PORT,
        EMAIL_USE_TLS,
        EMAIL_USE_SSL,
        EMAIL_FROM,
    ) = get_email_configuration()

    if not EMAIL_HOST:
        # SMTP non configurato: non possiamo inviare. Skippiamo silenziosamente
        # senza crashare il task.
        logger.warning("Meeting email skip: EMAIL_HOST non configurato")
        return None, None

    connection = get_connection(
        host=EMAIL_HOST,
        port=int(EMAIL_PORT or 587),
        username=EMAIL_HOST_USER,
        password=EMAIL_HOST_PASSWORD,
        use_tls=str(EMAIL_USE_TLS) == "1",
        use_ssl=str(EMAIL_USE_SSL) == "1",
    )
    return connection, EMAIL_FROM


def _meeting_context(meeting):
    """Build common context for templates."""
    creator = meeting.created_by
    creator_name = ""
    if creator:
        creator_name = (
            creator.display_name
            or f"{creator.first_name or ''} {creator.last_name or ''}".strip()
            or creator.email
        )
    return {
        "meeting_id": str(meeting.id),
        "title": meeting.title,
        "description": meeting.description or "",
        "location": meeting.location or "",
        "start_at": meeting.start_at,
        "end_at": meeting.end_at,
        "all_day": meeting.all_day,
        "timezone": meeting.timezone,
        "creator_name": creator_name,
        "workspace_slug": meeting.workspace.slug if meeting.workspace else "",
        "workspace_name": meeting.workspace.name if meeting.workspace else "",
    }


def _attendee_context(attendee):
    user = attendee.user
    if user:
        name = (
            user.display_name
            or f"{user.first_name or ''} {user.last_name or ''}".strip()
            or user.email
        )
        email = user.email
    else:
        name = attendee.display_name or attendee.external_email or ""
        email = attendee.external_email
    return {
        "attendee_id": str(attendee.id),
        "attendee_name": name,
        "attendee_email": email,
        "attendee_status": attendee.status,
    }


def _is_internal(attendee):
    """In v1.34c inviamo email solo agli attendees interni."""
    return attendee.user_id is not None


@shared_task
def send_meeting_invite(meeting_id, attendee_id):
    """Invio invito al singolo attendee. Skip se non interno o gia' inviato."""
    try:
        from plane.db.models.meeting import Meeting, MeetingAttendee

        attendee = MeetingAttendee.objects.select_related(
            "meeting", "meeting__workspace", "meeting__created_by", "user"
        ).get(pk=attendee_id, meeting_id=meeting_id)

        if not _is_internal(attendee):
            logger.info(
                "Skip invite for external attendee %s (v1.34c policy)", attendee_id
            )
            return

        if attendee.invitation_email_sent_at is not None:
            logger.info("Skip invite: already sent for attendee %s", attendee_id)
            return

        meeting = attendee.meeting
        if meeting.cancelled_at is not None:
            logger.info("Skip invite: meeting %s cancelled", meeting_id)
            return

        connection, email_from = _build_connection()
        if connection is None:
            return  # SMTP non configurato

        ctx = {**_meeting_context(meeting), **_attendee_context(attendee)}
        subject = f"[Plane] Meeting invite: {meeting.title}"
        html = render_to_string("emails/meetings/meeting_invite.html", ctx)
        text = (
            f"Sei stato invitato al meeting \"{ctx['title']}\".\n"
            f"Inizio: {ctx['start_at']} ({ctx['timezone']})\n"
            f"Fine: {ctx['end_at']}\n"
            f"Luogo: {ctx['location'] or '-'}\n"
            f"Organizzatore: {ctx['creator_name']}\n"
            f"\nApri Plane per rispondere RSVP."
        )

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=email_from,
            to=[ctx["attendee_email"]],
            connection=connection,
        )
        msg.attach_alternative(html, "text/html")
        msg.send()

        attendee.invitation_email_sent_at = timezone.now()
        attendee.save(update_fields=["invitation_email_sent_at"])
        logger.info("Sent meeting invite for %s -> %s", meeting_id, ctx["attendee_email"])
    except Exception as e:
        log_exception(e)


@shared_task
def send_meeting_update(meeting_id, changes_summary=None):
    """Invio update a TUTTI gli attendees interni gia' invitati."""
    try:
        from plane.db.models.meeting import Meeting, MeetingAttendee

        meeting = (
            Meeting.objects.select_related("workspace", "created_by")
            .prefetch_related("attendees", "attendees__user")
            .get(pk=meeting_id)
        )

        if meeting.cancelled_at is not None:
            logger.info("Skip update: meeting %s cancelled", meeting_id)
            return

        connection, email_from = _build_connection()
        if connection is None:
            return

        targets = [
            a for a in meeting.attendees.all()
            if _is_internal(a) and a.invitation_email_sent_at is not None
        ]
        if not targets:
            logger.info("No internal+invited attendees for meeting %s", meeting_id)
            return

        for attendee in targets:
            try:
                ctx = {
                    **_meeting_context(meeting),
                    **_attendee_context(attendee),
                    "changes_summary": changes_summary or "Dettagli aggiornati",
                }
                subject = f"[Plane] Meeting updated: {meeting.title}"
                html = render_to_string("emails/meetings/meeting_update.html", ctx)
                text = (
                    f"Il meeting \"{ctx['title']}\" e' stato aggiornato.\n"
                    f"Modifica: {ctx['changes_summary']}\n"
                    f"Inizio: {ctx['start_at']} ({ctx['timezone']})\n"
                    f"Fine: {ctx['end_at']}\n"
                    f"Luogo: {ctx['location'] or '-'}\n"
                )
                msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text,
                    from_email=email_from,
                    to=[ctx["attendee_email"]],
                    connection=connection,
                )
                msg.attach_alternative(html, "text/html")
                msg.send()
            except Exception as ie:
                log_exception(ie)
        logger.info("Sent meeting update %s to %d attendees", meeting_id, len(targets))
    except Exception as e:
        log_exception(e)


@shared_task
def send_meeting_cancel(meeting_id, reason=None):
    """Invio cancel a TUTTI gli attendees interni gia' invitati."""
    try:
        from plane.db.models.meeting import Meeting

        meeting = (
            Meeting.objects.select_related("workspace", "created_by")
            .prefetch_related("attendees", "attendees__user")
            .get(pk=meeting_id)
        )

        connection, email_from = _build_connection()
        if connection is None:
            return

        targets = [
            a for a in meeting.attendees.all()
            if _is_internal(a) and a.invitation_email_sent_at is not None
        ]
        if not targets:
            logger.info("No internal+invited attendees for meeting %s", meeting_id)
            return

        for attendee in targets:
            try:
                ctx = {
                    **_meeting_context(meeting),
                    **_attendee_context(attendee),
                    "reason": reason or "",
                }
                subject = f"[Plane] Meeting cancelled: {meeting.title}"
                html = render_to_string("emails/meetings/meeting_cancel.html", ctx)
                text = (
                    f"Il meeting \"{ctx['title']}\" e' stato annullato.\n"
                    f"Inizio: {ctx['start_at']} ({ctx['timezone']})\n"
                    f"Motivo: {ctx['reason'] or 'non specificato'}\n"
                )
                msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text,
                    from_email=email_from,
                    to=[ctx["attendee_email"]],
                    connection=connection,
                )
                msg.attach_alternative(html, "text/html")
                msg.send()
            except Exception as ie:
                log_exception(ie)
        logger.info("Sent meeting cancel %s to %d attendees", meeting_id, len(targets))
    except Exception as e:
        log_exception(e)


@shared_task
def send_meeting_reminder(meeting_id, attendee_id):
    """Invio reminder al singolo attendee. Skip se gia' inviato o non interno."""
    try:
        from plane.db.models.meeting import MeetingAttendee

        attendee = MeetingAttendee.objects.select_related(
            "meeting", "meeting__workspace", "meeting__created_by", "user"
        ).get(pk=attendee_id, meeting_id=meeting_id)

        if not _is_internal(attendee):
            return

        if attendee.reminder_email_sent_at is not None:
            return

        meeting = attendee.meeting
        if meeting.cancelled_at is not None:
            return

        # Se l'attendee ha rifiutato, niente reminder.
        if attendee.status == "declined":
            return

        connection, email_from = _build_connection()
        if connection is None:
            return

        # Calcola minuti residui per il body
        delta = meeting.start_at - timezone.now()
        minutes_left = max(0, int(delta.total_seconds() // 60))

        ctx = {
            **_meeting_context(meeting),
            **_attendee_context(attendee),
            "minutes_left": minutes_left,
        }
        subject = f"[Plane] Reminder: {meeting.title} starts in {minutes_left}m"
        html = render_to_string("emails/meetings/meeting_reminder.html", ctx)
        text = (
            f"Il meeting \"{ctx['title']}\" inizia tra {minutes_left} minuti.\n"
            f"Inizio: {ctx['start_at']} ({ctx['timezone']})\n"
            f"Luogo: {ctx['location'] or '-'}\n"
        )

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=email_from,
            to=[ctx["attendee_email"]],
            connection=connection,
        )
        msg.attach_alternative(html, "text/html")
        msg.send()

        attendee.reminder_email_sent_at = timezone.now()
        attendee.save(update_fields=["reminder_email_sent_at"])
        logger.info("Sent meeting reminder for %s -> %s", meeting_id, ctx["attendee_email"])
    except Exception as e:
        log_exception(e)
