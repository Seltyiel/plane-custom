# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33a:
#  Serializer per TimeLog. Espone tutti i campi rilevanti al frontend
#  + alcuni campi annotati (user_display_name) per evitare round-trip
#  extra al frontend.

from rest_framework import serializers

from plane.db.models.time_log import TimeLog


class TimeLogSerializer(serializers.ModelSerializer):
    # Campi annotati read-only per UX. Il frontend non deve fetchare
    # User separatamente per mostrare "loggato da X".
    user_display_name = serializers.SerializerMethodField()
    user_avatar_url = serializers.SerializerMethodField()
    issue_name = serializers.SerializerMethodField()
    issue_sequence_id = serializers.SerializerMethodField()
    project_identifier = serializers.SerializerMethodField()

    class Meta:
        model = TimeLog
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "user",
            "duration_seconds",
            "logged_at",
            "description",
            "source",
            "timer_started_at",
            "approval_status",
            "approved_by",
            "approved_at",
            "rejection_reason",
            "created_at",
            "updated_at",
            # Read-only annotati
            "user_display_name",
            "user_avatar_url",
            "issue_name",
            "issue_sequence_id",
            "project_identifier",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "user",
            # Approval campi: solo via endpoint /approve/ /reject/, non via PATCH
            # generico. Esposti read-only per evitare update lateral.
            "approval_status",
            "approved_by",
            "approved_at",
            "rejection_reason",
            "created_at",
            "updated_at",
            # Source: settato dal server (manual via POST normale, timer
            # via stop endpoint). Mai writable da client.
            "source",
            "timer_started_at",
        ]

    def get_user_display_name(self, obj):
        if not obj.user:
            return None
        u = obj.user
        return u.display_name or f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email

    def get_user_avatar_url(self, obj):
        if not obj.user:
            return None
        return getattr(obj.user, "avatar_url", None)

    def get_issue_name(self, obj):
        return obj.issue.name if obj.issue else None

    def get_issue_sequence_id(self, obj):
        return obj.issue.sequence_id if obj.issue else None

    def get_project_identifier(self, obj):
        return obj.project.identifier if obj.project else None

    def validate_duration_seconds(self, value):
        # CheckConstraint a livello DB blocca range invalidi, ma diamo
        # errore HTTP 400 user-friendly invece di 500 da DB.
        if value <= 0:
            raise serializers.ValidationError("Duration must be positive (in seconds).")
        if value > 86400 * 7:
            raise serializers.ValidationError("Duration cannot exceed 7 days.")
        return value
