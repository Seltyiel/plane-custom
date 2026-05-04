/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34g:
 *  Meetings workspace settings page.
 *  Rotta: /<workspaceSlug>/settings/meetings/
 *
 *  Pattern identico a v1.33f time-tracking-settings-page.
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
import { MeetingsSettingsForm } from "@/components/workspace-meetings/settings-form";
import type { Route } from "./+types/page";
import { MeetingsSettingsHeader } from "./header";

function MeetingsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - Meetings`
    : "Meetings";

  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<MeetingsSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title="Meetings"
          description="Manage meeting visibility and audit policies for the workspace."
        />
        <div className="mt-6">
          <MeetingsSettingsForm workspaceSlug={workspaceSlug} isAdmin={isAdmin} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(MeetingsSettingsPage);
