/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom):
 *  1. getAppliedFilters non piu' hardcoded a SPREADSHEET: usa il layout
 *     selezionato dall'utente cosi' che group_by / show_empty_groups /
 *     sub_issue vengano inclusi correttamente nei query params per
 *     List / Kanban / Calendar / Gantt.
 *  2. fetchIssuesWithExistingPagination viene invocato con .catch() per
 *     evitare "Uncaught (in promise) undefined" quando il fetch precedente
 *     viene abortito (controller.abort()) dalla useEffect del nuovo root
 *     layout. workspace.service.ts trasforma AbortError in `throw undefined`
 *     (error?.response?.data e' undefined), e la promise fire-and-forget
 *     non era gestita.
 *  3. [v1.10 - FIX DEL CASCADE] NON persistere piu' group_by="state" nel
 *     displayFilters condiviso quando l'utente passa a Kanban. Le vecchie
 *     patch scrivevano this.filters[viewId].displayFilters.group_by="state"
 *     in fetchFilters e updateFilters; il valore restava anche quando
 *     l'utente tornava su List e faceva fallire getStateColumns -> List
 *     bianco. Ora il default "state" per Kanban viene calcolato AL VOLO
 *     dentro getIssueFilters (vista aumentata, senza mutare lo store),
 *     esattamente come Profile/Your Work (dove "state" e' il default del
 *     filtro da constants-issue-filter.ts). Cosi':
 *       - List vede sempre il group_by reale (undefined -> ALL_ISSUES).
 *       - Kanban vede group_by effettivo "state" senza sporcare List.
 */

import { isEmpty, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TSupportedFilterTypeForUpdate } from "@plane/constants";
import { EIssueFilterType } from "@plane/constants";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  TIssueKanbanFilters,
  IIssueFilters,
  TIssueParams,
  TStaticViewTypes,
  IssuePaginationOptions,
  TWorkItemFilterExpression,
  TSupportedFilterForUpdate,
} from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes, STATIC_VIEW_TYPES } from "@plane/types";
import { handleIssueQueryParamsByLayout } from "@plane/utils";
// services
import { WorkspaceService } from "@/services/workspace.service";
// PATCH v1.13: diagnostic file-based logger
import { dlog } from "@/lib/diagnostic-logger";
// local imports
import type { IBaseIssueFilterStore, IIssueFilterHelperStore } from "../helpers/issue-filter-helper.store";
import { IssueFilterHelperStore } from "../helpers/issue-filter-helper.store";
import type { IIssueRootStore } from "../root.store";

type TWorkspaceFilters = TStaticViewTypes;

export type TBaseFilterStore = IBaseIssueFilterStore & IIssueFilterHelperStore;

export interface IWorkspaceIssuesFilter extends TBaseFilterStore {
  // fetch action
  fetchFilters: (workspaceSlug: string, viewId: string) => Promise<void>;
  updateFilterExpression: (workspaceSlug: string, viewId: string, filters: TWorkItemFilterExpression) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string | undefined,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate,
    viewId: string
  ) => Promise<void>;
  //helper action
  getIssueFilters: (viewId: string | undefined) => IIssueFilters | undefined;
  getAppliedFilters: (viewId: string) => Partial<Record<TIssueParams, string | boolean>> | undefined;
  getFilterParams: (
    options: IssuePaginationOptions,
    viewId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
}

// Helper locale: ignora silenziosamente i rifiuti "undefined" generati dagli
// abort di workspace.service.ts. Qualsiasi altro errore viene loggato.
const swallowAbort = (error: unknown) => {
  if (error === undefined || error === null) return;
  console.warn("[workspace-filter] fetch rejected:", error);
};

export class WorkspaceIssuesFilter extends IssueFilterHelperStore implements IWorkspaceIssuesFilter {
  // observables
  filters: { [viewId: string]: IIssueFilters } = {};
  // root store
  rootIssueStore;
  // services
  issueFilterService;

  constructor(_rootStore: IIssueRootStore) {
    super();
    makeObservable(this, {
      // observables
      filters: observable,
      // computed
      issueFilters: computed,
      appliedFilters: computed,
      // fetch actions
      fetchFilters: action,
      updateFilters: action,
    });
    // root store
    this.rootIssueStore = _rootStore;
    // services
    this.issueFilterService = new WorkspaceService();
  }

