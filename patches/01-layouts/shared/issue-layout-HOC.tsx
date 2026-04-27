/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.06 - Diagnostic traces dentro IssueLayoutHOC.
 * Questa HOC decide *silenziosamente* di renderizzare uno di tre possibili
 * output:
 *  1) ActiveLoader (se init-loader o count === undefined)
 *  2) IssueLayoutEmptyState (se count === 0 e non CALENDAR)
 *  3) children (il layout vero)
 * Quando il kanban workspace resta "bianco" il colpevole sta probabilmente
 * qui. Aggiungiamo un console.info prima di ogni return con il branch
 * selezionato e i valori chiave, cosi' possiamo distinguere "loader eterno"
 * da "empty state silenzioso" da "children renderizzati ma vuoti".
 */

import { observer } from "mobx-react";
// plane imports
import { EIssueLayoutTypes } from "@plane/types";
// components
import { CalendarLayoutLoader } from "@/components/ui/loader/layouts/calendar-layout-loader";
import { GanttLayoutLoader } from "@/components/ui/loader/layouts/gantt-layout-loader";
import { KanbanLayoutLoader } from "@/components/ui/loader/layouts/kanban-layout-loader";
import { ListLayoutLoader } from "@/components/ui/loader/layouts/list-layout-loader";
import { SpreadsheetLayoutLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// PATCH v1.13: diagnostic file-based logger
import { dlog } from "@/lib/diagnostic-logger";
// local imports
import { IssueLayoutEmptyState } from "./empty-states";

// PATCH v1.13: trace via file logger
const hoctrace = (msg: string, data?: unknown) =>
  dlog("issue-layout-hoc", msg, data);

function ActiveLoader(props: { layout: EIssueLayoutTypes }) {
  const { layout } = props;
  switch (layout) {
    case EIssueLayoutTypes.LIST:
      return <ListLayoutLoader />;
    case EIssueLayoutTypes.KANBAN:
      return <KanbanLayoutLoader />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <SpreadsheetLayoutLoader />;
    case EIssueLayoutTypes.CALENDAR:
      return <CalendarLayoutLoader />;
    case EIssueLayoutTypes.GANTT:
      return <GanttLayoutLoader />;
    default:
      return null;
  }
}

interface Props {
  children: string | React.ReactNode | React.ReactNode[];
  layout: EIssueLayoutTypes;
}

export const IssueLayoutHOC = observer(function IssueLayoutHOC(props: Props) {
  const { layout } = props;

  const storeType = useIssueStoreType();
  const { issues } = useIssues(storeType);

  let issueCount: number | undefined;
  let countThrow: string | undefined;
  try {
    issueCount = issues.getGroupIssueCount(undefined, undefined, false);
  } catch (e) {
    countThrow = (e as Error)?.message || String(e);
  }

  const loader = issues?.getIssueLoader?.();

  hoctrace("decision inputs", {
    layout,
    storeType,
    hasIssues: !!issues,
    loader,
    issueCount,
    countThrow,
    hasChildren: !!props.children,
  });

  if (loader === "init-loader" || issueCount === undefined) {
    hoctrace("→ ActiveLoader", { layout, reason: loader === "init-loader" ? "init-loader" : "count===undefined" });
    return <ActiveLoader layout={layout} />;
  }

  if (issueCount === 0 && layout !== EIssueLayoutTypes.CALENDAR) {
    hoctrace("→ EmptyState", { storeType, layout });
    return <IssueLayoutEmptyState storeType={storeType} />;
  }

  hoctrace("→ children (layout renders)", { layout, issueCount });
  return <>{props.children}</>;
});
