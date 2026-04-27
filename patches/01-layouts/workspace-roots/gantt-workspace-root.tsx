/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";
// local imports
import { BaseGanttRoot } from "../base-gantt-root";

// NOTA: il boundary ora vive nel dispatcher (WorkspaceAdditionalLayouts).

export const WorkspaceGanttLayout = observer(function WorkspaceGanttLayout() {
  // router
  const { workspaceSlug, globalViewId } = useParams();
  // PATCH: fetcha workspace-level properties (modules/cycles/labels/estimates)
  useWorkspaceIssueProperties(workspaceSlug);

  return <BaseGanttRoot viewId={globalViewId?.toString()} />;
});
