/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.06 - Diagnostic traces inside BaseListRoot.
 * Stesso pattern di base-kanban-root: stampiamo storeType, loader,
 * groupCountNoFilters, groupedIssueIds shape, viewFlags. Log prefissati
 * con [plane-custom][base-list]. Confrontando con i log dell'HOC si vede
 * subito se il ramo silenzioso e' loader/empty/children.
 */

import type { FC } from "react";
import { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EIssueFilterType, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { EIssuesStoreType, GroupByColumnTypes, TGroupedIssues, TIssueKanbanFilters } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useGroupIssuesDragNDrop } from "@/hooks/use-group-dragndrop";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { IssueLayoutHOC } from "../issue-layout-HOC";
import { List } from "./default";
import type { IQuickActionProps, TRenderQuickActions } from "./list-view-types";

type ListStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.ARCHIVED
  | EIssuesStoreType.WORKSPACE_DRAFT
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC
  | EIssuesStoreType.GLOBAL;

interface IBaseListRoot {
  QuickActions: FC<IQuickActionProps>;
  addIssuesToView?: (issueIds: string[]) => Promise<any>;
  canEditPropertiesBasedOnProject?: (projectId: string) => boolean;
  viewId?: string | undefined;
  isCompletedCycle?: boolean;
  isEpic?: boolean;
}

// PATCH v1.06: trace helper per base-list-root
const ltrace = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.info("[plane-custom][base-list]", ...args);
};

// PATCH v1.08: swallow abort-induced `throw undefined` rejections.
// Quando cambia layout (List <-> Kanban), la fetch precedente viene abortita;
// workspace.service.ts trasforma AbortError in `throw undefined`. Se la promise
// non ha un .catch, il browser emette "Uncaught (in promise) undefined" e
// React cestina l'intero sottoalbero → pagina bianca.
const swallowAbort = (e: unknown) => {
  if (e === undefined || e === null) return;
  // eslint-disable-next-line no-console
  console.warn("[plane-custom][base-list] fetch rejected:", e);
};

