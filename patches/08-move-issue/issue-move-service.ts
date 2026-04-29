/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.24b:
 *  Service per move issue tra progetti. Consuma l'endpoint backend
 *  v1.24a: POST /api/workspaces/<slug>/issues/<issue_id>/move/.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TMoveIssuePayload = {
  target_project_id: string;
  include_sub_issues?: boolean;
};

export class IssueMoveService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async moveIssue(workspaceSlug: string, issueId: string, payload: TMoveIssuePayload): Promise<TIssue> {
    return this.post(`/api/workspaces/${workspaceSlug}/issues/${issueId}/move/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
