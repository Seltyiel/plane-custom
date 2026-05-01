/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19 + v1.19b + v1.33i:
 *  v1.19/v1.19b: People page stats + per-member issues.
 *  v1.33i: aggiunti `total_logged_seconds` (per user) e
 *  `time_logged_seconds` (per task per user) cosi' la People page
 *  puo' mostrare le ore loggate.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TPeopleStatsMember = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role: number;
};

export type TPeopleStatsCounts = {
  backlog: number;
  unstarted: number;
  started: number;
  completed: number;
  cancelled: number;
  total_active: number;
  overdue: number;
  due_this_week: number;
  no_target_date: number;
  // PATCH v1.33i: ore totali loggate da questo user nel workspace
  // (esclude rejected). Default 0.
  total_logged_seconds: number;
};

export type TPeopleStatsEntry = {
  member: TPeopleStatsMember;
  stats: TPeopleStatsCounts;
};

export type TMemberIssue = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string | null;
  project_identifier: string;
  project_name: string;
  state_id: string | null;
  state_name: string;
  state_group: string;
  state_color: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  start_date: string | null;
  target_date: string | null;
  parent_id: string | null;
  assignee_ids: string[];
  created_at: string | null;
  // PATCH v1.33i: ore loggate da questo user su questa issue (esclude rejected).
  time_logged_seconds: number;
};

export class PeopleStatsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchWorkspaceMembersStats(
    workspaceSlug: string,
    optionsOrProjectIds?:
      | string[]
      | {
          projectIds?: string[];
          hoursPeriod?: "today" | "this_week" | "this_month" | "last_30_days" | "all";
          hoursStates?: "active" | "completed" | "cancelled" | "all";
        }
  ): Promise<TPeopleStatsEntry[]> {
    // Back-compat: il parametro era `projectIds: string[]`. Adesso accetta
    // anche un options object con projectIds + hoursPeriod + hoursStates.
    const opts =
      Array.isArray(optionsOrProjectIds)
        ? { projectIds: optionsOrProjectIds }
        : optionsOrProjectIds ?? {};

    const params: Record<string, string> = {};
    if (opts.projectIds && opts.projectIds.length > 0) {
      params.project = opts.projectIds.join(",");
    }
    // PATCH v1.33l: passa i filtri Hours al backend (default: all/all).
    if (opts.hoursPeriod && opts.hoursPeriod !== "all") {
      params.hours_period = opts.hoursPeriod;
    }
    if (opts.hoursStates && opts.hoursStates !== "all") {
      params.hours_states = opts.hoursStates;
    }
    return this.get(`/api/workspaces/${workspaceSlug}/members/stats/`, { params })
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchMemberIssues(
    workspaceSlug: string,
    userId: string,
    projectIds?: string[]
  ): Promise<TMemberIssue[]> {
    const params: Record<string, string> = {};
    if (projectIds && projectIds.length > 0) {
      params.project = projectIds.join(",");
    }
    return this.get(`/api/workspaces/${workspaceSlug}/members/${userId}/issues/`, { params })
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