  getIssueFilters = (viewId: string | undefined) => {
    if (!viewId) {
      dlog("ws-filter-store", "getIssueFilters: viewId undefined -> undefined");
      return undefined;
    }

    const displayFilters = this.filters[viewId] || undefined;
    if (isEmpty(displayFilters)) {
      dlog("ws-filter-store", "getIssueFilters: store empty for viewId", { viewId });
      return undefined;
    }

    const _filters: IIssueFilters = this.computedIssueFilters(displayFilters);

    dlog("ws-filter-store", "getIssueFilters computed", {
      viewId,
      layout: _filters?.displayFilters?.layout,
      group_by: _filters?.displayFilters?.group_by,
      sub_group_by: _filters?.displayFilters?.sub_group_by,
      order_by: _filters?.displayFilters?.order_by,
    });

    // PATCH v1.14 - fix definitivo del raggruppamento Kanban workspace:
    // v1.10 augmentava group_by="state" ma la diagnostica v1.13 ha mostrato che
    //   - il frontend inviava correttamente group_by=state_id al backend
    //   - il backend /my_issues NON supporta state_id (gli UUID di stato sono
    //     scope progetto, non workspace) -> rispondeva con grouped_by: null,
    //     results: array[5] piatto, e lo store bucketava tutto in "All Issues"
    //   - la Kanban disegnava 5 colonne per UUID ma ciascuna aveva 0 issues ->
    //     con showEmptyGroup=false tutte le colonne venivano nascoste -> bianca.
    // Conferma in constants-issue-filter.ts:
    //   my_issues.layoutOptions.kanban.display_filters.group_by =
    //     ["state_detail.group", "priority", "project", "labels"]  // "state" NON c'e'
    // Fix v1.14: augmentare con "state_detail.group" (le 5 categorie universali
    // backlog/unstarted/started/completed/cancelled) che sono workspace-agnostic
    // e supportate dal backend. getGroupByColumns -> getStateGroupColumns.
    const needsKanbanDefaultGroupBy =
      _filters?.displayFilters?.layout === EIssueLayoutTypes.KANBAN &&
      !_filters?.displayFilters?.group_by;

    if (needsKanbanDefaultGroupBy) {
      return {
        ..._filters,
        displayFilters: {
          ..._filters.displayFilters,
          group_by: "state_detail.group" as const,
        },
      } as IIssueFilters;
    }

    return _filters;
  };

  getAppliedFilters = (viewId: string | undefined) => {
    if (!viewId) {
      dlog("ws-filter-store", "getAppliedFilters: viewId undefined");
      return undefined;
    }

    const userFilters = this.getIssueFilters(viewId);
    if (!userFilters) {
      dlog("ws-filter-store", "getAppliedFilters: userFilters undefined", { viewId });
      return undefined;
    }

    // PATCH: usa il layout effettivamente selezionato (fallback su SPREADSHEET)
    // cosi' group_by / show_empty_groups / sub_issue arrivano al backend
    // anche per List / Kanban / Calendar / Gantt.
    const activeLayout = (userFilters.displayFilters?.layout as EIssueLayoutTypes) || EIssueLayoutTypes.SPREADSHEET;
    const filteredParams = handleIssueQueryParamsByLayout(activeLayout, "my_issues");

    dlog("ws-filter-store", "getAppliedFilters inputs", {
      viewId,
      activeLayout,
      userFilters_group_by: userFilters.displayFilters?.group_by,
      userFilters_sub_group_by: userFilters.displayFilters?.sub_group_by,
      userFilters_order_by: userFilters.displayFilters?.order_by,
      userFilters_layout: userFilters.displayFilters?.layout,
      userFilters_show_empty_groups: userFilters.displayFilters?.show_empty_groups,
      filteredParamsList: filteredParams,
    });

    if (!filteredParams) {
      dlog("ws-filter-store", "getAppliedFilters: filteredParams null (no layout match)", {
        activeLayout,
      });
      return undefined;
    }

    const filteredRouteParams: Partial<Record<TIssueParams, string | boolean>> = this.computedFilteredParams(
      userFilters?.richFilters,
      userFilters?.displayFilters,
      filteredParams
    );

    dlog("ws-filter-store", "getAppliedFilters output", {
      viewId,
      filteredRouteParamsKeys: Object.keys(filteredRouteParams),
      group_by: (filteredRouteParams as any)?.group_by,
      sub_group_by: (filteredRouteParams as any)?.sub_group_by,
      state: (filteredRouteParams as any)?.state,
      state_id: (filteredRouteParams as any)?.state_id,
      order_by: (filteredRouteParams as any)?.order_by,
      show_empty_groups: (filteredRouteParams as any)?.show_empty_groups,
    });

    return filteredRouteParams;
  };

  get issueFilters() {
    const viewId = this.rootIssueStore.globalViewId;
    return this.getIssueFilters(viewId);
  }

  get appliedFilters() {
    const viewId = this.rootIssueStore.globalViewId;
    return this.getAppliedFilters(viewId);
  }

