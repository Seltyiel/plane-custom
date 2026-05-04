/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19 + v1.33f + v1.34d:
 *  - v1.19: People page (/people).
 *  - v1.33f: Timesheet (/timesheet) + Time tracking settings (/settings/time-tracking).
 *  - v1.34d: Meetings page (/meetings).
 */

import { index, layout, route } from "@react-router/dev/routes";
import type { RouteConfig, RouteConfigEntry } from "@react-router/dev/routes";

export const coreRoutes: RouteConfigEntry[] = [
  layout("./(home)/layout.tsx", [index("./(home)/page.tsx")]),
  layout("./(all)/sign-up/layout.tsx", [route("sign-up", "./(all)/sign-up/page.tsx")]),
  layout("./(all)/accounts/forgot-password/layout.tsx", [
    route("accounts/forgot-password", "./(all)/accounts/forgot-password/page.tsx"),
  ]),
  layout("./(all)/accounts/reset-password/layout.tsx", [
    route("accounts/reset-password", "./(all)/accounts/reset-password/page.tsx"),
  ]),
  layout("./(all)/accounts/set-password/layout.tsx", [
    route("accounts/set-password", "./(all)/accounts/set-password/page.tsx"),
  ]),
  layout("./(all)/create-workspace/layout.tsx", [route("create-workspace", "./(all)/create-workspace/page.tsx")]),
  layout("./(all)/onboarding/layout.tsx", [route("onboarding", "./(all)/onboarding/page.tsx")]),
  layout("./(all)/invitations/layout.tsx", [route("invitations", "./(all)/invitations/page.tsx")]),
  layout("./(all)/workspace-invitations/layout.tsx", [
    route("workspace-invitations", "./(all)/workspace-invitations/page.tsx"),
  ]),

  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        route(":workspaceSlug", "./(all)/[workspaceSlug]/(projects)/page.tsx"),

        layout("./(all)/[workspaceSlug]/(projects)/active-cycles/layout.tsx", [
          route(":workspaceSlug/active-cycles", "./(all)/[workspaceSlug]/(projects)/active-cycles/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/analytics/[tabId]/layout.tsx", [
          route(":workspaceSlug/analytics/:tabId", "./(all)/[workspaceSlug]/(projects)/analytics/[tabId]/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/browse/[workItem]/layout.tsx", [
          route(":workspaceSlug/browse/:workItem", "./(all)/[workspaceSlug]/(projects)/browse/[workItem]/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/drafts/layout.tsx", [
          route(":workspaceSlug/drafts", "./(all)/[workspaceSlug]/(projects)/drafts/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/notifications/layout.tsx", [
          route(":workspaceSlug/notifications", "./(all)/[workspaceSlug]/(projects)/notifications/page.tsx"),
        ]),

        // PATCH v1.19: People page (Team dashboard).
        layout("./(all)/[workspaceSlug]/(projects)/people/layout.tsx", [
          route(":workspaceSlug/people", "./(all)/[workspaceSlug]/(projects)/people/page.tsx"),
        ]),

        // PATCH v1.33f: Timesheet (Time Tracking report).
        layout("./(all)/[workspaceSlug]/(projects)/timesheet/layout.tsx", [
          route(":workspaceSlug/timesheet", "./(all)/[workspaceSlug]/(projects)/timesheet/page.tsx"),
        ]),

        // PATCH v1.34d: Meetings page (calendar/list).
        layout("./(all)/[workspaceSlug]/(projects)/meetings/layout.tsx", [
          route(":workspaceSlug/meetings", "./(all)/[workspaceSlug]/(projects)/meetings/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/profile/[userId]/layout.tsx", [
          route(":workspaceSlug/profile/:userId", "./(all)/[workspaceSlug]/(projects)/profile/[userId]/page.tsx"),
          route(
            ":workspaceSlug/profile/:userId/:profileViewId",
            "./(all)/[workspaceSlug]/(projects)/profile/[userId]/[profileViewId]/page.tsx"
          ),
          route(
            ":workspaceSlug/profile/:userId/activity",
            "./(all)/[workspaceSlug]/(projects)/profile/[userId]/activity/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/stickies/layout.tsx", [
          route(":workspaceSlug/stickies", "./(all)/[workspaceSlug]/(projects)/stickies/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/workspace-views/layout.tsx", [
          route(":workspaceSlug/workspace-views", "./(all)/[workspaceSlug]/(projects)/workspace-views/page.tsx"),
          route(
            ":workspaceSlug/workspace-views/:globalViewId",
            "./(all)/[workspaceSlug]/(projects)/workspace-views/[globalViewId]/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/archives/layout.tsx", [
          route(
            ":workspaceSlug/projects/archives",
            "./(all)/[workspaceSlug]/(projects)/projects/(detail)/archives/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(list)/layout.tsx", [
          route(":workspaceSlug/projects", "./(all)/[workspaceSlug]/(projects)/projects/(list)/page.tsx"),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/layout.tsx", [
          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/issues/(list)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/issues",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/issues/(list)/page.tsx"
            ),
          ]),
          route(
            ":workspaceSlug/projects/:projectId/issues/:issueId",
            "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/issues/(detail)/[issueId]/page.tsx"
          ),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/cycles/(detail)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/cycles/:cycleId",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/cycles/(detail)/[cycleId]/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/cycles/(list)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/cycles",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/cycles/(list)/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/modules/(detail)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/modules/:moduleId",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/modules/(detail)/[moduleId]/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/modules/(list)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/modules",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/modules/(list)/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/views/(detail)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/views/:viewId",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/views/(detail)/[viewId]/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/views/(list)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/views",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/views/(list)/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(detail)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/pages/:pageId",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(detail)/[pageId]/page.tsx"
            ),
          ]),

          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(list)/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/pages",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(list)/page.tsx"
            ),
          ]),
          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/intake/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/intake",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/intake/page.tsx"
            ),
          ]),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/issues/(list)/layout.tsx", [
          route(
            ":workspaceSlug/projects/:projectId/archives/issues",
            "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/issues/(list)/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/issues/(detail)/layout.tsx", [
          route(
            ":workspaceSlug/projects/:projectId/archives/issues/:archivedIssueId",
            "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/issues/(detail)/[archivedIssueId]/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/cycles/layout.tsx", [
          route(
            ":workspaceSlug/projects/:projectId/archives/cycles",
            "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/cycles/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/modules/layout.tsx", [
          route(
            ":workspaceSlug/projects/:projectId/archives/modules",
            "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/archives/modules/page.tsx"
          ),
        ]),
      ]),

      layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
        layout("./(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout.tsx", [
          route(":workspaceSlug/settings", "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/page.tsx"),
          route(
            ":workspaceSlug/settings/members",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx"
          ),
          route(
            ":workspaceSlug/settings/billing",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/billing/page.tsx"
          ),
          route(
            ":workspaceSlug/settings/exports",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/exports/page.tsx"
          ),
          route(
            ":workspaceSlug/settings/webhooks",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/webhooks/page.tsx"
          ),
          route(
            ":workspaceSlug/settings/webhooks/:webhookId",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/webhooks/[webhookId]/page.tsx"
          ),
          // PATCH v1.20d: Workspace States.
          route(
            ":workspaceSlug/settings/states",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/states/page.tsx"
          ),
          // PATCH v1.33f: Time tracking settings.
          route(
            ":workspaceSlug/settings/time-tracking",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/time-tracking/page.tsx"
          ),
        ]),

        layout("./(all)/[workspaceSlug]/(settings)/settings/projects/layout.tsx", [
          route(":workspaceSlug/settings/projects", "./(all)/[workspaceSlug]/(settings)/settings/projects/page.tsx"),
          layout("./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/layout.tsx", [
            route(
              ":workspaceSlug/settings/projects/:projectId",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/members",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/members/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/features/cycles",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/cycles/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/features/modules",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/modules/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/features/views",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/views/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/features/pages",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/pages/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/features/intake",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/features/intake/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/states",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/labels",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/labels/page.tsx"
            ),
            route(
              ":workspaceSlug/settings/projects/:projectId/estimates",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/estimates/page.tsx"
            ),
            layout("./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/automations/layout.tsx", [
              route(
                ":workspaceSlug/settings/projects/:projectId/automations",
                "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/automations/page.tsx"
              ),
            ]),
          ]),
        ]),
      ]),
    ]),

    layout("./(all)/settings/profile/layout.tsx", [
      route("settings/profile/:profileTabId", "./(all)/settings/profile/[profileTabId]/page.tsx"),
    ]),
  ]),

  route(":workspaceSlug/projects/:projectId/settings/*", "routes/redirects/core/project-settings.tsx"),
  route(":workspaceSlug/analytics", "routes/redirects/core/analytics.tsx"),
  route(":workspaceSlug/settings/api-tokens", "routes/redirects/core/api-tokens.tsx"),
  route(":workspaceSlug/projects/:projectId/inbox", "routes/redirects/core/inbox.tsx"),
  route("accounts/sign-up", "routes/redirects/core/accounts-signup.tsx"),
  route("sign-in", "routes/redirects/core/sign-in.tsx"),
  route("signin", "routes/redirects/core/signin.tsx"),
  route("login", "routes/redirects/core/login.tsx"),
  route("register", "routes/redirects/core/register.tsx"),
  route("profile/*", "routes/redirects/core/profile-settings.tsx"),
  route(":workspaceSlug/settings/account/*", "routes/redirects/core/workspace-account-settings.tsx"),
] satisfies RouteConfig;
