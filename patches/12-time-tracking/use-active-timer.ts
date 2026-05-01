/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Hook SWR per il timer attivo dell'utente corrente. Polling ogni 5s
 *  per resync (cosi' se ferma il timer da un'altra tab, l'altra si
 *  aggiorna). L'incremento secondo-per-secondo del display lo fa il
 *  componente UI client-side.
 *
 *  Esposto:
 *   - timer: TActiveTimer | null
 *   - isOnIssue(issueId): boolean - timer attivo su QUESTA issue
 *   - start, stop, cancel mutations
 */

import useSWR, { mutate as globalMutate } from "swr";
import {
  ActiveTimerService,
  type TActiveTimer,
  type TTimerStartPayload,
  type TTimerStopPayload,
  type TTimerStopResponse,
} from "@/services/active-timer.service";

const service = new ActiveTimerService();

const ACTIVE_TIMER_KEY = (workspaceSlug: string) => `ACTIVE_TIMER_${workspaceSlug}`;

export function useActiveTimer(workspaceSlug: string | undefined) {
  const key = workspaceSlug ? ACTIVE_TIMER_KEY(workspaceSlug) : null;

  const { data, error, isLoading, mutate } = useSWR<TActiveTimer | null>(
    key,
    key ? () => service.getActive(workspaceSlug as string) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: true, // Sync se utente cambia tab e torna
      revalidateOnReconnect: true,
      // Polling moderato: ogni 5s. Il banner UI calcola elapsed locale.
      refreshInterval: 5000,
    }
  );

  const start = async (payload: TTimerStartPayload): Promise<TActiveTimer> => {
    if (!workspaceSlug) throw new Error("workspaceSlug required");
    const timer = await service.start(workspaceSlug, payload);
    mutate(timer, { revalidate: false });
    return timer;
  };

  const stop = async (payload: TTimerStopPayload = {}): Promise<TTimerStopResponse> => {
    if (!workspaceSlug) throw new Error("workspaceSlug required");
    const result = await service.stop(workspaceSlug, payload);
    mutate(null, { revalidate: false });
    // Invalida la cache logs dell'issue dove il timer era attivo (se possibile)
    if (result.log_created && result.log) {
      const log = result.log;
      globalMutate(`TIME_LOGS_${workspaceSlug}_${log.project}_${log.issue}`);
    }
    return result;
  };

  const cancel = async (): Promise<void> => {
    if (!workspaceSlug) return;
    await service.cancel(workspaceSlug);
    mutate(null, { revalidate: false });
  };

  const timer = data ?? null;
  const isOnIssue = (issueId: string) => timer !== null && timer.issue === issueId;

  return {
    timer,
    isOnIssue,
    isLoading,
    error,
    refresh: () => mutate(),
    start,
    stop,
    cancel,
  };
}
