/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d:
 *  Root della Meetings page. List view in tabella + bottone "Create meeting"
 *  + dispatcher per Create modal e Detail/Edit modal.
 *
 *  Architettura:
 *   - useMeetings(slug) -> SWR list di tutti i meeting visibili.
 *   - State locale: createOpen + selectedMeetingId.
 *   - Tabella ordinata per start_at, mostra: title, when, location,
 *     attendees count, RSVP-mio, actions kebab (cancel se creator).
 *   - Click su row -> apre MeetingDetailModal con il meeting selezionato.
 *   - Cancel meeting -> conferma + cancel API + revalidate.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { Plus, Calendar, MapPin, Users, Clock, RefreshCw } from "lucide-react";
import { Button } from "@plane/propel/button";
// hooks
import { useUser } from "@/hooks/store/user";
import { useMeetings } from "@/hooks/use-meetings";
// services
import type { IMeeting, IMeetingAttendee } from "@/services/meeting.service";
// local
import { MeetingCreateModal } from "@/components/meetings/create-modal";
import { MeetingDetailModal } from "@/components/meetings/detail-modal";

const formatRange = (m: IMeeting): string => {
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
  return `${sd} ${st} - ${ed} ${et}`;
};

const getMyAttendee = (m: IMeeting, userId: string | undefined): IMeetingAttendee | undefined => {
  if (!userId) return undefined;
  return m.attendees?.find((a) => a.user === userId);
};

const StatusPill = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    accepted: "bg-success-primary/10 text-success-primary",
    tentative: "bg-warning-primary/10 text-warning-primary",
    declined: "bg-danger-primary/10 text-danger-primary",
    invited: "bg-accent-primary/10 text-accent-primary",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-11 font-medium ${
        styles[status] || "bg-surface-2 text-secondary"
      }`}
    >
      {status}
    </span>
  );
};

export const MeetingsRoot = observer(function MeetingsRoot() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() || "";
  const { data: currentUser } = useUser();

  const { meetings, isLoading, mutate } = useMeetings(slug);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // v1.35a-3: deduplica le occorrenze virtuali (is_occurrence=true).
  // Il backend ritorna anche le N occorrenze espanse di un meeting
  // ricorrente; nella list workspace-level vogliamo mostrare solo i
  // master (1 riga per meeting), non l'espansione settimana per settimana.
  // Il Calendar view (che passa from/to) e' l'altro consumer e li
  // vuole espansi - quindi de-dup solo lato list.
  const masters = useMemo(
    () => meetings.filter((m) => !m.is_occurrence),
    [meetings],
  );

  const sorted = useMemo(() => {
    return [...masters].sort((a, b) => {
      const sa = new Date(a.start_at).getTime();
      const sb = new Date(b.start_at).getTime();
      return sa - sb;
    });
  }, [masters]);

  const upcoming = sorted.filter((m) => new Date(m.end_at).getTime() >= Date.now() && !m.is_cancelled);
  const past = sorted.filter((m) => new Date(m.end_at).getTime() < Date.now() || m.is_cancelled);

  const renderRow = (m: IMeeting) => {
    const me = getMyAttendee(m, currentUser?.id);
    const isCreator = currentUser?.id === m.created_by;
    const attendeeCount = m.attendees?.length || 0;
    return (
      <tr
        key={m.id}
        onClick={() => setSelectedMeetingId(m.id)}
        className="cursor-pointer border-b border-subtle hover:bg-surface-2 transition-colors"
      >
        <td className="px-3 py-3 align-middle">
          <div className="flex items-center gap-2">
            <Calendar className="size-3.5 text-secondary flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-13 font-medium text-primary truncate flex items-center gap-1.5">
                {m.title}
                {/* v1.35a-3: indicatore visivo recurring meeting nella list. */}
                {m.recurrence_rule && (
                  <RefreshCw
                    className="size-3 text-secondary flex-shrink-0"
                    aria-label="Recurring meeting"
                  />
                )}
              </div>
              {m.is_audit_only && (
                <div className="text-11 text-warning-primary mt-0.5">audit-only</div>
              )}
              {m.is_cancelled && (
                <div className="text-11 text-danger-primary mt-0.5">cancelled</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-middle text-13 text-secondary">
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-placeholder" />
            {formatRange(m)}
          </div>
        </td>
        <td className="px-3 py-3 align-middle text-13 text-secondary">
          {m.location ? (
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-placeholder" />
              <span className="truncate max-w-[200px]">{m.location}</span>
            </div>
          ) : (
            <span className="text-placeholder">—</span>
          )}
        </td>
        <td className="px-3 py-3 align-middle text-13 text-secondary">
          <div className="flex items-center gap-1.5">
            <Users className="size-3.5 text-placeholder" />
            {attendeeCount}
          </div>
        </td>
        <td className="px-3 py-3 align-middle">
          {me ? (
            <StatusPill status={me.status} />
          ) : (
            <span className="text-placeholder text-11">—</span>
          )}
        </td>
        <td className="px-3 py-3 align-middle text-11 text-secondary">
          {isCreator ? "you" : m.creator_display_name || ""}
        </td>
      </tr>
    );
  };

  const renderTable = (rows: IMeeting[], emptyLabel: string) => {
    if (rows.length === 0) {
      return (
        <div className="text-center text-secondary text-13 py-8 border border-dashed border-subtle rounded-md">
          {emptyLabel}
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-md border border-subtle bg-surface-1">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-subtle text-left text-11 uppercase text-secondary">
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Attendees</th>
              <th className="px-3 py-2 font-medium">My RSVP</th>
              <th className="px-3 py-2 font-medium">Organizer</th>
            </tr>
          </thead>
          <tbody>{rows.map(renderRow)}</tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-primary">Meetings</h2>
          <p className="text-11 text-secondary mt-0.5">
            {isLoading ? "Loading..." : `${meetings.length} total`}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="size-3.5" />}
          onClick={() => setCreateOpen(true)}
        >
          Create meeting
        </Button>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-body-xs-medium text-secondary uppercase mb-2">Upcoming</h3>
          {renderTable(upcoming, "No upcoming meetings")}
        </section>
        <section>
          <h3 className="text-body-xs-medium text-secondary uppercase mb-2">Past / Cancelled</h3>
          {renderTable(past, "No past meetings")}
        </section>
      </div>

      <MeetingCreateModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
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
