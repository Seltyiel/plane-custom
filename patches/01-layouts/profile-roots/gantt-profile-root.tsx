/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// local imports
import { BaseGanttRoot } from "../base-gantt-root";

export const ProfileIssuesGanttLayout = observer(function ProfileIssuesGanttLayout() {
  // router
  const { profileViewId } = useParams();

  return <BaseGanttRoot viewId={profileViewId?.toString()} />;
});
