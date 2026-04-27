/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.13 - Diagnostic traces inside Kanban default.tsx.
 *
 * Obiettivo: sapere se la schermata bianca della Workspace Kanban dipende
 * dal famoso early return `if (!list) return null` (cioe' getGroupByColumns
 * torna undefined) o se invece `list` arriva popolata ma groupedIssueIds
 * e' vuoto. Logghiamo:
 *  - props ricevute (group_by, sub_group_by, orderBy, showEmptyGroup,
 *    keys di groupedIssueIds)
 *  - storeType risolto tramite useIssueStoreType()
 *  - isWorkspaceLevel(storeType)
 *  - risultato di getGroupByColumns (con length e primi id)
 *  - ramo selezionato: "return null" oppure "rendering N columns"
 *
 * Tutte le tracce vanno a http://localhost:9999/log (diagnostic-server.js)
 * via dlog e su console. Nessun cambio al comportamento funzionale: il JSX
 * e' identico allo stock.
 */

import type { MutableRefObject } from "react";
import { observer } from "mobx-react";
import type {
  GroupByColumnTypes,
  IGroupByColumn,
  TGroupedIssues,
  TIssue,
  IIssueDisplayProperties,
  IIssueMap,
  TSubGroupedIssues,
  TIssueKanbanFilters,
  TIssueGroupByOptions,
  TIssueOrderByOptions,
} from "@plane/types";
// constants
import { ContentWrapper } from "@plane/ui";
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { KanbanColumnLoader } from "@/components/ui/loader/layouts/kanban-layout-loader";
// hooks
import { useKanbanView } from "@/hooks/store/use-kanban-view";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// PATCH v1.13: diagnostic file-based logger
import { dlog } from "@/lib/diagnostic-logger";
// types
// parent components
import { useWorkFlowFDragNDrop } from "@/plane-web/components/workflow";
import type { TRenderQuickActions } from "../list/list-view-types";
import type { GroupDropLocation } from "../utils";
import { getGroupByColumns, isWorkspaceLevel, getApproximateCardHeight } from "../utils";
// components
import { HeaderGroupByCard } from "./headers/group-by-card";
import { KanbanGroup } from "./kanban-group";

// PATCH v1.13: trace helper (alias su dlog file-based)
const ktrace = (msg: string, data?: unknown) => dlog("kanban-default", msg, data);

export interface IKanBan {
  issuesMap: IIssueMap;
  groupedIssueIds: TGroupedIssues | TSubGroupedIssues;
  getGroupIssueCount: (
    groupId: string | undefined,
    subGroupId: string | undefined,
    isSubGroupCumulative: boolean
  ) => number | undefined;
  displayProperties: IIssueDisplayProperties | undefined;
  sub_group_by: TIssueGroupByOptions | undefined;
  group_by: TIssueGroupByOptions | undefined;
  orderBy: TIssueOrderByOptions | undefined;
  isDropDisabled?: boolean;
  dropErrorMessage?: string | undefined;
  sub_group_id?: string;
  sub_group_index?: number;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  collapsedGroups: TIssueKanbanFilters;
  handleCollapsedGroups: (toggle: "group_by" | "sub_group_by", value: string) => void;
  loadMoreIssues: (groupId?: string, subGroupId?: string) => void;
  enableQuickIssueCreate?: boolean;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  disableIssueCreation?: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  canEditProperties: (projectId: string | undefined) => boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  handleOnDrop: (source: GroupDropLocation, destination: GroupDropLocation) => Promise<void>;
  showEmptyGroup?: boolean;
  subGroupIndex?: number;
  isEpic?: boolean;
}