  getFilterParams = computedFn(
    (
      options: IssuePaginationOptions,
      viewId: string,
      cursor: string | undefined,
      groupId: string | undefined,
      subGroupId: string | undefined
    ) => {
      dlog("ws-filter-store", "getFilterParams enter", {
        viewId,
        cursor,
        groupId,
        subGroupId,
        options_perPageCount: options?.perPageCount,
        options_groupedBy: (options as any)?.groupedBy,
      });

      let filterParams = this.getAppliedFilters(viewId);

      if (!filterParams) {
        filterParams = {};
      }

      if (STATIC_VIEW_TYPES.includes(viewId)) {
        const currentUserId = this.rootIssueStore.currentUserId;
        const paramForStaticView = this.getFilterConditionBasedOnViews(currentUserId, viewId);
        if (paramForStaticView) {
          filterParams = { ...filterParams, ...paramForStaticView };
        }
      }

      const paginationParams = this.getPaginationParams(filterParams, options, cursor, groupId, subGroupId);

      dlog("ws-filter-store", "getFilterParams FINAL -> backend", {
        viewId,
        cursor,
        groupId,
        subGroupId,
        paginationParamsKeys: Object.keys(paginationParams || {}),
        group_by: (paginationParams as any)?.group_by,
        sub_group_by: (paginationParams as any)?.sub_group_by,
        state: (paginationParams as any)?.state,
        state_id: (paginationParams as any)?.state_id,
        order_by: (paginationParams as any)?.order_by,
        show_empty_groups: (paginationParams as any)?.show_empty_groups,
        per_page: (paginationParams as any)?.per_page,
        cursor_param: (paginationParams as any)?.cursor,
      });

      return paginationParams;
    }
  );

  fetchFilters = async (workspaceSlug: string, viewId: TWorkspaceFilters) => {
    let richFilters: TWorkItemFilterExpression;
    let displayFilters: IIssueDisplayFilterOptions;
    let displayProperties: IIssueDisplayProperties;
    let kanbanFilters: TIssueKanbanFilters = {
      group_by: [],
      sub_group_by: [],
    };

    const _filters = this.handleIssuesLocalFilters.get(EIssuesStoreType.GLOBAL, workspaceSlug, undefined, viewId);
    displayFilters = this.computedDisplayFilters(_filters?.display_filters, {
      layout: EIssueLayoutTypes.SPREADSHEET,
      order_by: "-created_at",
    });
    displayProperties = this.computedDisplayProperties(_filters?.display_properties);
    kanbanFilters = {
      group_by: _filters?.kanban_filters?.group_by || [],
      sub_group_by: _filters?.kanban_filters?.sub_group_by || [],
    };

    // Get the view details if the view is not a static view
    if (STATIC_VIEW_TYPES.includes(viewId) === false) {
      const _filters = await this.issueFilterService.getViewDetails(workspaceSlug, viewId);
      richFilters = _filters?.rich_filters;
      displayFilters = this.computedDisplayFilters(_filters?.display_filters, {
        layout: EIssueLayoutTypes.SPREADSHEET,
        order_by: "-created_at",
      });
      displayProperties = this.computedDisplayProperties(_filters?.display_properties);
    }

    // override existing order by if ordered by manual sort_order
    if (displayFilters.order_by === "sort_order") {
      displayFilters.order_by = "-created_at";
    }

    // PATCH v1.10: NON scrivere piu' group_by="state" qui. Quella mutazione
    // persisteva nello store condiviso e, al ritorno su List, faceva cercare
    // state columns -> workspaceStates non pronti -> List bianco (cascade).
    // Il default "state" per Kanban viene calcolato al volo in getIssueFilters
    // (vista augmented, non-mutating), esattamente come fa Profile/Your Work
    // col suo default nel config ISSUE_DISPLAY_FILTERS_BY_PAGE.profile_issues.

    runInAction(() => {
      set(this.filters, [viewId, "richFilters"], richFilters);
      set(this.filters, [viewId, "displayFilters"], displayFilters);
      set(this.filters, [viewId, "displayProperties"], displayProperties);
      set(this.filters, [viewId, "kanbanFilters"], kanbanFilters);
    });
  };

  /**
   * NOTE: This method is designed as a fallback function for the work item filter store.
   * Only use this method directly when initializing filter instances.
   * For regular filter updates, use this method as a fallback function for the work item filter store methods instead.
   */
  updateFilterExpression: IWorkspaceIssuesFilter["updateFilterExpression"] = async (workspaceSlug, viewId, filters) => {
    try {
      runInAction(() => {
        set(this.filters, [viewId, "richFilters"], filters);
      });

      // PATCH: swallow abort-induced undefined rejection
      this.rootIssueStore.workspaceIssues
        .fetchIssuesWithExistingPagination(workspaceSlug, viewId, "mutation")
        ?.catch(swallowAbort);
    } catch (error) {
      console.log("error while updating rich filters", error);
      throw error;
    }
  };

