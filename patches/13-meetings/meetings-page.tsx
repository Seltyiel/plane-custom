/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d:
 *  Meetings page - workspace level. Rotta: /<workspaceSlug>/meetings/
 *  Mounta MeetingsRoot.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { MeetingsRoot } from "@/components/meetings/root";

function MeetingsPage() {
  const { currentWorkspace } = useWorkspace();
  return (
    <>
      <PageHead title={`${currentWorkspace?.name ?? "Workspace"} - Meetings`} />
      <MeetingsRoot />
    </>
  );
}

export default observer(MeetingsPage);
