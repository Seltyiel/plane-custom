# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.34a:
#  Backend Meeting models per il sistema di calendar/appuntamenti.
#
#  3 model:
#   - Meeting: l'appuntamento. Workspace-level + opzionalmente project-level.
#   - MeetingAttendee: lista invitati (interni con user_id, esterni con
#     external_email + token RSVP per v1.35b).
#   - MeetingIssueLink: M2M links a issue (un meeting puo' essere
#     "discussione su task XYZ").
#
#  Privacy "solo invitati": non e' un campo del model, e' una queryset
#  rule applicata nei view. Vedi v1.34b.
#
#  Recurrence fields (recurrence_rule, recurrence_until, excluded_dates,
#  parent_meeting) sono PREPARATI ma non implementati in v1.34. RRULE
#  expansion arriva in v1.35a.

import uuid
from django.conf import settings
from django.db import models

from .base import BaseModel


class Meeting(BaseModel):
    """
    Un appuntamento del calendario. Visibile solo a creator + attendees
    (privacy enforced lato view, non lato model).
    """

    # Scope: workspace required, project optional.
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_meetings",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.SET_NULL,
        related_name="project_meetings",
        null=True,
        blank=True,
    )

    # Contenuto base
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    location = models.CharField(max_length=500, null=True, blank=True)

    # Timing
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    timezone = models.CharField(max_length=64, default="UTC")

    # Reminder (v1.34a). Default 15 min, configurabile per meeting
    # dal creator. Per-attendee override in MeetingAttendee.reminder_minutes_before.
    reminder_minutes_before = models.IntegerField(default=15)

    # Recurrence (v1.35, prepared but not used in v1.34).
    recurrence_rule = models.CharField(max_length=255, null=True, blank=True)
    recurrence_until = models.DateTimeField(null=True, blank=True)
    # excluded_dates: lista di date "YYYY-MM-DD" come JSON (per ricorrenze
    # cancellate singolarmente). Usiamo JSONField per portabilita'.
    excluded_dates = models.JSONField(default=list, blank=True)
    parent_meeting = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="child_meetings",
        null=True,
        blank=True,
    )

    # Cancellation
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="cancelled_meetings",
        null=True,
        blank=True,
    )
    cancellation_reason = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Meeting"
        verbose_name_plural = "Meetings"
        db_table = "meetings"
        ordering = ("start_at",)
        indexes = [
            # Range query: meeting in [from, to] di un workspace.
            models.Index(fields=["workspace", "start_at", "end_at"], name="meeting_ws_period_idx"),
            # Mio meeting: per il quick-access "i miei meeting".
            models.Index(fields=["created_by", "start_at"], name="meeting_creator_idx"),
            # Link a issue tramite project: filtri "meeting di questo progetto".
            models.Index(fields=["project"], name="meeting_project_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_at__gte=models.F("start_at")),
                name="meeting_end_at_after_start_at",
            ),
        ]

    def __str__(self):
        return f"Meeting<{self.title} {self.start_at}>"


class MeetingAttendee(BaseModel):
    """
    Lista invitati a un meeting. Esattamente uno tra `user` (interno
    workspace member) o `external_email` (esterno, da v1.35b con magic
    link RSVP).
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="attendees",
    )

    # Internal: workspace member.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="meeting_attendances",
        null=True,
        blank=True,
    )
    # External: email guest (v1.35b per RSVP magic link).
    external_email = models.EmailField(null=True, blank=True)
    display_name = models.CharField(max_length=255, null=True, blank=True)

    # RSVP
    STATUS_CHOICES = (
        ("invited", "Invited"),
        ("accepted", "Accepted"),
        ("tentative", "Tentative"),
        ("declined", "Declined"),
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="invited")
    rsvp_token = models.CharField(max_length=64, null=True, blank=True, unique=True)
    rsvp_comment = models.TextField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    # Email tracking
    invitation_email_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_email_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_inapp_sent_at = models.DateTimeField(null=True, blank=True)

    # Per-attendee override del meeting.reminder_minutes_before.
    # NULL = usa il default del meeting.
    reminder_minutes_before = models.IntegerField(null=True, blank=True)

    class Meta:
        verbose_name = "Meeting Attendee"
        verbose_name_plural = "Meeting Attendees"
        db_table = "meeting_attendees"
        constraints = [
            # Esattamente uno tra user e external_email deve essere settato.
            models.CheckConstraint(
                check=(
                    (models.Q(user__isnull=False) & models.Q(external_email__isnull=True))
                    | (models.Q(user__isnull=True) & models.Q(external_email__isnull=False))
                ),
                name="meeting_attendee_user_xor_email",
            ),
        ]
        indexes = [
            # Per "i miei meeting" tramite user_id.
            models.Index(fields=["user", "meeting"], name="meeting_attendee_user_idx"),
            # Reminder dispatcher: scan per status non-declined + reminder non sent.
            models.Index(
                fields=["meeting", "status"],
                name="meeting_attendee_pending_idx",
            ),
        ]

    def __str__(self):
        ident = self.user_id or self.external_email or "?"
        return f"MeetingAttendee<{ident} on {self.meeting_id} status={self.status}>"


class MeetingIssueLink(BaseModel):
    """
    Link M2M tra meeting e issue. Un meeting puo' linkare N issue
    ("Discussione progetti X, Y"); un'issue puo' avere N meeting linkati
    ("Riunioni dove abbiamo parlato di questo task").
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="issue_links",
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="meeting_links",
    )

    class Meta:
        verbose_name = "Meeting Issue Link"
        verbose_name_plural = "Meeting Issue Links"
        db_table = "meeting_issue_links"
        constraints = [
            models.UniqueConstraint(
                fields=["meeting", "issue"],
                name="meeting_issue_link_unique",
            ),
        ]
        indexes = [
            models.Index(fields=["issue"], name="meeting_link_issue_idx"),
        ]

    def __str__(self):
        return f"MeetingIssueLink<{self.meeting_id}<->{self.issue_id}>"
