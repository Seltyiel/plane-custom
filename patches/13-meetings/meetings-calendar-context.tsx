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
import { useFeatureSettings } from "@/hooks/use-feature-settings";
import type { IMeeting } from "@/services/meeting.service";

// PATCH v1.34h-2: flag toggle Show/Hide meetings nel Calendar.
// Storage: workspace_feature_settings (per-workspace, admin-only PATCH).
const SHOW_FLAG_KEY = "meetings_show_in_calendar";

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
  // PATCH v1.34h-2: leggi il flag toggle. Se off -> passa workspaceSlug=null
  // a useMeetings cosi' SWR key e' null e niente fetch (e niente dati cachati
  // della precedente fetch saranno usati perche' SWR ritorna data=undefined).
  // NB: non basta passare filters=undefined perche' useMeetings fa fetch
  // senza from/to comunque.
  const { getFlag } = useFeatureSettings(workspaceSlug);
  const enabled = getFlag<boolean>(SHOW_FLAG_KEY, true);

  // Convert YYYY-MM-DD a ISO datetime per i filtri backend.
  // startDate / endDate sono inclusivi del giorno -> espandi a tutto il giorno.
  const fromIso = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined;
  const toIso = endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined;

  const filters = useMemo(() => {
    if (!fromIso || !toIso) return undefined;
    return projectId ? { from: fromIso, to: toIso, project_id: projectId } : { from: fromIso, to: toIso };
  }, [fromIso, toIso, projectId]);

  // Passo slug=null se toggle off -> SWR non fetcha -> meetings=[].
  const effectiveSlug = enabled ? workspaceSlug : "";
  const { meetings, isLoading } = useMeetings(effectiveSlug, filters);

  // Map: ISO date string YYYY-MM-DD -> meeting[].
  // PATCH v1.34h-1: multi-day events. Per ogni meeting cicliamo dal giorno
  // di start_at al giorno di end_at (inclusi, midnight locale), e indexiamo
  // il meeting su ogni giorno coperto. Cosi' un meeting da 04/05 12:00 a
  // 06/05 14:00 appare nelle celle 04, 05 e 06.
  const byDate = useMemo(() => {
    const map = new Map<string, IMeeting[]>();
    const MAX_DAYS = 30; // safety cap per meeting con end_at malformato
    for (const m of meetings) {
      // Skip cancelled meetings nella vista calendar (rimangono visibili
      // solo nel detail modal o nella pagina /meetings/ tab "past/cancelled").
      if (m.is_cancelled) continue;
      // Skip audit-only entries (admin con feature flag): non sono meeting
      // dell'utente ma metadata di altri, niente render in calendar.
      if (m.is_audit_only) continue;

      const startMs = new Date(m.start_at).getTime();
      const endMs = new Date(m.end_at).getTime();
      if (Number.isNaN(startMs)) continue;

      // Cursore al midnight del giorno di start (locale).
      const cursor = new Date(m.start_at);
      cursor.setHours(0, 0, 0, 0);
      // End-day al midnight (incluso). Se end_at e' invalid, fallback a 1
      // solo giorno (start day).
      const endCursor = new Date(Number.isNaN(endMs) ? startMs : m.end_at);
      endCursor.setHours(0, 0, 0, 0);

      let safety = 0;
      while (cursor.getTime() <= endCursor.getTime() && safety < MAX_DAYS) {
        const key = renderFormattedPayloadDate(cursor) || "";
        if (key) {
          const arr = map.get(key);
          if (arr) arr.push(m);
          else map.set(key, [m]);
        }
        cursor.setDate(cursor.getDate() + 1);
        safety += 1;
      }
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