  updateFilters: IWorkspaceIssuesFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters, viewId) => {
    try {
      const issueFilters = this.getIssueFilters(viewId);

      if (!issueFilters) return;

      const _filters = {
        richFilters: issueFilters.richFilters,
        displayFilters: issueFilters.displayFilters as IIssueDisplayFilterOptions,
        displayProperties: issueFilters.displayProperties as IIssueDisplayProperties,
        kanbanFilters: issueFilters.kanbanFilters as TIssueKanbanFilters,
      };

      switch (type) {
        case EIssueFilterType.DISPLAY_FILTERS: {
          const updatedDisplayFilters = filters as IIssueDisplayFilterOptions;
          _filters.displayFilters = { ..._filters.displayFilters, ...updatedDisplayFilters };

          // set sub_group_by to null if group_by is set to null
          if (_filters.displayFilters.group_by === null) {
            _filters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }
          // set sub_group_by to null if layout is switched to kanban group_by and sub_group_by are same
          if (
            _filters.displayFilters.layout === "kanban" &&
            _filters.displayFilters.group_by === _filters.displayFilters.sub_group_by
          ) {
            _filters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }
          // PATCH v1.10: NON piu' persistenza di group_by="state" qui.
          // La scrittura sporcava displayFilters condivisi e, al ritorno su
          // List, List cercava state columns -> cascade white-screen. Il
          // default "state" per Kanban e' calcolato al volo in
          // getIssueFilters (vista augmented, non-mutating).

          runInAction(() => {
            Object.keys(updatedDisplayFilters).forEach((_key) => {
              set(
                this.filters,
                [viewId, "displayFilters", _key],
                updatedDisplayFilters[_key as keyof IIssueDisplayFilterOptions]
              );
            });
          });

          // PATCH: se l'update cambia il layout non serve ri-fetchare qui —
          // il nuovo root layout (BaseListRoot / BaseKanbanRoot / ...) lancera'
          // la propria fetchIssues in useEffect. Rifetchare qui crea una race
          // tra due controller e il primo viene abortito con "undefined".
          const isLayoutChange = Object.prototype.hasOwnProperty.call(updatedDisplayFilters, "layout");
          if (!isLayoutChange) {
            this.rootIssueStore.workspaceIssues
              .fetchIssuesWithExistingPagination(workspaceSlug, viewId, "mutation")
              ?.catch(swallowAbort);
          }

          if (["all-issues", "assigned", "created", "subscribed"].includes(viewId))
            this.handleIssuesLocalFilters.set(EIssuesStoreType.GLOBAL, type, workspaceSlug, undefined, viewId, {
              display_filters: _filters.displayFilters,
            });
          break;
        }
        case EIssueFilterType.DISPLAY_PROPERTIES: {
          const updatedDisplayProperties = filters as IIssueDisplayProperties;
          _filters.displayProperties = { ..._filters.displayProperties, ...updatedDisplayProperties };

          runInAction(() => {
            Object.keys(updatedDisplayProperties).forEach((_key) => {
              set(
                this.filters,
                [viewId, "displayProperties", _key],
                updatedDisplayProperties[_key as keyof IIssueDisplayProperties]
              );
            });
            if (["all-issues", "assigned", "created", "subscribed"].includes(viewId))
              this.handleIssuesLocalFilters.set(EIssuesStoreType.GLOBAL, type, workspaceSlug, undefined, viewId, {
                display_properties: _filters.displayProperties,
              });
          });
          break;
        }

        case EIssueFilterType.KANBAN_FILTERS: {
          const updatedKanbanFilters = filters as TIssueKanbanFilters;
          _filters.kanbanFilters = { ..._filters.kanbanFilters, ...updatedKanbanFilters };

          const currentUserId = this.rootIssueStore.currentUserId;
          if (currentUserId)
            this.handleIssuesLocalFilters.set(EIssuesStoreType.GLOBAL, type, workspaceSlug, undefined, viewId, {
              kanban_filters: _filters.kanbanFilters,
            });

          runInAction(() => {
            Object.keys(updatedKanbanFilters).forEach((_key) => {
              set(
                this.filters,
                [viewId, "kanbanFilters", _key],
                updatedKanbanFilters[_key as keyof TIssueKanbanFilters]
              );
            });
          });

          break;
        }
        default:
          break;
      }
    } catch (error) {
      if (viewId) this.fetchFilters(workspaceSlug, viewId);
      throw error;
    }
  };
}
