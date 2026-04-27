/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.16 - rimuovere la fetchIssues redundante di
 * AllIssueLayoutRoot.
 *
 * ROOT CAUSE DEL BUG CALENDAR (workspace views):
 * All'apertura della pagina workspace views, DUE fetch partono in parallelo:
 *   A) La fetch del layout-specific root (es. BaseCalendarRoot useEffect)
 *      che passa le opzioni giuste per quel layout:
 *      { groupedBy: "target_date", perPageCount: 4, before, after } per Calendar
 *      { canGroup: false, perPageCount: 100 } per Spreadsheet/Gantt
 *      ecc.
 *   B) La fetch SWR di AllIssueLayoutRoot che NON conosce il layout attivo
 *      e usa SEMPRE { canGroup: false, perPageCount: 100 }.
 *
 * La fetch B sovrascrive la fetch A. Per Spreadsheet/Gantt/List questo e'
 * innocuo (nessun grouping server-side serve). Per Calendar e' fatale:
 * il Calendar si aspetta la risposta raggruppata per target_date
 * (bucketing giornaliero), ma riceve un array piatto -> calendario vuoto.
 * Per Kanban e' parzialmente innocuo perche' lo store bucketta lato client
 * su state__group dal campo presente nel record.
 *
 * LOG DIAGNOSTICO v1.13 che ha confermato:
 *   seq 4:  getFilterParams FINAL -> backend
 *           group_by: "target_date", per_page: "4"    <- fetch A (Calendar)
 *   seq 15: getFilterParams FINAL -> backend
 *           per_page: "100", no group_by              <- fetch B (SWR root)
 *   seq 19: layout renders, issueCount: 5             <- risposta di B vince
 *
 * FIX:
 * Ogni base root di layout (list/kanban/calendar/spreadsheet/gantt) ha gia'
 * la propria fetchIssues nel useEffect con le opzioni corrette. La fetchIssues
 * della SWR in AllIssueLayoutRoot e' quindi RIDONDANTE. La rimuoviamo e
 * teniamo solo fetchFilters (che serve al primo caricamento della pagina).
 *
 * Non tocchiamo il ramo isLoading della SWR: resta true mentre fetchFilters
 * e' in-flight e diventa false quando i filtri sono caricati. Il loading
 * degli issue e' gestito dal base root.
 */

