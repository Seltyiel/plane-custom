/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// PATCH (plane-custom) v1.34d:
//  Hook SWR per Meeting list + detail.
//  Cache key namespacing: ['meetings', slug, ...filters] / ['meeting', slug, id].

import useSWR from "swr";
// services
import {
  MeetingService,
  type IMeeting,
  type IMeetingListFilters,
} from "@/services/meeting.service";

const meetingService = new MeetingService();

/**
 * useMeetings: workspace-level list. Filtri opzionali (from/to/project_id).
 * Auto-revalidate al cambio di filtri.
 */
export const useMeetings = (
  workspaceSlug: string | undefined | null,
  filters?: IMeetingListFilters
) => {
  // Stable cache key: trasformiamo i filtri in stringa cosi' SWR non re-fetcha
  // se l'oggetto e' nuovo ma i valori uguali.
  const filtersKey = filters
    ? `${filters.from || ""}|${filters.to || ""}|${filters.project_id || ""}`
    : "";
  const key = workspaceSlug ? `meetings|${workspaceSlug}|${filtersKey}` : null;

  const { data, error, isLoading, mutate, isValidating } = useSWR<IMeeting[]>(
    key,
    () => meetingService.list(workspaceSlug!, filters),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  return {
    meetings: data || [],
    isLoading,
    isValidating,
    error,
    mutate,
  };
};

/**
 * useMeetingDetail: detail di un singolo meeting. Riusa il backend GET
 * /workspaces/<slug>/meetings/<id>/ che ritorna nested attendees + issue_links.
 */
export const useMeetingDetail = (
  workspaceSlug: string | undefined | null,
  meetingId: string | undefined | null
) => {
  const key = workspaceSlug && meetingId ? `meeting|${workspaceSlug}|${meetingId}` : null;

  const { data, error, isLoading, mutate, isValidating } = useSWR<IMeeting>(
    key,
    () => meetingService.retrieve(workspaceSlug!, meetingId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  return {
    meeting: data,
    isLoading,
    isValidating,
    error,
    mutate,
  };
};

/**
 * useIssueMeetings: lista dei meeting linkati a una specifica issue.
 * Filtrata per visibility (solo meeting di cui l'utente e' creator/attendee).
 */
export const useIssueMeetings = (
  workspaceSlug: string | undefined | null,
  issueId: string | undefined | null
) => {
  const key = workspaceSlug && issueId ? `issue-meetings|${workspaceSlug}|${issueId}` : null;

  const { data, error, isLoading, mutate, isValidating } = useSWR<IMeeting[]>(
    key,
    () => meetingService.issueMeetings(workspaceSlug!, issueId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  return {
    meetings: data || [],
    isLoading,
    isValidating,
    error,
    mutate,
  };
};
