# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.34c:
#  Celery Beat scanner: ogni minuto cerca i meeting upcoming e per ogni
#  attendee interno verifica se la finestra di reminder e' arrivata.
#
#  Algoritmo:
#   1. Carica i Meeting con start_at in [now, now + horizon] (default 24h)
#      e cancelled_at IS NULL.
#   2. Per ogni Meeting, itera attendees (prefetch).
#   3. Skip se:
#       - attendee non interno (user_id NULL)
#       - reminder_email_sent_at gia' set
#       - status == "declined"
#   4. Compute reminder_minutes_before:
#       - attendee.reminder_minutes_before se non NULL
#       - else meeting.reminder_minutes_before (default 15)
#   5. Compute send_at = meeting.start_at - timedelta(minutes=reminder_minutes_before)
#   6. Se now >= send_at AND now < meeting.start_at, fire send_meeting_reminder.delay()
#      (la finestra in cui spara e' [send_at, meeting.start_at)).
#
#  Idempotenza:
#   - reminder_email_sent_at e' set solo dal task send_meeting_reminder
#     dopo l'invio. Quindi anche se il beat gira piu' volte tra un send_at
#     e l'altro, il task task-level fa skip silente.
#
#  Registrato come PeriodicTask via migration 0128_v134c_meeting_reminders_beat.py.

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("plane.bgtasks.meeting_reminder_beat")


@shared_task
def process_meeting_reminders(horizon_hours=24):
    """Beat task: scan upcoming meetings and dispatch reminders."""
    try:
        from plane.db.models.meeting import Meeting
        from plane.bgtasks.meeting_email_task import send_meeting_reminder

        now = timezone.now()
        horizon = now + timedelta(hours=int(horizon_hours))

        upcoming = (
            Meeting.objects.filter(
                cancelled_at__isnull=True,
                start_at__gt=now,
                start_at__lte=horizon,
            )
            .prefetch_related("attendees", "attendees__user")
            .only(
                "id",
                "start_at",
                "reminder_minutes_before",
                "cancelled_at",
            )
        )

        scheduled = 0
        for meeting in upcoming:
            for att in meeting.attendees.all():
                if att.user_id is None:
                    continue  # external: no email v1.34c
                if att.reminder_email_sent_at is not None:
                    continue
                if att.status == "declined":
                    continue

                rmins = (
                    att.reminder_minutes_before
                    if att.reminder_minutes_before is not None
                    else meeting.reminder_minutes_before
                )
                if rmins is None:
                    rmins = 15

                send_at = meeting.start_at - timedelta(minutes=int(rmins))
                if now >= send_at and now < meeting.start_at:
                    send_meeting_reminder.delay(str(meeting.id), str(att.id))
                    scheduled += 1

        if scheduled > 0:
            logger.info(
                "process_meeting_reminders dispatched %d reminders (horizon=%dh)",
                scheduled,
                horizon_hours,
            )
        return scheduled
    except Exception as e:
        # Logghiamo ma non re-raise: vogliamo che il beat continui a girare.
        logger.exception("process_meeting_reminders failed: %s", e)
        return 0
