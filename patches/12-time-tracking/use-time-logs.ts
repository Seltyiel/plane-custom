/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Hook SWR per i TimeLog di una specifica issue. Auto-refetch on
 *  mount + lasciamo fuori revalidate-on-focus per non spammare il
 *  backend ogni tab change.
 */

import useSWR, { mutate as globalMutate } from "swr";
import { TimeLogService, type TTimeLog, type TTimeLogCreatePayload, type TTimeLogUpdatePayload } from "@/services/time-log.service";

const service = new TimeLogService();

const cacheKey = (workspaceSlug: string, projectId: string, issueId: string) =>
  `TIME_LOGS_${workspaceSlug}_${projectId}_${issueId}`;

export function useTimeLogs(workspaceSlug: string | undefined, projectId: string | undefined, issueId: string | undefined) {
  const key = workspaceSlug && projectId && issueId ? cacheKey(workspaceSlug, projectId, issueId) : null;

  const { data, error, isLoading, mutate } = useSWR<TTimeLog[]>(
    key,
    key
      ? () => service.listForIssue(workspaceSlug as string, projectId as string, issueId as string)
      : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const create = async (payload: TTimeLogCreatePayload) => {
    if (!workspaceSlug || !projectId || !issueId) return;
    const created = await service.createForIssue(workspaceSlug, projectId, issueId, payload);
    // Optimistic update + revalidate
    mutate((current) => (current ? [created, ...current] : [created]), { revalidate: false });
    return created;
  };

  const update = async (logId: string, payload: TTimeLogUpdatePayload) => {
    if (!workspaceSlug) return;
    const updated = await service.update(workspaceSlug, logId, payload);
    mutate((current) => current?.map((l) => (l.id === logId ? updated : l)), { revalidate: false });
    return updated;
  };

  const remove = async (logId: string) => {
    if (!workspaceSlug) return;
    await service.remove(workspaceSlug, logId);
    mutate((current) => current?.filter((l) => l.id !== logId), { revalidate: false });
  };

  // Total durata loggata su questa issue (in secondi).
  // PATCH v1.33h: i log con approval_status='rejected' NON vengono
  // contati nel totale "Logged" (sono lavoro che l'admin ha rifiutato).
  // I 'pending' invece SI contano (sono ancora work-in-progress di
  // approval, ma se l'utente li ha loggati e' tempo speso reale).
  const totalSeconds = (data ?? [])
    .filter((log) => log.approval_status !== "rejected")
    .reduce((acc, log) => acc + log.duration_seconds, 0);

  return {
    logs: data ?? [],
    totalSeconds,
    isLoading,
    error,
    refresh: () => mutate(),
    create,
    update,
    remove,
  };
}

/**
 * Helper per invalidare la cache da fuori (es. dopo timer stop che crea
 * un TimeLog).
 */
export function invalidateIssueTimeLogs(workspaceSlug: string, projectId: string, issueId: string) {
  return globalMutate(cacheKey(workspaceSlug, projectId, issueId));
}
