/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";
// local imports
import { AllIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseCalendarRoot } from "../base-calendar-root";

// NOTA: il boundary ora vive nel dispatcher (WorkspaceAdditionalLayouts).

export const WorkspaceCalendarLayout = observer(function WorkspaceCalendarLayout() {
  // router
  const { workspaceSlug, globalViewId } = useParams();
  // PATCH: fetcha workspace-level properties (modules/cycles/labels/estimates)
  useWorkspaceIssueProperties(workspaceSlug);
  // hooks
  const { allowPermissions } = useUserPermissions();

  const canEditPropertiesBasedOnProject = (projectId: string) =>
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug?.toString(),
      projectId
    );

  return (
    <BaseCalendarRoot
      QuickActions={AllIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
      viewId={globalViewId?.toString()}
    />
  );
});
