/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Time Tracking settings page.
 *  Rotta: /<workspaceSlug>/settings/time-tracking/
 *
 *  Pattern identico a v1.20d StatesWorkspaceSettingsPage:
 *  Header come prop di SettingsContentWrapper, non standalone.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// patch local
import { TimeTrackingSettingsForm } from "@/components/workspace-time-tracking/settings-form";
import type { Route } from "./+types/page";
import { TimeTrackingSettingsHeader } from "./header";

function TimeTrackingSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - Time tracking`
    : "Time tracking";

  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<TimeTrackingSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title="Time tracking"
          description="Manage how members log work hours and whether logs require admin approval."
        />
        <div className="mt-6">
          <TimeTrackingSettingsForm workspaceSlug={workspaceSlug} isAdmin={isAdmin} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(TimeTrackingSettingsPage);
