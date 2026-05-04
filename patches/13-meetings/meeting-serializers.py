# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.34a + v1.35a-1:
#  v1.34a: serializers per Meeting / MeetingAttendee / MeetingIssueLink.
#  v1.35a-1: validazione `recurrence_rule` come RRULE iCalendar parsabile.

from rest_framework import serializers

from plane.db.models.meeting import Meeting, MeetingAttendee, MeetingIssueLink


class MeetingAttendeeSerializer(serializers.ModelSerializer):
    """Espone l'attendee con i campi denormalizzati per la UI."""

    user_display_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    user_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = MeetingAttendee
        fields = [
            "id",
            "meeting",
            "user",
            "external_email",
            "display_name",
            "status",
            "rsvp_comment",
            "responded_at",
            "reminder_minutes_before",
            "invitation_email_sent_at",
            "reminder_email_sent_at",
            "reminder_inapp_sent_at",
            # rsvp_token NON e' esposto: sensibile (auth via magic link in v1.35b)
            "user_display_name",
            "user_email",
            "user_avatar_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "meeting",
            "responded_at",
            "invitation_email_sent_at",
            "reminder_email_sent_at",
            "reminder_inapp_sent_at",
            "created_at",
            "updated_at",
        ]

    def get_user_display_name(self, obj):
        if obj.user:
            u = obj.user
            return u.display_name or f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        return obj.display_name or obj.external_email or ""

    def get_user_email(self, obj):
        return obj.user.email if obj.user else obj.external_email

    def get_user_avatar_url(self, obj):
        return getattr(obj.user, "avatar_url", None) if obj.user else None


class MeetingIssueLinkSerializer(serializers.ModelSerializer):
    """Espone il link meeting<->issue con identifier issue per UI."""

    issue_name = serializers.SerializerMethodField()
    issue_sequence_id = serializers.SerializerMethodField()
    project_identifier = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()

    class Meta:
        model = MeetingIssueLink
        fields = [
            "id",
            "meeting",
            "issue",
            "issue_name",
            "issue_sequence_id",
            "project_identifier",
            "project_id",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_issue_name(self, obj):
        return obj.issue.name if obj.issue else None

    def get_issue_sequence_id(self, obj):
        return obj.issue.sequence_id if obj.issue else None

    def get_project_identifier(self, obj):
        return obj.issue.project.identifier if obj.issue and obj.issue.project else None

    def get_project_id(self, obj):
        return str(obj.issue.project_id) if obj.issue else None


class MeetingSerializer(serializers.ModelSerializer):
    """
    Espone il meeting con attendees e issue_links nested per ridurre
    round-trip frontend.
    """

    attendees = MeetingAttendeeSerializer(many=True, read_only=True)
    issue_links = MeetingIssueLinkSerializer(many=True, read_only=True)

    # Annotated per UI rapida
    creator_display_name = serializers.SerializerMethodField()
    is_cancelled = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id",
            "workspace",
            "project",
            "title",
            "description",
            "location",
            "start_at",
            "end_at",
            "all_day",
            "timezone",
            "reminder_minutes_before",
            # Recurrence (v1.35, exposed but not used yet in v1.34)
            "recurrence_rule",
            "recurrence_until",
            "excluded_dates",
            "parent_meeting",
            # Cancellation
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            # Audit
            "created_by",
            "created_at",
            "updated_at",
            # Nested
            "attendees",
            "issue_links",
            # Annotated
            "creator_display_name",
            "is_cancelled",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def get_creator_display_name(self, obj):
        if not obj.created_by:
            return None
        u = obj.created_by
        return u.display_name or f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email

    def get_is_cancelled(self, obj):
        return obj.cancelled_at is not None

    def validate(self, attrs):
        # end_at >= start_at e' un CheckConstraint a livello DB, ma diamo
        # errore HTTP 400 user-friendly.
        start_at = attrs.get("start_at") or (self.instance.start_at if self.instance else None)
        end_at = attrs.get("end_at") or (self.instance.end_at if self.instance else None)
        if start_at and end_at and end_at < start_at:
            raise serializers.ValidationError({"end_at": "End must be at or after start."})

        # Reminder positivo
        reminder = attrs.get("reminder_minutes_before")
        if reminder is not None and reminder < 0:
            raise serializers.ValidationError(
                {"reminder_minutes_before": "Must be 0 or positive."}
            )

        # v1.35a-1: validazione recurrence_rule come RRULE iCalendar.
        # Whitelist conservativa di FREQ (no MINUTELY/SECONDLY) per evitare
        # rule abusive. Test parsabilita' con dateutil.rrule.rrulestr.
        rrule_str = attrs.get("recurrence_rule")
        if rrule_str:
            allowed_freq = {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}
            # FREQ=XXX deve essere presente.
            tokens = {kv.split("=")[0].upper(): kv.split("=")[1].upper()
                      for kv in rrule_str.split(";") if "=" in kv}
            if "FREQ" not in tokens or tokens["FREQ"] not in allowed_freq:
                raise serializers.ValidationError({
                    "recurrence_rule": (
                        "FREQ must be one of: DAILY, WEEKLY, MONTHLY, YEARLY."
                    ),
                })
            try:
                from dateutil.rrule import rrulestr
                # dtstart fittizio solo per parse-test.
                rrulestr(
                    rrule_str,
                    dtstart=start_at or (self.instance.start_at if self.instance else None),
                )
            except ImportError:
                # python-dateutil non disponibile: skippiamo la validazione,
                # la chiamata di expand fallira' silenziosamente piu' tardi.
                pass
            except Exception as exc:
                raise serializers.ValidationError({
                    "recurrence_rule": f"Invalid RRULE: {exc}",
                })

        return attrs


class MeetingLightSerializer(serializers.ModelSerializer):
    """
    Versione "audit mode" per workspace admin con flag
    `meetings_admin_audit_mode=true`. Espone solo metadati (no description,
    no location, no attendee details). Vedi v1.34b view permission.
    """

    creator_display_name = serializers.SerializerMethodField()
    attendee_count = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id",
            "title",
            "start_at",
            "end_at",
            "all_day",
            "creator_display_name",
            "attendee_count",
        ]

    def get_creator_display_name(self, obj):
        if not obj.created_by:
            return None
        u = obj.created_by
        return u.display_name or f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email

    def get_attendee_count(self, obj):
        # NB: include sia user-attendees che external. Non leak email/identita'.
        return obj.attendees.count()
