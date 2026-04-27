/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19:
 *  Servizio client per l'endpoint /api/workspaces/<slug>/members/stats/
 *  (definito backend in v1.18, team_stats.py).
 *
 *  Restituisce per ogni membro attivo del workspace:
 *    - dati identificativi (id, nome, email, avatar_url, role)
 *    - stats aggregate: backlog, unstarted, started, completed, cancelled,
 *      total_active, overdue, due_this_week, no_target_date
 *
 *  Solo i task dei progetti a cui l'utente corrente appartiene sono contati
 *  (filtro backend-side).
 *
 * PATCH (plane-custom) v1.19b:
 *  Aggiunto fetchMemberIssues(slug, userId) che chiama l'endpoint
 *  /api/workspaces/<slug>/members/<user_id>/issues/ (team_issues.py) e
 *  ritorna la lista flat dei task attivi del membro. Il frontend costruisce
 *  lato client l'albero task/subtask usando parent_id.
 */

import { API_BASE_URL } from "@plane/constants";
// services
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
};

export type TPeopleStatsEntry = {
  member: TPeopleStatsMember;
  stats: TPeopleStatsCounts;
};

// plane-custom v1.19b: shape di un singolo task attivo ritornato
// dall'endpoint /members/<user_id>/issues/.
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
};

export class PeopleStatsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchWorkspaceMembersStats(
    workspaceSlug: string,
    projectIds?: string[]
  ): Promise<TPeopleStatsEntry[]> {
    const params: Record<string, string> = {};
    if (projectIds && projectIds.length > 0) {
      params.project = projectIds.join(",");
    }
    return this.get(`/api/workspaces/${workspaceSlug}/members/stats/`, { params })
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // plane-custom v1.19b: lazy-load dei task attivi di un singolo membro per
  // la tree view della People page.
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
