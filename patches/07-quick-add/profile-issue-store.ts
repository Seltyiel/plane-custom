/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.23:
 *  Sblocca quickAddIssue nel ProfileIssues store + flip enableQuickAdd
 *  a true per le viste assigned/created (resta false per subscribed:
 *  non ha senso "creare un task sottoscritto").
 *
 *  Nota auto-assignee: la vista 'assigned' filtra per assignees=userId,
 *  quindi un task quick-creato senza assignee scomparirebbe dalla lista
 *  dopo il refresh. La pre-popolazione di assignee_ids = [userId] avviene
 *  nell'hook useProfileIssueActions (use-issues-actions.tsx) cosi' la
 *  logica resta vicina al routing.
 */

import { action, observable, makeObservable, computed, runInAction } from "mobx";
// base class
import type {
  TIssue,
  TLoader,
  IssuePaginationOptions,
  TIssuesResponse,
  ViewFlags,
  TBulkOperationsPayload,
  TProfileViews,
} from "@plane/types";
import { UserService } from "@/services/user.service";

// services
// types
import type { IBaseIssuesStore } from "../helpers/base-issues.store";
import { BaseIssuesStore } from "../helpers/base-issues.store";
import type { IIssueRootStore } from "../root.store";
import type { IProfileIssuesFilter } from "./filter.store";

