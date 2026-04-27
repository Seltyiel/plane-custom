/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.12 - Clone 1:1 del root Kanban di Profile/Your
 * Work (apps/web/core/components/issues/issue-layouts/kanban/roots/profile-issues-root.tsx).
 * Profile Kanban e' il root STOCK che funziona in scope workspace-level
 * (PROFILE). isWorkspaceLevel(PROFILE) === true come isWorkspaceLevel(GLOBAL),
 * quindi condividono il codepath per workspaceStates / workspaceMemberIds.
 * v1.11 clonava project-root (scope PROJECT): era un errore, Project non
 * passa viewId a BaseKanBanRoot e lo store GLOBAL ha bisogno di viewId per
 * sapere quale vista fetchare. Profile lo passa (profileViewId), qui usiamo
 * globalViewId.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseKanBanRoot } from "../base-kanban-root";

export const WorkspaceKanBanLayout = observer(function WorkspaceKanBanLayout() {
  // router
  const { workspaceSlug, globalViewId } = useParams();
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
    <BaseKanBanRoot
      QuickActions={ProjectIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
      viewId={globalViewId?.toString()}
    />
  );
});
