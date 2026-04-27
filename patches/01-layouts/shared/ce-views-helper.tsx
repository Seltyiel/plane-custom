/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssueLayoutTypes as ELayouts } from "@plane/types";
// components
import { LayoutSelection } from "@/components/issues/issue-layouts/filters/header/layout-selection";
import { WorkspaceCalendarLayout } from "@/components/issues/issue-layouts/calendar/roots/workspace-root";
import { WorkspaceGanttLayout } from "@/components/issues/issue-layouts/gantt/roots/workspace-root";
import { WorkspaceKanBanLayout } from "@/components/issues/issue-layouts/kanban/roots/workspace-root";
import { WorkspaceListLayout } from "@/components/issues/issue-layouts/list/roots/workspace-root";
// PATCH: boundary diagnostico montato qui SOPRA il componente observer
import { WorkspaceLayoutErrorBoundary } from "@/components/issues/issue-layouts/workspace-layout-error-boundary";

type TLayoutSelectionProps = {
  onChange: (layout: ELayouts) => void;
  selectedLayout: ELayouts;
  workspaceSlug?: string;
};

type TWorkspaceLayoutProps = {
  activeLayout: ELayouts | undefined;
  isDefaultView?: boolean;
  isLoading?: boolean;
  toggleLoading?: (value: boolean) => void;
  workspaceSlug?: string;
  globalViewId?: string;
  routeFilters?: { [key: string]: string };
  fetchNextPages?: () => void;
  globalViewsLoading?: boolean;
  issuesLoading?: boolean;
};

export function GlobalViewLayoutSelection(props: TLayoutSelectionProps) {
  const { onChange, selectedLayout } = props;
  return (
    <LayoutSelection
      layouts={[
        ELayouts.LIST,
        ELayouts.KANBAN,
        ELayouts.CALENDAR,
        ELayouts.SPREADSHEET,
        ELayouts.GANTT,
      ]}
      onChange={onChange}
      selectedLayout={selectedLayout}
    />
  );
}

export function WorkspaceAdditionalLayouts(props: TWorkspaceLayoutProps) {
  const { activeLayout } = props;
  // PATCH diagnostic: stampa quale branch del dispatcher sta imboccando.
  // Se la Kanban e' bianca e non vediamo "[plane-custom][dispatcher] KANBAN"
  // significa che activeLayout non e' arrivato a KANBAN.
  // eslint-disable-next-line no-console
  console.info(
    "[plane-custom][dispatcher] activeLayout=",
    activeLayout,
    "→ branch:",
    activeLayout === ELayouts.LIST ? "LIST" :
    activeLayout === ELayouts.KANBAN ? "KANBAN" :
    activeLayout === ELayouts.CALENDAR ? "CALENDAR" :
    activeLayout === ELayouts.GANTT ? "GANTT" :
    activeLayout === ELayouts.SPREADSHEET ? "SPREADSHEET (handled elsewhere)" :
    "EMPTY (no match)"
  );

  if (activeLayout === ELayouts.LIST)
    return (
      <WorkspaceLayoutErrorBoundary key="list" layoutName="WorkspaceListLayout">
        <WorkspaceListLayout />
      </WorkspaceLayoutErrorBoundary>
    );
  if (activeLayout === ELayouts.KANBAN)
    return (
      <WorkspaceLayoutErrorBoundary key="kanban" layoutName="WorkspaceKanBanLayout">
        <WorkspaceKanBanLayout />
      </WorkspaceLayoutErrorBoundary>
    );
  if (activeLayout === ELayouts.CALENDAR)
    return (
      <WorkspaceLayoutErrorBoundary key="calendar" layoutName="WorkspaceCalendarLayout">
        <WorkspaceCalendarLayout />
      </WorkspaceLayoutErrorBoundary>
    );
  if (activeLayout === ELayouts.GANTT)
    return (
      <WorkspaceLayoutErrorBoundary key="gantt" layoutName="WorkspaceGanttLayout">
        <WorkspaceGanttLayout />
      </WorkspaceLayoutErrorBoundary>
    );
  return <></>;
}
