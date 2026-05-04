# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.34c:
#  Registra PeriodicTask per il beat scanner reminder Meeting.
#  Plane usa django_celery_beat.schedulers.DatabaseScheduler quindi il
#  beat scheduler legge da PeriodicTask, non da CELERY_BEAT_SCHEDULE.
#
#  Schedule: ogni 1 minuto.
#  Task name: 'plane.bgtasks.meeting_reminder_beat.process_meeting_reminders'

from django.db import migrations


def create_meeting_reminder_periodic_task(apps, schema_editor):
    try:
        IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        # django_celery_beat non installato: niente da fare.
        return

    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period="minutes",
    )

    PeriodicTask.objects.update_or_create(
        name="meetings.process_reminders",
        defaults={
            "task": "plane.bgtasks.meeting_reminder_beat.process_meeting_reminders",
            "interval": schedule,
            "enabled": True,
            "description": "v1.34c: scan upcoming meetings and dispatch reminder emails (every minute)",
        },
    )


def delete_meeting_reminder_periodic_task(apps, schema_editor):
    try:
        PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    except LookupError:
        return
    PeriodicTask.objects.filter(name="meetings.process_reminders").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0127_v134a_meetings"),
    ]

    operations = [
        migrations.RunPython(
            create_meeting_reminder_periodic_task,
            delete_meeting_reminder_periodic_task,
        ),
    ]
