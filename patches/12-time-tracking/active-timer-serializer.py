# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33b:
#  Serializer per ActiveTimer. Espone i campi di stato del timer +
#  campi annotati (issue_name, project_identifier, elapsed_seconds)
#  per il banner UI del timer attivo (v1.33d).

from django.utils import timezone
from rest_framework import serializers

from plane.db.models.active_timer import ActiveTimer


class ActiveTimerSerializer(serializers.ModelSerializer):
    # Annotated read-only per il banner UI.
    issue_name = serializers.SerializerMethodField()
    issue_sequence_id = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_identifier = serializers.SerializerMethodField()

    # Secondi trascorsi da started_at a NOW. Lo frontend lo riceve come
    # baseline e poi continua a incrementare client-side ogni 1s; ogni
    # tot polla per resync.
    elapsed_seconds = serializers.SerializerMethodField()

    class Meta:
        model = ActiveTimer
        fields = [
            "id",
            "user",
            "workspace",
            "issue",
            "started_at",
            "description",
            "issue_name",
            "issue_sequence_id",
            "project_id",
            "project_identifier",
            "elapsed_seconds",
        ]
        read_only_fields = fields  # Tutto read-only: scrive solo via endpoint dedicati

    def get_issue_name(self, obj):
        return obj.issue.name if obj.issue else None

    def get_issue_sequence_id(self, obj):
        return obj.issue.sequence_id if obj.issue else None

    def get_project_id(self, obj):
        return str(obj.issue.project_id) if obj.issue else None

    def get_project_identifier(self, obj):
        return obj.issue.project.identifier if obj.issue and obj.issue.project else None

    def get_elapsed_seconds(self, obj):
        delta = timezone.now() - obj.started_at
        return int(delta.total_seconds())