export const BaseListRoot = observer(function BaseListRoot(props: IBaseListRoot) {
  const {
    QuickActions,
    viewId,
    addIssuesToView,
    canEditPropertiesBasedOnProject,
    isCompletedCycle = false,
    isEpic = false,
  } = props;
  ltrace("render start", { viewId, isEpic });

  const storeType = useIssueStoreType() as ListStoreType;
  ltrace("resolved storeType", storeType);

  const { issuesFilter, issues } = useIssues(storeType);

  let _groupCount: unknown = "n/a";
  try {
    _groupCount = issues?.getGroupIssueCount?.(undefined, undefined, false);
  } catch (e) {
    _groupCount = "THROW: " + ((e as Error)?.message || String(e));
  }
  ltrace("store acquired", {
    hasIssuesFilter: Boolean(issuesFilter),
    hasIssues: Boolean(issues),
    loader: issues?.getIssueLoader?.(),
    groupCountNoFilters: _groupCount,
    groupedIssueIdsType: typeof issues?.groupedIssueIds,
    groupedIssueIdsIsArray: Array.isArray(issues?.groupedIssueIds),
    viewFlags: issues?.viewFlags,
  });

  const {
    fetchIssues,
    fetchNextIssues,
    quickAddIssue,
    updateIssue,
    removeIssue,
    removeIssueFromView,
    archiveIssue,
    restoreIssue,
  } = useIssuesActions(storeType);

  const { allowPermissions } = useUserPermissions();
  const { issueMap } = useIssues();

  const displayFilters = issuesFilter?.issueFilters?.displayFilters;
  const displayProperties = issuesFilter?.issueFilters?.displayProperties;
  const orderBy = displayFilters?.order_by || undefined;

  const group_by = (displayFilters?.group_by || null) as GroupByColumnTypes | null;
  const showEmptyGroup = displayFilters?.show_empty_groups ?? false;

  const { workspaceSlug, projectId } = useParams();
  const { updateFilters } = useIssuesActions(storeType);
  const collapsedGroups =
    issuesFilter?.issueFilters?.kanbanFilters || ({ group_by: [], sub_group_by: [] } as TIssueKanbanFilters);

  useEffect(() => {
    // PATCH v1.08: .catch(swallowAbort) per non lasciare rejection uncaught
    // quando la fetch precedente viene abortita al layout change.
    fetchIssues("init-loader", { canGroup: true, perPageCount: group_by ? 50 : 100 }, viewId)
      ?.catch(swallowAbort);
  }, [fetchIssues, storeType, group_by, viewId]);

  const groupedIssueIds = issues?.groupedIssueIds as TGroupedIssues | undefined;

  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const { enableInlineEditing, enableQuickAdd, enableIssueCreation } = issues?.viewFlags || {};

  const canEditProperties = useCallback(
    (projectId: string | undefined) => {
      const isEditingAllowedBasedOnProject =
        canEditPropertiesBasedOnProject && projectId ? canEditPropertiesBasedOnProject(projectId) : isEditingAllowed;
      return Boolean(enableInlineEditing) && isEditingAllowedBasedOnProject;
    },
    [canEditPropertiesBasedOnProject, enableInlineEditing, isEditingAllowed]
  );

  const handleOnDrop = useGroupIssuesDragNDrop(storeType, orderBy, group_by);

  const renderQuickActions: TRenderQuickActions = useCallback(
    ({ issue, parentRef }) => (
      <QuickActions
        parentRef={parentRef}
        issue={issue}
        handleDelete={async () => removeIssue(issue.project_id, issue.id)}
        handleUpdate={async (data) => updateIssue && updateIssue(issue.project_id, issue.id, data)}
        handleRemoveFromView={async () => removeIssueFromView && removeIssueFromView(issue.project_id, issue.id)}
        handleArchive={async () => archiveIssue && archiveIssue(issue.project_id, issue.id)}
        handleRestore={async () => restoreIssue && restoreIssue(issue.project_id, issue.id)}
        readOnly={(canEditProperties(issue.project_id ?? undefined) === false) || isCompletedCycle}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isCompletedCycle, canEditProperties, removeIssue, updateIssue, removeIssueFromView, archiveIssue, restoreIssue]
  );

  const loadMoreIssues = useCallback(
    (groupId?: string) => {
      // PATCH v1.08: .catch(swallowAbort)
      fetchNextIssues(groupId)?.catch(swallowAbort);
    },
    [fetchNextIssues]
  );

  const handleCollapsedGroups = useCallback(
    (value: string) => {
      if (workspaceSlug) {
        let collapsedGroups = issuesFilter?.issueFilters?.kanbanFilters?.group_by || [];
        if (collapsedGroups.includes(value)) {
          collapsedGroups = collapsedGroups.filter((_value) => _value != value);
        } else {
          collapsedGroups.push(value);
        }
        updateFilters(projectId?.toString() ?? "", EIssueFilterType.KANBAN_FILTERS, {
          group_by: collapsedGroups,
        } as TIssueKanbanFilters);
      }
    },
    [workspaceSlug, issuesFilter, projectId, updateFilters]
  );

  ltrace("about to render IssueLayoutHOC", {
    layout: "LIST",
    group_by,
    orderBy,
    showEmptyGroup,
    enableInlineEditing,
    enableQuickAdd,
    enableIssueCreation,
  });

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.LIST}>
      <div className="relative size-full bg-surface-2">
        <List
          issuesMap={issueMap}
          displayProperties={displayProperties}
          group_by={group_by}
          orderBy={orderBy}
          updateIssue={updateIssue}
          quickActions={renderQuickActions}
          groupedIssueIds={groupedIssueIds ?? {}}
          loadMoreIssues={loadMoreIssues}
          showEmptyGroup={showEmptyGroup}
          quickAddCallback={quickAddIssue}
          enableIssueQuickAdd={Boolean(enableQuickAdd)}
          canEditProperties={canEditProperties}
          disableIssueCreation={(enableIssueCreation === false) || (isEditingAllowed === false)}
          addIssuesToView={addIssuesToView}
          isCompletedCycle={isCompletedCycle}
          handleOnDrop={handleOnDrop}
          handleCollapsedGroups={handleCollapsedGroups}
          collapsedGroups={collapsedGroups}
          isEpic={isEpic}
        />
      </div>
    </IssueLayoutHOC>
  );
});
