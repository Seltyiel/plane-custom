/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Service per CRUD dei TimeLog. Consuma gli endpoint backend v1.33a:
 *    POST  /api/workspaces/<slug>/projects/<projectId>/issues/<issueId>/time-logs/
 *    GET   .../time-logs/                                    (list per issue)
 *    GET   /api/workspaces/<slug>/time-logs/?from=&to=&...   (report query)
 *    GET   /api/workspaces/<slug>/time-logs/<id>/
 *    PATCH /api/workspaces/<slug>/time-logs/<id>/
 *    DELETE /api/workspaces/<slug>/time-logs/<id>/
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

// Mirror del backend serializer.
export type TTimeLog = {
  id: string;
  workspace: string;
  project: string | null;
  issue: string;
  user: string;
  duration_seconds: number;
  logged_at: string; // ISO datetime
  description: string | null;
  source: "manual" | "timer";
  timer_started_at: string | null;
  approval_status: "auto" | "pending" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  // Annotated read-only
  user_display_name: string;
  user_avatar_url: string | null;
  issue_name: string;
  issue_sequence_id: number;
  project_identifier: string;
};

export type TTimeLogCreatePayload = {
  duration_seconds: number;
  logged_at?: string; // default: now (server-side)
  description?: string;
};

export type TTimeLogUpdatePayload = Partial<TTimeLogCreatePayload>;

export type TTimeLogReportTotals = {
  total_seconds: number;
  approved_seconds: number;
  pending_seconds: number;
};

export type TTimeLogReportResponse = {
  logs: TTimeLog[];
  totals: TTimeLogReportTotals;
};

export type TTimeLogReportQuery = {
  from?: string; // ISO date
  to?: string; // ISO date
  user_id?: string;
  project_id?: string;
  approval_status?: "auto" | "pending" | "approved" | "rejected";
};

export class TimeLogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listForIssue(workspaceSlug: string, projectId: string, issueId: string): Promise<TTimeLog[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-logs/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createForIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: TTimeLogCreatePayload
  ): Promise<TTimeLog> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-logs/`,
      payload
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getById(workspaceSlug: string, logId: string): Promise<TTimeLog> {
    return this.get(`/api/workspaces/${workspaceSlug}/time-logs/${logId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(workspaceSlug: string, logId: string, payload: TTimeLogUpdatePayload): Promise<TTimeLog> {
    return this.patch(`/api/workspaces/${workspaceSlug}/time-logs/${logId}/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async remove(workspaceSlug: string, logId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/time-logs/${logId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async report(workspaceSlug: string, query: TTimeLogReportQuery = {}): Promise<TTimeLogReportResponse> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    });
    const qs = params.toString();
    return this.get(`/api/workspaces/${workspaceSlug}/time-logs/${qs ? "?" + qs : ""}`)
      .then((res) => res?.data ?? { logs: [], totals: { total_seconds: 0, approved_seconds: 0, pending_seconds: 0 } })
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
