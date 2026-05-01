/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Header della Time Tracking settings page.
 *  Stesso pattern di StatesWorkspaceSettingsHeader (v1.20d).
 */

import { observer } from "mobx-react";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";

export const TimeTrackingSettingsHeader = observer(function TimeTrackingSettingsHeader() {
  const Icon = WORKSPACE_SETTINGS_ICONS["time-tracking"];

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Time tracking"
                  icon={Icon ? <Icon className="size-4 text-tertiary" /> : null}
                />
              }
            />
          </Breadcrumbs>
        </div>
      }
    />
  );
});
