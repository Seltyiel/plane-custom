# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.18 - registra endpoint /members/stats/ per Team dashboard.
# PATCH (plane-custom) v1.19b - aggiunta route /members/<uuid>/issues/ per
# lazy-load dei task del singolo membro (tree view).
#
# Aggiunte vs stock:
#   - import di WorkspaceMembersStatsEndpoint (v1.18) e
#     WorkspaceMemberIssuesEndpoint (v1.19b) direttamente dai submodule
#     (non attraverso plane.app.views.__init__.py, cosi' evitiamo di dover
#      patchare anche quel file).
#   - due path():
#       GET /workspaces/<slug>/members/stats/                      (v1.18)
#       GET /workspaces/<slug>/members/<uuid:user_id>/issues/      (v1.19b)
#
# Le route sono al plurale ("members/...") per evitare collisione con il
# gia' esistente "/user-stats/<uuid:user_id>/" e "/user-issues/<uuid>/"
# che sono per la profile page stock (singolo utente, shape diversa).

from django.urls import path


from plane.app.views import (
    UserWorkspaceInvitationsViewSet,
    WorkSpaceViewSet,
    WorkspaceJoinEndpoint,
    WorkSpaceMemberViewSet,
    WorkspaceInvitationsViewset,
    WorkspaceMemberUserEndpoint,
    WorkspaceMemberUserViewsEndpoint,
    WorkSpaceAvailabilityCheckEndpoint,
    UserLastProjectWithWorkspaceEndpoint,
    WorkspaceThemeViewSet,
    WorkspaceUserProfileStatsEndpoint,
    WorkspaceUserActivityEndpoint,
    WorkspaceUserProfileEndpoint,
    WorkspaceUserProfileIssuesEndpoint,
    WorkspaceLabelsEndpoint,
    WorkspaceProjectMemberEndpoint,
    WorkspaceUserPropertiesEndpoint,
    WorkspaceStatesEndpoint,
    WorkspaceEstimatesEndpoint,
    ExportWorkspaceUserActivityEndpoint,
    WorkspaceModulesEndpoint,
    WorkspaceCyclesEndpoint,
    WorkspaceFavoriteEndpoint,
    WorkspaceFavoriteGroupEndpoint,
    WorkspaceDraftIssueViewSet,
    QuickLinkViewSet,
    UserRecentVisitViewSet,
    WorkspaceHomePreferenceViewSet,
    WorkspaceStickyViewSet,
    WorkspaceUserPreferenceViewSet,
)

# PATCH v1.18 - import del nuovo endpoint direttamente dal submodule
# per non dover patchare anche app/views/__init__.py.
from plane.app.views.workspace.team_stats import WorkspaceMembersStatsEndpoint

# PATCH v1.19b - endpoint issues per singolo membro (lazy load tree).
from plane.app.views.workspace.team_issues import WorkspaceMemberIssuesEndpoint

# PATCH v1.20b - workspace shared states CRUD endpoints (extension del file
# stock workspace/state.py, full replacement gestito da build.bat).
# WorkspaceStatesEndpoint e' lo stesso nome dello stock ma esposto dal
# submodule (post-patch v1.20b ha anche POST oltre al GET).
from plane.app.views.workspace.state import (
    WorkspaceStatesEndpoint as _WSEndpointReplaced,  # noqa: F401 (used via stock import)
    WorkspaceStateDetailEndpoint,
    WorkspaceStateMarkDefaultEndpoint,
)

# PATCH v1.22a - endpoint workspace-project (lazy get_or_create del progetto
# fittizio "Workspace" per task workspace-level - Opzione A v1.22).
from plane.app.views.workspace.workspace_project import WorkspaceProjectEndpoint
# PATCH v1.24a: move issue across projects.
from plane.app.views.workspace.issue_move import MoveIssueEndpoint
# PATCH v1.26a: my dashboard KPI endpoint.
from plane.app.views.workspace.dashboard import MyDashboardEndpoint


