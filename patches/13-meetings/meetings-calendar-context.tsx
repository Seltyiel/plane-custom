/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34f:
 *  Provider/context per i meeting nelle Calendar view.
 *  Fetch UNICA al range del mese visibile, expose getMeetingsForDate(date).
 *
 *  Iniettato in base-calendar-root.tsx (full-replacement) come wrapper di
 *  <CalendarChart/>. Consumato da issue-blocks.tsx (full-replacement) che
 *  renderizza i meeting blocks accanto agli issue blocks per la stessa
 *  giornata.
 *
 *  Privacy: GET /workspaces/<slug>/meetings/?from=&to= ritorna solo i
 *  meeting visibili all'utente (creator + attendee). Quindi SOLO i meeting
 *  di cui l'utente fa parte appariranno nelle Calendar view (richiesta
 *  utente: "comparissero queste attivita' nelle view calendar gia'
 *  esistenti, ma solo per i partecipanti").
 */

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { renderFormattedPayloadDate } from "@plane/utils";
import { useMeetings } from "@/hooks/use-meetings";
import type { IMeeting } from "@/services/meeting.service";

type CtxValue = {
  getMeetingsForDate: (date: Date) => IMeeting[];
  isLoading: boolean;
};

const MeetingsCalendarContext = createContext<CtxValue>({
  getMeetingsForDate: () => [],
  isLoading: false,
});

type ProviderProps = {
  workspaceSlug: string;
  startDate?: string; // YYYY-MM-DD (calendar layout range start)
  endDate?: string; // YYYY-MM-DD (calendar layout range end)
  projectId?: string; // se presente, filtra a project=projectId server-side
  children: ReactNode;
};

export function MeetingsCalendarProvider({
  workspaceSlug,
  startDate,
  endDate,
  projectId,
  children,
}: ProviderProps) {
  // Convert YYYY-MM-DD a ISO datetime per i filtri backend.
  // startDate / endDate sono inclusivi del giorno -> espandi a tutto il giorno.
  const fromIso = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined;
  const toIso = endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined;

  const filters = useMemo(() => {
    if (!fromIso || !toIso) return undefined;
    return projectId ? { from: fromIso, to: toIso, project_id: projectId } : { from: fromIso, to: toIso };
  }, [fromIso, toIso, projectId]);

  const { meetings, isLoading } = useMeetings(workspaceSlug, filters);

  // Map: ISO date string YYYY-MM-DD -> meeting[]. Indexato per start_at.
  const byDate = useMemo(() => {
    const map = new Map<string, IMeeting[]>();
    for (const m of meetings) {
      // Skip cancelled meetings nella vista calendar (rimangono visibili
      // solo nel detail modal o nella pagina /meetings/ tab "past/cancelled").
      if (m.is_cancelled) continue;
      // Skip audit-only entries (admin con feature flag): non sono meeting
      // dell'utente ma metadata di altri, niente render in calendar.
      if (m.is_audit_only) continue;
      const start = new Date(m.start_at);
      // Usiamo la chiave locale del giorno per allineare con
      // renderFormattedPayloadDate(date) che ritorna YYYY-MM-DD locale.
      const key = renderFormattedPayloadDate(start) || "";
      if (!key) continue;
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    // Sort per ora di start dentro lo stesso giorno
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return map;
  }, [meetings]);

  const value = useMemo<CtxValue>(
    () => ({
      getMeetingsForDate: (date: Date) => {
        const key = renderFormattedPayloadDate(date) || "";
        return byDate.get(key) || [];
      },
      isLoading,
    }),
    [byDate, isLoading]
  );

  return <MeetingsCalendarContext.Provider value={value}>{children}</MeetingsCalendarContext.Provider>;
}

export const useMeetingsForDate = (date: Date): IMeeting[] => {
  const { getMeetingsForDate } = useContext(MeetingsCalendarContext);
  return getMeetingsForDate(date);
};