export const KanBan = observer(function KanBan(props: IKanBan) {
  const {
    issuesMap,
    groupedIssueIds,
    getGroupIssueCount,
    displayProperties,
    sub_group_by,
    group_by,
    sub_group_id = "null",
    updateIssue,
    quickActions,
    collapsedGroups,
    handleCollapsedGroups,
    enableQuickIssueCreate,
    quickAddCallback,
    loadMoreIssues,
    disableIssueCreation,
    addIssuesToView,
    canEditProperties,
    scrollableContainerRef,
    handleOnDrop,
    showEmptyGroup = true,
    orderBy,
    isDropDisabled,
    dropErrorMessage,
    subGroupIndex = 0,
    isEpic = false,
  } = props;
  // i18n
  // store hooks
  const storeType = useIssueStoreType();
  const issueKanBanView = useKanbanView();
  // derived values
  const isDragDisabled = !issueKanBanView?.getCanUserDragDrop(group_by, sub_group_by);

  const { getIsWorkflowWorkItemCreationDisabled } = useWorkFlowFDragNDrop(group_by, sub_group_by);

  ktrace("KanBan render", {
    storeType,
    isWorkspaceLevel: isWorkspaceLevel(storeType),
    group_by,
    sub_group_by,
    orderBy,
    sub_group_id,
    isEpic,
    showEmptyGroup,
    groupedIssueIdsType: Array.isArray(groupedIssueIds) ? "array" : typeof groupedIssueIds,
    groupedIssueIdsKeys:
      groupedIssueIds && typeof groupedIssueIds === "object"
        ? Object.keys(groupedIssueIds).slice(0, 10)
        : null,
    groupedIssueIdsKeyCount:
      groupedIssueIds && typeof groupedIssueIds === "object"
        ? Object.keys(groupedIssueIds).length
        : 0,
  });

  const list = getGroupByColumns({
    groupBy: group_by as GroupByColumnTypes,
    includeNone: true,
    isWorkspaceLevel: isWorkspaceLevel(storeType),
    isEpic: isEpic,
  });

  if (!list) {
    ktrace("KanBan -> return null (list undefined)", {
      group_by,
      storeType,
      isWorkspaceLevel: isWorkspaceLevel(storeType),
    });
    return null;
  }

  ktrace("KanBan list computed", {
    length: list.length,
    ids: list.slice(0, 10).map((c) => c.id),
  });

  const visibilityGroupBy = (_list: IGroupByColumn): { showGroup: boolean; showIssues: boolean } => {
    if (sub_group_by) {
      const groupVisibility = {
        showGroup: true,
        showIssues: true,
      };
      if (!showEmptyGroup) {
        groupVisibility.showGroup = (getGroupIssueCount(_list.id, undefined, false) ?? 0) > 0;
      }
      return groupVisibility;
    } else {
      const groupVisibility = {
        showGroup: true,
        showIssues: true,
      };
      if (!showEmptyGroup) {
        if ((getGroupIssueCount(_list.id, undefined, false) ?? 0) > 0) groupVisibility.showGroup = true;
        else groupVisibility.showGroup = false;
      }
      if (collapsedGroups?.group_by.includes(_list.id)) groupVisibility.showIssues = false;
      return groupVisibility;
    }
  };

  const isGroupByCreatedBy = group_by === "created_by";
  const approximateCardHeight = getApproximateCardHeight(displayProperties);
  const isSubGroup = !!sub_group_id && sub_group_id !== "null";

  return (
    <ContentWrapper className={`relative flex-row gap-4 !pt-2 !pb-0`}>
      {list &&
        list.length > 0 &&
        list.map((subList: IGroupByColumn, groupIndex) => {
          const groupByVisibilityToggle = visibilityGroupBy(subList);

          if (groupByVisibilityToggle.showGroup === false) return <></>;

          const issueIds = isSubGroup
            ? ((groupedIssueIds as TSubGroupedIssues)?.[subList.id]?.[sub_group_id] ?? [])
            : ((groupedIssueIds as TGroupedIssues)?.[subList.id] ?? []);
          const issueLength = issueIds?.length;
          const groupHeight = issueLength * approximateCardHeight;

          return (
            <div
              key={subList.id}
              className={`group relative flex flex-shrink-0 flex-col ${
                groupByVisibilityToggle.showIssues ? `w-[350px]` : ``
              } `}
            >
              {sub_group_by === null && (
                <div className="sticky top-0 z-[2] w-full flex-shrink-0 bg-surface-2 py-1">
                  <HeaderGroupByCard
                    sub_group_by={sub_group_by}
                    group_by={group_by}
                    column_id={subList.id}
                    icon={subList.icon}
                    title={subList.name}
                    count={getGroupIssueCount(subList.id, undefined, false) ?? 0}
                    issuePayload={subList.payload}
                    disableIssueCreation={
                      disableIssueCreation ||
                      isGroupByCreatedBy ||
                      getIsWorkflowWorkItemCreationDisabled(subList.id, sub_group_id)
                    }
                    addIssuesToView={addIssuesToView}
                    collapsedGroups={collapsedGroups}
                    handleCollapsedGroups={handleCollapsedGroups}
                    isEpic={isEpic}
                  />
                </div>
              )}

              {groupByVisibilityToggle.showIssues && (
                <RenderIfVisible
                  verticalOffset={100}
                  horizontalOffset={100}
                  root={scrollableContainerRef}
                  classNames="h-full min-h-[120px]"
                  defaultHeight={`${groupHeight}px`}
                  placeholderChildren={
                    <KanbanColumnLoader
                      ignoreHeader
                      cardHeight={approximateCardHeight}
                      cardsInColumn={issueLength !== undefined && issueLength < 3 ? issueLength : 3}
                      shouldAnimate={false}
                    />
                  }
                  defaultValue={groupIndex < 5 && subGroupIndex < 2}
                  useIdletime
                >
                  <KanbanGroup
                    groupId={subList.id}
                    issuesMap={issuesMap}
                    groupedIssueIds={groupedIssueIds}
                    displayProperties={displayProperties}
                    sub_group_by={sub_group_by}
                    group_by={group_by}
                    orderBy={orderBy}
                    sub_group_id={sub_group_id}
                    isDragDisabled={isDragDisabled}
                    isDropDisabled={!!subList.isDropDisabled || !!isDropDisabled}
                    dropErrorMessage={subList.dropErrorMessage ?? dropErrorMessage}
                    updateIssue={updateIssue}
                    quickActions={quickActions}
                    enableQuickIssueCreate={enableQuickIssueCreate}
                    quickAddCallback={quickAddCallback}
                    disableIssueCreation={disableIssueCreation}
                    canEditProperties={canEditProperties}
                    scrollableContainerRef={scrollableContainerRef}
                    loadMoreIssues={loadMoreIssues}
                    handleOnDrop={handleOnDrop}
                    isEpic={isEpic}
                  />
                </RenderIfVisible>
              )}
            </div>
          );
        })}
    </ContentWrapper>
  );
});