export interface IProfileIssues extends IBaseIssuesStore {
  // observable
  currentView: TProfileViews;
  viewFlags: ViewFlags;
  // actions
  setViewId: (viewId: TProfileViews) => void;
  // action
  fetchIssues: (
    workspaceSlug: string,
    userId: string,
    loadType: TLoader,
    option: IssuePaginationOptions,
    view: TProfileViews,
    isExistingPaginationOptions?: boolean
  ) => Promise<TIssuesResponse | undefined>;
  fetchIssuesWithExistingPagination: (
    workspaceSlug: string,
    userId: string,
    loadType: TLoader
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (
    workspaceSlug: string,
    userId: string,
    groupId?: string,
    subGroupId?: string
  ) => Promise<TIssuesResponse | undefined>;

  createIssue: (workspaceSlug: string, projectId: string, data: Partial<TIssue>) => Promise<TIssue>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  archiveIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  removeBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  archiveBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  bulkUpdateProperties: (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => Promise<void>;

  // PATCH v1.23: ora supportato (era undefined).
  quickAddIssue: (workspaceSlug: string, projectId: string, data: TIssue) => Promise<TIssue | undefined>;
}

export class ProfileIssues extends BaseIssuesStore implements IProfileIssues {
  currentView: TProfileViews = "assigned";
  // filter store
  issueFilterStore: IProfileIssuesFilter;
  // services
  userService;

  constructor(_rootStore: IIssueRootStore, issueFilterStore: IProfileIssuesFilter) {
    super(_rootStore, issueFilterStore);
    makeObservable(this, {
      // observable
      currentView: observable.ref,
      // computed
      viewFlags: computed,
      // action
      setViewId: action.bound,
      fetchIssues: action,
      fetchNextIssues: action,
      fetchIssuesWithExistingPagination: action,
    });
    // filter store
    this.issueFilterStore = issueFilterStore;
    // services
    this.userService = new UserService();
  }

  get viewFlags() {
    // PATCH v1.23: enableQuickAdd su assigned/created. Subscribed resta off
    // (non ha senso quick-creare un task gia' sottoscritto).
    if (this.currentView === "subscribed")
      return {
        enableQuickAdd: false,
        enableIssueCreation: false,
        enableInlineEditing: true,
      };
    return {
      enableQuickAdd: true,
      enableIssueCreation: true,
      enableInlineEditing: true,
    };
  }

  setViewId(viewId: TProfileViews) {
    this.currentView = viewId;
  }

  fetchParentStats = () => {};

  /** */
  updateParentStats = () => {};

  /**
   * This method is called to fetch the first issues of pagination
   * @param workspaceSlug
   * @param userId
   * @param loadType
   * @param options
   * @param view
   * @returns
   */
  fetchIssues: IProfileIssues["fetchIssues"] = async (
    workspaceSlug: string,
    userId: string,
    loadType: TLoader,
    options: IssuePaginationOptions,
    view: TProfileViews,
    isExistingPaginationOptions: boolean = false
  ) => {
    try {
      // set loader and clear store
      runInAction(() => {
        this.setLoader(loadType);
      });
      this.clear(!isExistingPaginationOptions);

      // set ViewId
      this.setViewId(view);

      // get params from pagination options
      let params = this.issueFilterStore?.getFilterParams(options, userId, undefined, undefined, undefined);
      params = {
        ...params,
        assignees: undefined,
        created_by: undefined,
        subscriber: undefined,
      };
      // modify params based on view
      if (this.currentView === "assigned") params = { ...params, assignees: userId };
      else if (this.currentView === "created") params = { ...params, created_by: userId };
      else if (this.currentView === "subscribed") params = { ...params, subscriber: userId };

      // call the fetch issues API with the params
      const response = await this.userService.getUserProfileIssues(workspaceSlug, userId, params, {
        signal: this.controller.signal,
      });

      // after fetching issues, call the base method to process the response further
      this.onfetchIssues(response, options, workspaceSlug, undefined, undefined, !isExistingPaginationOptions);
      return response;
    } catch (error) {
      // set loader to undefined if errored out
      this.setLoader(undefined);
      throw error;
    }
  };

  /**
   * This method is called subsequent pages of pagination
   * if groupId/subgroupId is provided, only that specific group's next page is fetched
   * else all the groups' next page is fetched
   * @param workspaceSlug
   * @param userId
   * @param groupId
   * @param subGroupId
   * @returns
   */
  fetchNextIssues = async (workspaceSlug: string, userId: string, groupId?: string, subGroupId?: string) => {
    const cursorObject = this.getPaginationData(groupId, subGroupId);
    // if there are no pagination options and the next page results do not exist the return
    if (!this.paginationOptions || (cursorObject && !cursorObject?.nextPageResults)) return;
    try {
      // set Loader
      this.setLoader("pagination", groupId, subGroupId);

      // get params from stored pagination options
      let params = this.issueFilterStore?.getFilterParams(
        this.paginationOptions,
        userId,
        this.getNextCursor(groupId, subGroupId),
        groupId,
        subGroupId
      );
      params = {
        ...params,
        assignees: undefined,
        created_by: undefined,
        subscriber: undefined,
      };
      if (this.currentView === "assigned") params = { ...params, assignees: userId };
      else if (this.currentView === "created") params = { ...params, created_by: userId };
      else if (this.currentView === "subscribed") params = { ...params, subscriber: userId };

      // call the fetch issues API with the params for next page in issues
      const response = await this.userService.getUserProfileIssues(workspaceSlug, userId, params);

      // after the next page of issues are fetched, call the base method to process the response
      this.onfetchNexIssues(response, groupId, subGroupId);
      return response;
    } catch (error) {
      // set Loader as undefined if errored out
      this.setLoader(undefined, groupId, subGroupId);
      throw error;
    }
  };

  /**
   * This Method exists to fetch the first page of the issues with the existing stored pagination
   * This is useful for refetching when filters, groupBy, orderBy etc changes
   * @param workspaceSlug
   * @param userId
   * @param loadType
   * @returns
   */
  fetchIssuesWithExistingPagination = async (workspaceSlug: string, userId: string, loadType: TLoader) => {
    if (!this.paginationOptions || !this.currentView) return;
    return await this.fetchIssues(workspaceSlug, userId, loadType, this.paginationOptions, this.currentView, true);
  };

  // Using aliased names as they cannot be overridden in other stores
  archiveBulkIssues = this.bulkArchiveIssues;
  updateIssue = this.issueUpdate;
  archiveIssue = this.issueArchive;

  // PATCH v1.23: bind a issueQuickAdd della base class. Stock lo aveva
  // come `undefined`. L'auto-assignee per la vista 'assigned' avviene
  // a livello hook (useProfileIssueActions) cosi' la logica resta
  // vicina al routing.
  quickAddIssue = this.issueQuickAdd;
}
