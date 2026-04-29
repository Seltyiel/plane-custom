/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.26b:
 *  Hook SWR-based per la My Dashboard. Cache key fa parte di workspace
 *  + userId (quando admin sta guardando la dashboard di un altro user).
 */

import useSWR from "swr";
import { DashboardService } from "@/services/dashboard.service";
import type { TDashboardResponse } from "@/services/dashboard.service";

const dashboardService = new DashboardService();

export const useMyDashboard = (workspaceSlug: string | undefined, userId?: string) => {
  const swrKey = workspaceSlug ? `MY_DASHBOARD_${workspaceSlug}_${userId ?? "self"}` : null;
  const { data, error, isLoading, mutate } = useSWR<TDashboardResponse | undefined>(
    swrKey,
    workspaceSlug ? () => dashboardService.getMyDashboard(workspaceSlug, userId) : null,
    {
      revalidateOnFocus: true,
      // Refresh ogni 60s se la finestra e' visibile (KPI sono "live").
      refreshInterval: 60000,
      revalidateIfStale: true,
    }
  );
  return {
    dashboard: data,
    isLoading,
    error,
    mutate,
  };
};
