/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20c:
 *  Frontend service per workspace shared states (Opzione 3).
 *  STEP 3 di 4 della milestone v1.20.
 *
 *  Aggiunti 4 metodi a ProjectStateService per consumare gli endpoint
 *  v1.20b backend:
 *    - createWorkspaceState  -> POST   /workspaces/<slug>/states/
 *    - patchWorkspaceState   -> PATCH  /workspaces/<slug>/states/<id>/
 *    - deleteWorkspaceState  -> DELETE /workspaces/<slug>/states/<id>/
 *    - markWorkspaceStateAsDefault -> POST /workspaces/<slug>/states/<id>/mark-default/
 *
 *  Il metodo getWorkspaceStates esistente (stock) continua ad essere
 *  usato per la list aggregata (project + workspace shared states).
 *  Lo store v1.20c (state-store.ts) consuma questi metodi.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import type { IIntakeState, IState } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectStateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ===================================================================
  // PROJECT-SCOPED STATES (stock)
  // ===================================================================

  async createState(workspaceSlug: string, projectId: string, data: any): Promise<IState> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async markDefault(workspaceSlug: string, projectId: string, stateId: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/mark-default/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async getStates(workspaceSlug: string, projectId: string): Promise<IState[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIntakeState(workspaceSlug: string, projectId: string): Promise<IIntakeState> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-state/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getState(workspaceSlug: string, projectId: string, stateId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateState(workspaceSlug: string, projectId: string, stateId: string, data: IState): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async patchState(workspaceSlug: string, projectId: string, stateId: string, data: Partial<IState>): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteState(workspaceSlug: string, projectId: string, stateId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  // ===================================================================
  // WORKSPACE-LEVEL STATES (stock GET + plane-custom v1.20b CRUD)
  // ===================================================================

  /**
   * GET aggregato esteso v1.20b: ritorna sia project states (filtered per
   * project membership) sia tutti gli workspace shared states (project=NULL).
   */
  async getWorkspaceStates(workspaceSlug: string): Promise<IState[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/states/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * v1.20c: crea uno workspace shared state (project_id forzato a NULL
   * lato backend). Permission: solo Admin del workspace.
   */
  async createWorkspaceState(workspaceSlug: string, data: Partial<IState>): Promise<IState> {
    return this.post(`/api/workspaces/${workspaceSlug}/states/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * v1.20c: modifica un workspace shared state. Backend impedisce di cambiare
   * project_id (resta NULL). Permission: solo Admin.
   */
  async patchWorkspaceState(
    workspaceSlug: string,
    stateId: string,
    data: Partial<IState>
  ): Promise<IState> {
    return this.patch(`/api/workspaces/${workspaceSlug}/states/${stateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * v1.20c: cancella uno workspace shared state. Backend rifiuta se default
   * o se almeno un Issue lo usa. Permission: solo Admin.
   */
  async deleteWorkspaceState(workspaceSlug: string, stateId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/states/${stateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * v1.20c: setta default=True su questo workspace shared state, default=False
   * su tutti gli altri workspace shared del medesimo workspace. Non tocca i
   * project states. Permission: solo Admin.
   */
  async markWorkspaceStateAsDefault(workspaceSlug: string, stateId: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/states/${stateId}/mark-default/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
