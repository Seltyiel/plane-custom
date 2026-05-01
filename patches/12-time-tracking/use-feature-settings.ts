/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Hook SWR per workspace_feature_settings.
 *  Espone `get()` per leggere singoli flag con default safe e `set()`
 *  per scrivere via PATCH endpoint (admin only — il backend gating).
 */

import useSWR from "swr";
import { FeatureSettingsService, type TFeatureSettings } from "@/services/feature-settings.service";

const service = new FeatureSettingsService();

const cacheKey = (workspaceSlug: string) => `WORKSPACE_FEATURE_SETTINGS_${workspaceSlug}`;

export function useFeatureSettings(workspaceSlug: string | undefined) {
  const key = workspaceSlug ? cacheKey(workspaceSlug) : null;

  const { data, error, isLoading, mutate } = useSWR<TFeatureSettings>(
    key,
    key ? () => service.getSettings(workspaceSlug as string) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: true,
      revalidateOnReconnect: false,
    }
  );

  /**
   * Lettura sicura di un singolo flag con default fallback.
   * Da usare nei consumer che vogliono solo controllare lo stato di un toggle.
   */
  const getFlag = <T extends boolean | string | number>(key: string, fallback: T): T => {
    if (!data) return fallback;
    const v = data[key];
    if (v === undefined || v === null) return fallback;
    return v as T;
  };

  /**
   * Patch dei flag forniti (backend fa il merge: gli altri flag restano).
   */
  const setFlags = async (patch: Partial<TFeatureSettings>): Promise<TFeatureSettings> => {
    if (!workspaceSlug) throw new Error("workspaceSlug required");
    const updated = await service.patchSettings(workspaceSlug, patch);
    mutate(updated, { revalidate: false });
    return updated;
  };

  return {
    features: data ?? {},
    getFlag,
    setFlags,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}
