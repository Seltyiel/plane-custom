/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Service per il timer attivo del Time Tracking. Consuma gli endpoint
 *  backend v1.33b:
 *    GET    /api/workspaces/<slug>/timer/        timer attivo o null
 *    DELETE /api/workspaces/<slug>/timer/        cancella timer (no log)
 *    POST   /api/workspaces/<slug>/timer/start/  body: {issue_id, description?}
 *    POST   /api/workspaces/<slug>/timer/stop/   body: {description?}
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type { TTimeLog } from "./time-log.service";

export type TActiveTimer = {
  id: string;
  user: string;
  workspace: string;
  issue: string | null;
  started_at: string; // ISO datetime
  description: string | null;
  // Annotated
  issue_name: string | null;
  issue_sequence_id: number | null;
  project_id: string | null;
  project_identifier: string | null;
  elapsed_seconds: number;
};

export type TTimerStartPayload = {
  issue_id: string;
  description?: string;
};

export type TTimerStopPayload = {
  description?: string;
};

export type TTimerStartResponse = TActiveTimer;

export type TTimerStopResponse = {
  log_created: boolean;
  log?: TTimeLog;
  error?: string;
};

export class ActiveTimerService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Ritorna il timer attivo dell'utente corrente.
   * @returns TActiveTimer o null se nessun timer attivo (backend ritorna 204)
   */
  async getActive(workspaceSlug: string): Promise<TActiveTimer | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/timer/`)
      .then((res) => {
        // 204 No Content -> res.data e' undefined/empty
        if (!res?.data || (typeof res.data === "object" && Object.keys(res.data).length === 0)) {
          return null;
        }
        return res.data as TActiveTimer;
      })
      .catch((err) => {
        if (err?.response?.status === 204 || err?.response?.status === 404) return null;
        throw err?.response?.data;
      });
  }

  async start(workspaceSlug: string, payload: TTimerStartPayload): Promise<TActiveTimer> {
    return this.post(`/api/workspaces/${workspaceSlug}/timer/start/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        // 409 e' "timer gia' attivo" - restituiamo il body cosi' il caller
        // puo' decidere se chiedere conferma "fermo l'altro?"
        throw err?.response?.data;
      });
  }

  async stop(workspaceSlug: string, payload: TTimerStopPayload = {}): Promise<TTimerStopResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/timer/stop/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async cancel(workspaceSlug: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/timer/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
