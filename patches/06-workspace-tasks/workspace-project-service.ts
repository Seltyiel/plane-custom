/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.22b:
 *  Service dedicato per il progetto fittizio workspace-level (Opzione A v1.22).
 *  Consuma l'endpoint backend v1.22a:
 *    GET /api/workspaces/<slug>/workspace-project/
 *    -> { id, name, identifier, is_hidden }
 *
 *  Il backend fa lazy get_or_create + sync ProjectMember col primo GET, quindi
 *  e' safe chiamarlo come signal d'apertura della pagina (idempotente).
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TWorkspaceProjectInfo = {
  id: string;
  name: string;
  identifier: string;
  is_hidden: boolean;
};

export class WorkspaceProjectService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Ritorna (e crea lazy se non esiste) il progetto fittizio "Workspace"
   * del workspace corrente. Backend: WorkspaceProjectEndpoint v1.22a.
   */
  async getWorkspaceProject(workspaceSlug: string): Promise<TWorkspaceProjectInfo> {
    return this.get(`/api/workspaces/${workspaceSlug}/workspace-project/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
