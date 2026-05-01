# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33e:
#  Endpoint GET/PATCH per leggere/scrivere workspace feature settings.
#
#  Routes:
#   GET   /workspaces/<slug>/feature-settings/  -> {features: {...}}
#                                                  Tutti i workspace member
#                                                  vedono i settings ^reduce
#                                                  policy: e' info utile
#                                                  per UI conditional render.
#   PATCH /workspaces/<slug>/feature-settings/  body: {features: {key: val}}
#                                                Solo ADMIN. Merge sui settings
#                                                esistenti, no replace totale
#                                                (per non perdere altri flag
#                                                gia' settati).

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace
from plane.db.models.workspace_feature_settings import WorkspaceFeatureSettings


class WorkspaceFeatureSettingsEndpoint(BaseAPIView):
    """
    GET   /workspaces/<slug>/feature-settings/
    PATCH /workspaces/<slug>/feature-settings/   body: {features: {key: val, ...}}
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        settings_obj = WorkspaceFeatureSettings.objects.filter(workspace=workspace).first()
        features = settings_obj.features if settings_obj else {}
        return Response({"features": features}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        incoming = request.data.get("features", {})
        if not isinstance(incoming, dict):
            return Response(
                {"error": "features must be an object"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Merge invece di replace. Cosi' settando time_tracking_enabled
        # non perdi meetings_enabled gia' settato in passato.
        settings_obj, _created = WorkspaceFeatureSettings.objects.get_or_create(
            workspace=workspace,
            defaults={"features": {}},
        )
        merged = {**settings_obj.features, **incoming}
        settings_obj.features = merged
        settings_obj.save()

        return Response({"features": settings_obj.features}, status=status.HTTP_200_OK)
