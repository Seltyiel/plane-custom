/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Timesheet report page - workspace level.
 *  Rotta: /<workspaceSlug>/timesheet/
 *
 *  Filtri: user (admin only) / project / period / approval status.
 *  Summary cards: total / approved / pending hours.
 *  Tabella log con bottoni Approve/Reject (admin only) per i pending.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { TimesheetRoot } from "@/components/timesheet/root";
import type { Route } from "./+types/page";

function TimesheetPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();

  return (
    <>
      <PageHead title={`${currentWorkspace?.name ?? "Workspace"} - Timesheet`} />
      <TimesheetRoot workspaceSlug={workspaceSlug} />
    </>
  );
}

export default observer(TimesheetPage);