import React, { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { GLOBAL_VIEW_TRACKER_ELEMENTS, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { EIssueLayoutTypes } from "@plane/types";
import { EIssuesStoreType, STATIC_VIEW_TYPES } from "@plane/types";
// assets
// components
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { WorkspaceActiveLayout } from "@/components/views/helper";
import { WorkspaceLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/workspace-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useGlobalView } from "@/hooks/store/use-global-view";
import { useIssues } from "@/hooks/store/use-issues";
import { useAppRouter } from "@/hooks/use-app-router";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";

type Props = {
  isDefaultView: boolean;
  isLoading?: boolean;
  toggleLoading: (value: boolean) => void;
};

export const AllIssueLayoutRoot = observer(function AllIssueLayoutRoot(props: Props) {
  const { isDefaultView, isLoading = false, toggleLoading } = props;
  // router
  const router = useAppRouter();
  const { workspaceSlug: routerWorkspaceSlug, globalViewId: routerGlobalViewId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const globalViewId = routerGlobalViewId ? routerGlobalViewId.toString() : undefined;
  // search params
  const searchParams = useSearchParams();
  // store hooks
  const {
    issuesFilter: { filters, fetchFilters, updateFilterExpression },
    issues: { fetchNextIssues },
  } = useIssues(EIssuesStoreType.GLOBAL);
  const { fetchAllGlobalViews, getViewDetailsById } = useGlobalView();
  // Derived values
  const viewDetails = globalViewId ? getViewDetailsById(globalViewId) : undefined;
  const workItemFilters = globalViewId ? filters?.[globalViewId] : undefined;
  const activeLayout: EIssueLayoutTypes | undefined = workItemFilters?.displayFilters?.layout;
  // Determine initial work item filters based on view type and availability
  const initialWorkItemFilters = useMemo(() => {
    if (!globalViewId) return undefined;

    const isStaticView = STATIC_VIEW_TYPES.includes(globalViewId);
    const hasViewDetails = Boolean(viewDetails);

    if (!isStaticView && !hasViewDetails) return undefined;

    return {
      displayFilters: workItemFilters?.displayFilters,
      displayProperties: workItemFilters?.displayProperties,
      kanbanFilters: workItemFilters?.kanbanFilters,
      richFilters: viewDetails?.rich_filters ?? {},
    };
  }, [globalViewId, viewDetails, workItemFilters]);

  // Custom hooks
  useWorkspaceIssueProperties(workspaceSlug);

  // Route filters
  const routeFilters: { [key: string]: string } = {};
  searchParams.forEach((value: string, key: string) => {
    routeFilters[key] = value;
  });

  // Fetch next pages callback
  const fetchNextPages = useCallback(() => {
    if (workspaceSlug && globalViewId) fetchNextIssues(workspaceSlug, globalViewId);
  }, [fetchNextIssues, workspaceSlug, globalViewId]);

  // Fetch global views
  const { isLoading: globalViewsLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_GLOBAL_VIEWS_${workspaceSlug}` : null,
    async () => {
      if (workspaceSlug) {
        await fetchAllGlobalViews(workspaceSlug);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // PATCH v1.16: fetch SOLO i filtri qui. La fetchIssues e' stata rimossa:
  // ogni base root di layout (list/kanban/calendar/spreadsheet/gantt) si occupa
  // di fetchare le issue con le opzioni corrette per quel layout. La vecchia
  // fetchIssues di questa SWR usava sempre {canGroup: false, perPageCount: 100}
  // e finiva per sovrascrivere la fetch del Calendar (che richiede grouping per
  // target_date con perPage=4) -> calendario vuoto. Vedi commento in testa al file.
  const { isLoading: issuesLoading } = useSWR(
    workspaceSlug && globalViewId ? `WORKSPACE_GLOBAL_VIEW_FILTERS_${workspaceSlug}_${globalViewId}` : null,
    async () => {
      if (workspaceSlug && globalViewId) {
        toggleLoading(true);
        await fetchFilters(workspaceSlug, globalViewId);
        toggleLoading(false);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // Empty state
  if (!isLoading && !globalViewsLoading && !issuesLoading && !viewDetails && !isDefaultView) {
    return (
      <EmptyStateDetailed
        title="View does not exist"
        description="The view you are looking for does not exist or you don't have permission to view it."
        assetKey="view"
        actions={[
          {
            label: "Go to All work items",
            onClick: () => router.push(`/${workspaceSlug}/workspace-views/all-issues`),
            variant: "primary",
          },
        ]}
      />
    );
  }

  if (!workspaceSlug || !globalViewId) return null;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.GLOBAL}>
      <WorkspaceLevelWorkItemFiltersHOC
        enableSaveView
        saveViewOptions={{
          label: "Save as",
        }}
        enableUpdateView
        entityId={globalViewId}
        entityType={EIssuesStoreType.GLOBAL}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.my_issues.filters}
        initialWorkItemFilters={initialWorkItemFilters}
        updateFilters={updateFilterExpression.bind(updateFilterExpression, workspaceSlug, globalViewId)}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: globalWorkItemsFilter }) => (
          <div className="h-full overflow-hidden bg-surface-1">
            <div className="flex h-full w-full flex-col border-b border-strong">
              {globalWorkItemsFilter && (
                <WorkItemFiltersRow
                  filter={globalWorkItemsFilter}
                  trackerElements={{
                    saveView: GLOBAL_VIEW_TRACKER_ELEMENTS.HEADER_SAVE_VIEW_BUTTON,
                  }}
                />
              )}
              <WorkspaceActiveLayout
                activeLayout={activeLayout}
                isDefaultView={isDefaultView}
                isLoading={isLoading}
                toggleLoading={toggleLoading}
                workspaceSlug={workspaceSlug}
                globalViewId={globalViewId}
                routeFilters={routeFilters}
                fetchNextPages={fetchNextPages}
                globalViewsLoading={globalViewsLoading}
                issuesLoading={issuesLoading}
              />
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </div>
        )}
      </WorkspaceLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
