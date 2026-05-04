/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34f-1 + v1.35a-3:
 *  v1.34f-1: componente che renderizza i meeting block per una specifica
 *            data dentro le Calendar view. Iniettato in issue-blocks.tsx
 *            accanto agli issue blocks.
 *  v1.35a-3: aggiunta icona RefreshCw quando il meeting e' ricorrente
 *            (recurrence_rule != null o is_occurrence flag dal backend
 *            v1.35a-1). Click su un'occorrenza passa anche l'occurrence_date
 *            al detail modal cosi' la modale puo' mostrare "Occurrence of
 *            DD/MM/YYYY" (v1.35a-3 detail modal).
 *
 *  Visual: replica esatta del pattern stock CalendarIssueBlock (stesso
 *  bg-surface-1/hover:bg-surface-2, stesso h-10/md:h-8, stesso border-b
 *  border-subtle, stesso text-13 md:text-11). Differenze rispetto a un
 *  issue card:
 *   - stripe verticale colorata = accent-primary (blu Plane) fisso, per
 *     distinguere visivamente il meeting dall'issue (che usa lo state
 *     color del progetto).
 *   - icona Calendar al posto del project IssueIdentifier.
 *   - icona RefreshCw piccola se ricorrente (v1.35a-3).
 *   - "11:00" (ora di start) al posto della sequence id.
 *   - title al posto del issue.name.
 *   - status RSVP indicator se != accepted (piccolo).
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Calendar, RefreshCw } from "lucide-react";
import { cn } from "@plane/utils";
import type { IMeeting, TMeetingAttendeeStatus } from "@/services/meeting.service";
import { useUser } from "@/hooks/store/user";
import { useMeetingsForDate } from "@/components/meetings/meetings-calendar-context";
import { MeetingDetailModal } from "@/components/meetings/detail-modal";

type Props = {
  date: Date;
};

const formatTimeShort = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const STATUS_DOT: Record<TMeetingAttendeeStatus, string> = {
  accepted: "bg-success-primary",
  tentative: "bg-warning-primary",
  declined: "bg-danger-primary",
  invited: "bg-accent-primary",
};

export const CalendarMeetingBlocks = observer(function CalendarMeetingBlocks({ date }: Props) {
  const meetings = useMeetingsForDate(date);
  const { data: currentUser } = useUser();
  // v1.35a-3: oltre all'id passiamo anche l'occurrence_date per mostrare
  // banner "Occurrence of DD/MM/YYYY" nel detail modal.
  const [selected, setSelected] = useState<{ id: string; occurrenceDate?: string } | null>(null);

  if (meetings.length === 0) return null;

  return (
    <>
      {meetings.map((m: IMeeting) => {
        const myAttendee = m.attendees?.find((a) => a.user === currentUser?.id);
        const myStatus = myAttendee?.status;
        // v1.35a-3: meeting ricorrente?
        const isRecurring = !!m.recurrence_rule || m.is_occurrence === true;
        // Key univoca: per occorrenze virtuali multiple dello stesso master
        // l'id si ripete, quindi includiamo occurrence_date come tie-breaker.
        const blockKey = m.is_occurrence && m.occurrence_date
          ? `${m.id}-${m.occurrence_date}`
          : m.id;

        return (
          <div
            key={blockKey}
            className="relative cursor-pointer p-1 px-2"
            onClick={() =>
              setSelected({
                id: m.id,
                occurrenceDate: m.is_occurrence ? m.occurrence_date : undefined,
              })
            }
          >
            <div className="block w-full rounded-sm border-b border-subtle bg-surface-1 hover:bg-surface-2 md:border-[1px] text-13 text-primary">
              <div
                className={cn(
                  "group/calendar-meeting flex h-10 w-full items-center justify-between gap-1.5 rounded-sm px-4 py-1.5 md:h-8 md:px-1"
                )}
              >
                <div className="flex h-full items-center gap-1.5 truncate">
                  {/* stripe verticale = blu accent (distingue da state color
                      degli issue card) */}
                  <span className="h-full w-0.5 flex-shrink-0 rounded-sm bg-accent-primary" />
                  <Calendar className="size-3.5 flex-shrink-0 text-secondary" />
                  {/* v1.35a-3: indicatore visivo recurrence */}
                  {isRecurring && (
                    <RefreshCw
                      className="size-3 flex-shrink-0 text-secondary"
                      aria-label="Recurring meeting"
                    />
                  )}
                  {!m.all_day && (
                    <span className="text-13 font-medium text-secondary md:text-11 md:font-regular flex-shrink-0">
                      {formatTimeShort(m.start_at)}
                    </span>
                  )}
                  <div className="truncate text-13 font-medium md:text-11 md:font-regular">
                    {m.title}
                  </div>
                </div>
                {/* RSVP status dot, solo se non accepted (default ok) */}
                {myStatus && myStatus !== "accepted" && (
                  <span
                    className={cn(
                      "size-1.5 flex-shrink-0 rounded-full",
                      STATUS_DOT[myStatus]
                    )}
                    title={`Your RSVP: ${myStatus}`}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
      {selected && (
        <MeetingDetailModal
          meetingId={selected.id}
          occurrenceDate={selected.occurrenceDate}
          isOpen={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
});
