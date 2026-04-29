/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.26b:
 *  Service per la My Dashboard. Consuma l'endpoint v1.26a:
 *    GET /api/workspaces/<slug>/me/dashboard/?user_id=<uuid>
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TDashboardKPI = {
  total_assigned: number;
  due_today: number;
  overdue: number;
  due_this_week: number;
};

export type TDashboardUser = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
};

export type TDashboardResponse = {
  user: TDashboardUser;
  kpi: TDashboardKPI;
  today_issues: TIssue[];
  overdue_issues: TIssue[];
};

export class DashboardService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getMyDashboard(workspaceSlug: string, userId?: string): Promise<TDashboardResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/me/dashboard/`, {
      params: userId ? { user_id: userId } : undefined,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
