/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20d:
 *  Header per la pagina Workspace Settings -> States.
 *
 *  PATCH v1.20d hotfix #1: stringa statica "States" invece di t().
 */

import { observer } from "mobx-react";
import { Breadcrumbs } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";

export const StatesWorkspaceSettingsHeader = observer(function StatesWorkspaceSettingsHeader() {
  const Icon = WORKSPACE_SETTINGS_ICONS["states"];

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="States"
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
