/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34f:
 *  Componente che renderizza i meeting block per una specifica data
 *  dentro le Calendar view (workspace, project, profile).
 *  Iniettato in issue-blocks.tsx (full-replacement) accanto agli issue
 *  blocks per la stessa giornata.
 *
 *  Visual: chip blu/cyan compatto con icona Calendar, ora di start, titolo.
 *  Distinto visivamente dagli issue card (che usano colori state).
 *  Click -> apre MeetingDetailModal (riuso v1.34d).
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Calendar } from "lucide-react";
import type { IMeeting } from "@/services/meeting.service";
import { useMeetingsForDate } from "@/components/meetings/meetings-calendar-context";
import { MeetingDetailModal } from "@/components/meetings/detail-modal";

type Props = {
  date: Date;
};

const formatTimeShort = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const CalendarMeetingBlocks = observer(function CalendarMeetingBlocks({ date }: Props) {
  const meetings = useMeetingsForDate(date);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  if (meetings.length === 0) return null;

  return (
    <>
      {meetings.map((m: IMeeting) => (
        <div
          key={m.id}
          className="relative cursor-pointer p-1 px-2"
          onClick={() => setSelectedMeetingId(m.id)}
        >
          <div className="flex items-center gap-1.5 rounded-sm border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-1 text-[11px] transition-colors">
            <Calendar className="size-3 text-blue-700 flex-shrink-0" />
            {!m.all_day && (
              <span className="text-blue-700 font-medium flex-shrink-0">
                {formatTimeShort(m.start_at)}
              </span>
            )}
            <span className="truncate text-blue-900 font-medium">{m.title}</span>
          </div>
        </div>
      ))}
      {selectedMeetingId && (
        <MeetingDetailModal
          meetingId={selectedMeetingId}
          isOpen={!!selectedMeetingId}
          onClose={() => setSelectedMeetingId(null)}
        />
      )}
    </>
  );
});
