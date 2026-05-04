/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34e:
 *  Sezione "Meetings" nel sidebar issue detail.
 *  Mostra i meeting linkati al task, permette di crearne nuovi pre-popolati
 *  con il task corrente (auto-link via MeetingIssueLink).
 *
 *  Iniettato in sidebar.tsx accanto a IssueWorklogProperty (v1.34e patch).
 *  Riusa MeetingCreateModal e MeetingDetailModal di v1.34d.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Calendar, Plus, Users, Clock, MapPin } from "lucide-react";
import { Button } from "@plane/propel/button";
// hooks
import { useIssueMeetings } from "@/hooks/use-meetings";
// services
import type { IMeeting } from "@/services/meeting.service";
// modal
import { MeetingCreateModal } from "@/components/meetings/create-modal";
import { MeetingDetailModal } from "@/components/meetings/detail-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

const formatRangeShort = (m: IMeeting): string => {
  if (m.all_day) {
    const d = new Date(m.start_at);
    return d.toLocaleDateString();
  }
  const s = new Date(m.start_at);
  const e = new Date(m.end_at);
  const sd = s.toLocaleDateString();
  const ed = e.toLocaleDateString();
  const st = s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const et = e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sd === ed) return `${sd}, ${st} - ${et}`;
  return `${sd} ${st} → ${ed} ${et}`;
};

export const IssueMeetingsProperty = observer(function IssueMeetingsProperty(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false } = props;

  const { meetings, isLoading, mutate } = useIssueMeetings(workspaceSlug, issueId);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const visibleMeetings = (meetings || []).filter((m) => !m.is_cancelled);

  return (
    <div className="mt-2 pt-2 border-t border-custom-border-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-body-xs-medium text-custom-text-200">
          <Calendar className="size-3.5 text-custom-text-300" />
          <span>Meetings</span>
          {!isLoading && (
            <span className="text-custom-text-400">({visibleMeetings.length})</span>
          )}
        </div>
        {!disabled && (
          <Button
            variant="link-primary"
            size="sm"
            prependIcon={<Plus className="size-3" />}
            onClick={() => setCreateOpen(true)}
            className="!px-1 !py-0 text-xs"
          >
            Schedule
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-custom-text-400 px-2 py-3">Loading...</div>
      ) : visibleMeetings.length === 0 ? (
        <div className="text-xs text-custom-text-400 px-2 py-3 italic">
          No meetings linked. Click "Schedule" to add one.
        </div>
      ) : (
        <ul className="space-y-1">
          {visibleMeetings.map((m) => (
            <li
              key={m.id}
              onClick={() => setSelectedMeetingId(m.id)}
              className="cursor-pointer rounded-md border border-custom-border-200 bg-custom-background-100 hover:bg-custom-background-90 px-2.5 py-1.5 transition-colors"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Calendar className="size-3.5 text-custom-text-300 flex-shrink-0" />
                <span className="text-sm text-custom-text-100 font-medium truncate">{m.title}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-custom-text-300 ml-5">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatRangeShort(m)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" />
                  {m.attendees?.length || 0}
                </span>
                {m.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="size-3" />
                    <span className="truncate max-w-[100px]">{m.location}</span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <MeetingCreateModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        initialIssueId={issueId}
        initialProjectId={projectId}
        onCreated={() => {
          setCreateOpen(false);
          mutate();
        }}
      />
      {selectedMeetingId && (
        <MeetingDetailModal
          meetingId={selectedMeetingId}
          isOpen={!!selectedMeetingId}
          onClose={() => setSelectedMeetingId(null)}
          onChanged={() => mutate()}
        />
      )}
    </div>
  );
});