urlpatterns = [
    path(
        "workspace-slug-check/",
        WorkSpaceAvailabilityCheckEndpoint.as_view(),
        name="workspace-availability",
    ),
    path(
        "workspaces/",
        WorkSpaceViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace",
    ),
    path(
        "workspaces/<str:slug>/",
        WorkSpaceViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="workspace",
    ),
    path(
        "workspaces/<str:slug>/invitations/",
        WorkspaceInvitationsViewset.as_view({"get": "list", "post": "create"}),
        name="workspace-invitations",
    ),
    path(
        "workspaces/<str:slug>/invitations/<uuid:pk>/",
        WorkspaceInvitationsViewset.as_view({"delete": "destroy", "get": "retrieve", "patch": "partial_update"}),
        name="workspace-invitations",
    ),
    # user workspace invitations
    path(
        "users/me/workspaces/invitations/",
        UserWorkspaceInvitationsViewSet.as_view({"get": "list", "post": "create"}),
        name="user-workspace-invitations",
    ),
    path(
        "workspaces/<str:slug>/invitations/<uuid:pk>/join/",
        WorkspaceJoinEndpoint.as_view(),
        name="workspace-join",
    ),
    # user join workspace
    path(
        "workspaces/<str:slug>/members/",
        WorkSpaceMemberViewSet.as_view({"get": "list"}),
        name="workspace-member",
    ),
    # PATCH v1.18 - Team dashboard aggregate stats (plural "members/stats/"
    # per non collidere con "/user-stats/<uuid>/" che e' per singolo utente).
    path(
        "workspaces/<str:slug>/members/stats/",
        WorkspaceMembersStatsEndpoint.as_view(),
        name="workspace-members-stats",
    ),
    # PATCH v1.19b - Team dashboard: lista task attivi del singolo membro per
    # la tree-view espandibile della People page.
    path(
        "workspaces/<str:slug>/members/<uuid:user_id>/issues/",
        WorkspaceMemberIssuesEndpoint.as_view(),
        name="workspace-member-issues",
    ),
    path(
        "workspaces/<str:slug>/project-members/",
        WorkspaceProjectMemberEndpoint.as_view(),
        name="workspace-member-roles",
    ),
    path(
        "workspaces/<str:slug>/members/<uuid:pk>/",
        WorkSpaceMemberViewSet.as_view({"patch": "partial_update", "delete": "destroy", "get": "retrieve"}),
        name="workspace-member",
    ),
    path(
        "workspaces/<str:slug>/members/leave/",
        WorkSpaceMemberViewSet.as_view({"post": "leave"}),
        name="leave-workspace-members",
    ),
    path(
        "users/last-visited-workspace/",
        UserLastProjectWithWorkspaceEndpoint.as_view(),
        name="workspace-project-details",
    ),
    path(
        "workspaces/<str:slug>/workspace-members/me/",
        WorkspaceMemberUserEndpoint.as_view(),
        name="workspace-member-details",
    ),
    path(
        "workspaces/<str:slug>/workspace-views/",
        WorkspaceMemberUserViewsEndpoint.as_view(),
        name="workspace-member-views-details",
    ),
    path(
        "workspaces/<str:slug>/workspace-themes/",
        WorkspaceThemeViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-themes",
    ),
    path(
        "workspaces/<str:slug>/workspace-themes/<uuid:pk>/",
        WorkspaceThemeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-themes",
    ),
    path(
        "workspaces/<str:slug>/user-stats/<uuid:user_id>/",
        WorkspaceUserProfileStatsEndpoint.as_view(),
        name="workspace-user-stats",
    ),
    path(
        "workspaces/<str:slug>/user-activity/<uuid:user_id>/",
        WorkspaceUserActivityEndpoint.as_view(),
        name="workspace-user-activity",
    ),
    path(
        "workspaces/<str:slug>/user-activity/<uuid:user_id>/export/",
        ExportWorkspaceUserActivityEndpoint.as_view(),
        name="export-workspace-user-activity",
    ),
    path(
        "workspaces/<str:slug>/user-profile/<uuid:user_id>/",
        WorkspaceUserProfileEndpoint.as_view(),
        name="workspace-user-profile-page",
    ),
    path(
        "workspaces/<str:slug>/user-issues/<uuid:user_id>/",
        WorkspaceUserProfileIssuesEndpoint.as_view(),
        name="workspace-user-profile-issues",
    ),
    path(
        "workspaces/<str:slug>/labels/",
        WorkspaceLabelsEndpoint.as_view(),
        name="workspace-labels",
    ),
    path(
        "workspaces/<str:slug>/user-properties/",
        WorkspaceUserPropertiesEndpoint.as_view(),
        name="workspace-user-filters",
    ),
    path(
        "workspaces/<str:slug>/states/",
        WorkspaceStatesEndpoint.as_view(),
        name="workspace-state",
    ),
    # PATCH v1.20b: workspace shared state CRUD detail (singolo)
    path(
        "workspaces/<str:slug>/states/<uuid:pk>/",
        WorkspaceStateDetailEndpoint.as_view(),
        name="workspace-state-detail",
    ),
    # PATCH v1.20b: workspace shared state mark-default
    path(
        "workspaces/<str:slug>/states/<uuid:pk>/mark-default/",
        WorkspaceStateMarkDefaultEndpoint.as_view(),
        name="workspace-state-mark-default",
    ),
    # PATCH v1.22a: workspace fictitious project (lazy get_or_create).
    path(
        "workspaces/<str:slug>/workspace-project/",
        WorkspaceProjectEndpoint.as_view(),
        name="workspace-project",
    ),
    # PATCH v1.24a: move issue across projects.
    # Body: {target_project_id, include_sub_issues:bool}
    path(
        "workspaces/<str:slug>/issues/<uuid:issue_id>/move/",
        MoveIssueEndpoint.as_view(),
        name="workspace-issue-move",
    ),
    # PATCH v1.26a: my dashboard KPI endpoint.
    # Query params: ?user_id=<uuid> (default = request.user)
    path(
        "workspaces/<str:slug>/me/dashboard/",
        MyDashboardEndpoint.as_view(),
        name="workspace-my-dashboard",
    ),
    path(
        "workspaces/<str:slug>/estimates/",
        WorkspaceEstimatesEndpoint.as_view(),
        name="workspace-estimate",
    ),
    path(
        "workspaces/<str:slug>/modules/",
        WorkspaceModulesEndpoint.as_view(),
        name="workspace-modules",
    ),
    path(
        "workspaces/<str:slug>/cycles/",
        WorkspaceCyclesEndpoint.as_view(),
        name="workspace-cycles",
    ),
    path(
        "workspaces/<str:slug>/user-favorites/",
        WorkspaceFavoriteEndpoint.as_view(),
        name="workspace-user-favorites",
    ),
    path(
        "workspaces/<str:slug>/user-favorites/<uuid:favorite_id>/",
        WorkspaceFavoriteEndpoint.as_view(),
        name="workspace-user-favorites",
    ),
    path(
        "workspaces/<str:slug>/user-favorites/<uuid:favorite_id>/group/",
        WorkspaceFavoriteGroupEndpoint.as_view(),
        name="workspace-user-favorites-groups",
    ),
    path(
        "workspaces/<str:slug>/draft-issues/",
        WorkspaceDraftIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-draft-issues",
    ),
    path(
        "workspaces/<str:slug>/draft-issues/<uuid:pk>/",
        WorkspaceDraftIssueViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-drafts-issues",
    ),
    path(
        "workspaces/<str:slug>/draft-to-issue/<uuid:draft_id>/",
        WorkspaceDraftIssueViewSet.as_view({"post": "create_draft_to_issue"}),
        name="workspace-drafts-issues",
    ),
    # quick link
    path(
        "workspaces/<str:slug>/quick-links/",
        QuickLinkViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-quick-links",
    ),
    path(
        "workspaces/<str:slug>/quick-links/<uuid:pk>/",
        QuickLinkViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-quick-links",
    ),
    # Widgets
    path(
        "workspaces/<str:slug>/home-preferences/",
        WorkspaceHomePreferenceViewSet.as_view(),
        name="workspace-home-preference",
    ),
    path(
        "workspaces/<str:slug>/home-preferences/<str:key>/",
        WorkspaceHomePreferenceViewSet.as_view(),
        name="workspace-home-preference",
    ),
    path(
        "workspaces/<str:slug>/recent-visits/",
        UserRecentVisitViewSet.as_view({"get": "list"}),
        name="workspace-recent-visits",
    ),
    path(
        "workspaces/<str:slug>/stickies/",
        WorkspaceStickyViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-sticky",
    ),
    path(
        "workspaces/<str:slug>/stickies/<uuid:pk>/",
        WorkspaceStickyViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-sticky",
    ),
    # User Preference
    path(
        "workspaces/<str:slug>/sidebar-preferences/",
        WorkspaceUserPreferenceViewSet.as_view(),
        name="workspace-user-preference",
    ),
]
