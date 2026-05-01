/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Service per workspace_feature_settings (endpoint v1.33e).
 *  Generic toggle store: chiavi-valori arbitrari, riusabile per
 *  Time Tracking, Meetings (v1.34), e altre feature future.
 *
 *  Metodi rinominati `getSettings`/`patchSettings` per evitare
 *  collisione con APIService.get() / APIService.patch() della base.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TFeatureSettings = Record<string, boolean | string | number | null>;

export class FeatureSettingsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSettings(workspaceSlug: string): Promise<TFeatureSettings> {
    return this.get(`/api/workspaces/${workspaceSlug}/feature-settings/`)
      .then((res) => (res?.data?.features as TFeatureSettings) ?? {})
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Merge dei flag forniti con quelli esistenti (backend merge).
   */
  async patchSettings(
    workspaceSlug: string,
    features: Partial<TFeatureSettings>
  ): Promise<TFeatureSettings> {
    return this.patch(`/api/workspaces/${workspaceSlug}/feature-settings/`, { features })
      .then((res) => (res?.data?.features as TFeatureSettings) ?? features)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
