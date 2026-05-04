/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d:
 *  Modal Detail/Edit Meeting con info + RSVP + attendees + issue links +
 *  edit + cancel. Usa ModalCore da @plane/ui per coerenza con stock.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import {
  X, Calendar, Clock, MapPin, Users, Edit3, Trash2,
  Check, Slash, HelpCircle, Plus, ExternalLink,
} from "lucide-react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useUser } from "@/hooks/store/user";
import { useMeetingDetail } from "@/hooks/use-meetings";
import { useMember } from "@/hooks/store/use-member";
// services
import {
  MeetingService,
  type IMeeting,
  type IMeetingAttendee,
  type TMeetingAttendeeStatus,
} from "@/services/meeting.service";
// local
import { MeetingCreateModal } from "@/components/meetings/create-modal";

const meetingService = new MeetingService();

const formatRange = (m: IMeeting): string => {
  if (m.all_day) {
    const d = new Date(m.start_at);
    return `${d.toLocaleDateString()} (all day)`;
  }
  const s = new Date(m.start_at);
  const e = new Date(m.end_at);
  const sd = s.toLocaleDateString();
  const ed = e.toLocaleDateString();
  const st = s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const et = e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sd === ed) return `${sd} ${st} - ${et}`;
  return `${sd} ${st} -> ${ed} ${et}`;
};

const StatusBadge = ({ status }: { status: TMeetingAttendeeStatus }) => {
  const styles: Record<TMeetingAttendeeStatus, string> = {
    accepted: "bg-green-100 text-green-800",
    tentative: "bg-yellow-100 text-yellow-800",
    declined: "bg-red-100 text-red-800",
    invited: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`text-[11px] rounded px-2 py-0.5 font-medium ${styles[status]}`}>
      {status}
    </span>
  );
};

type Props = {
  meetingId: string;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export const MeetingDetailModal = observer(function MeetingDetailModal(props: Props) {
  const { meetingId, isOpen, onClose, onChanged } = props;
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const slug = workspaceSlug?.toString() || "";
  const { data: currentUser } = useUser();
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();

  const { meeting, isLoading, mutate } = useMeetingDetail(slug, meetingId);

  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddAttendee, setShowAddAttendee] = useState(false);
  const [newAttendeeUserId, setNewAttendeeUserId] = useState("");
  const [newAttendeeEmail, setNewAttendeeEmail] = useState("");
  const [newAttendeeName, setNewAttendeeName] = useState("");

  const isCreator = !!meeting && currentUser?.id === meeting.created_by;
  const myAttendee = meeting?.attendees?.find((a) => a.user === currentUser?.id);
  const isAuditOnly = !!meeting?.is_audit_only;

  const handleRsvp = async (status: TMeetingAttendeeStatus, comment?: string) => {
    if (!meeting) return;
    setBusy(true);
    setError(null);
    try {
      await meetingService.rsvp(slug, meeting.id, { status, comment });
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.error || e?.detail || "RSVP failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!meeting) return;
    if (!confirm(`Cancel meeting "${meeting.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const reason = prompt("Reason (optional):") || undefined;
      await meetingService.cancel(slug, meeting.id, reason);
      await mutate();
      onChanged?.();
      onClose();
    } catch (e: any) {
      setError(e?.error || e?.detail || "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddAttendee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meeting) return;
    setBusy(true);
    setError(null);
    try {
      if (newAttendeeUserId) {
        await meetingService.addAttendee(slug, meeting.id, { user_id: newAttendeeUserId });
      } else if (newAttendeeEmail) {
        await meetingService.addAttendee(slug, meeting.id, {
          external_email: newAttendeeEmail.trim(),
          display_name: newAttendeeName.trim() || undefined,
        });
      } else {
        setError("Pick a member or enter an external email");
        return;
      }
      setNewAttendeeUserId("");
      setNewAttendeeEmail("");
      setNewAttendeeName("");
      setShowAddAttendee(false);
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.error || e?.detail || "Add attendee failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAttendee = async (attendeeId: string) => {
    if (!meeting) return;
    if (!confirm("Remove this attendee?")) return;
    setBusy(true);
    setError(null);
    try {
      await meetingService.removeAttendee(slug, meeting.id, attendeeId);
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.error || e?.detail || "Remove attendee failed");
    } finally {
      setBusy(false);
    }
  };

  // v1.34e-2: click su issue link -> chiudi modal + naviga alla pagina full issue.
  const handleOpenIssue = (issueId: string, projectId: string | null) => {
    if (!projectId) return; // workspace-level issues: skip per ora (fallback futuro)
    onClose();
    navigate(`/${slug}/projects/${projectId}/issues/${issueId}`);
  };

  const handleRemoveIssueLink = async (linkId: string) => {
    if (!meeting) return;
    setBusy(true);
    setError(null);
    try {
      await meetingService.removeIssueLink(slug, meeting.id, linkId);
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.error || e?.detail || "Unlink failed");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-custom-border-200 bg-custom-background-100 px-2.5 py-1.5 text-sm text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none focus:border-custom-primary-100";

  const renderAttendee = (a: IMeetingAttendee) => {
    const isExternal = !a.user;
    const isSelf = a.user === currentUser?.id;
    const canRemove = isCreator && !isSelf;
    return (
      <li
        key={a.id}
        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-custom-background-90"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-6 rounded-full bg-custom-background-80 flex items-center justify-center text-[11px] text-custom-text-200 flex-shrink-0">
            {(a.user_display_name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-custom-text-100 truncate">
              {a.user_display_name}
              {isExternal && (
                <span className="text-[10px] ml-1.5 text-custom-text-300">(external)</span>
              )}
              {isSelf && (
                <span className="text-[10px] ml-1.5 text-custom-primary-100">(you)</span>
              )}
            </div>
            <div className="text-[11px] text-custom-text-300 truncate">{a.user_email}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={a.status} />
          {canRemove && (
            <button
              type="button"
              onClick={() => handleRemoveAttendee(a.id)}
              disabled={busy}
              className="text-custom-text-300 hover:text-red-600"
              title="Remove attendee"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      <ModalCore
        isOpen={isOpen}
        handleClose={() => !busy && onClose()}
        position={EModalPosition.CENTER}
        width={EModalWidth.XXL}
      >
        {/* v1.34e-3: data-prevent-outside-click evita la chiusura del peek
            (parent) quando l'utente clicca dentro la modale. */}
        <div data-prevent-outside-click="meeting-modal">
        <div className="flex items-start justify-between p-4 border-b border-custom-border-200">
          <div className="flex items-start gap-2 min-w-0">
            <Calendar className="size-4 text-custom-text-300 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-custom-text-100 truncate">
                {isLoading ? "Loading..." : meeting?.title || "(meeting)"}
                {meeting?.is_cancelled && (
                  <span className="text-xs ml-2 text-red-700">cancelled</span>
                )}
                {isAuditOnly && (
                  <span className="text-xs ml-2 text-yellow-700">audit-only</span>
                )}
              </h3>
              {meeting && (
                <div className="text-xs text-custom-text-300 mt-0.5 flex items-center gap-1.5">
                  <Clock className="size-3" />
                  {formatRange(meeting)}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-custom-text-300 hover:text-custom-text-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {!meeting && !isLoading && (
          <div className="p-6 text-center text-sm text-custom-text-300">
            Meeting not found.
          </div>
        )}

        {meeting && (
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {meeting.location && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-custom-text-300" />
                <a
                  href={meeting.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-custom-primary-100 hover:underline truncate"
                >
                  {meeting.location}
                </a>
              </div>
            )}
            {meeting.description && (
              <div className="text-sm text-custom-text-200 whitespace-pre-wrap">
                {meeting.description}
              </div>
            )}
            <div className="text-xs text-custom-text-300">
              Organizer:{" "}
              <span className="text-custom-text-200">{meeting.creator_display_name || "-"}</span>
              <span className="mx-2">·</span>
              Reminder:{" "}
              <span className="text-custom-text-200">
                {meeting.reminder_minutes_before}m before
              </span>
            </div>

            {myAttendee && !meeting.is_cancelled && !isAuditOnly && (
              <div className="border-t border-custom-border-200 pt-3">
                <div className="text-xs font-medium text-custom-text-200 mb-2">
                  Your RSVP: <StatusBadge status={myAttendee.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => handleRsvp("accepted")}
                    disabled={busy}
                    prependIcon={<Check className="size-3.5" />}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="neutral-primary"
                    size="sm"
                    onClick={() => handleRsvp("tentative")}
                    disabled={busy}
                    prependIcon={<HelpCircle className="size-3.5" />}
                  >
                    Tentative
                  </Button>
                  <Button
                    variant="link-danger"
                    size="sm"
                    onClick={() => handleRsvp("declined")}
                    disabled={busy}
                    prependIcon={<Slash className="size-3.5" />}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            )}

            {!isAuditOnly && (
              <div className="border-t border-custom-border-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-custom-text-200 flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    Attendees ({meeting.attendees?.length || 0})
                  </div>
                  {isCreator && (
                    <button
                      type="button"
                      onClick={() => setShowAddAttendee(!showAddAttendee)}
                      className="text-xs text-custom-primary-100 hover:underline flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Add
                    </button>
                  )}
                </div>
                {showAddAttendee && (
                  <form
                    onSubmit={handleAddAttendee}
                    className="bg-custom-background-90 rounded p-3 mb-2 space-y-2"
                  >
                    <select
                      value={newAttendeeUserId}
                      onChange={(e) => {
                        setNewAttendeeUserId(e.target.value);
                        if (e.target.value) {
                          setNewAttendeeEmail("");
                          setNewAttendeeName("");
                        }
                      }}
                      className={inputClass}
                    >
                      <option value="">-- Pick workspace member --</option>
                      {(workspaceMemberIds || []).map((id) => {
                        const m = getWorkspaceMemberDetails(id);
                        if (!m) return null;
                        return (
                          <option key={id} value={id}>
                            {m.member?.display_name || m.member?.email || id}
                          </option>
                        );
                      })}
                    </select>
                    <div className="text-[10px] text-custom-text-300 text-center">
                      or add external
                    </div>
                    <input
                      type="email"
                      value={newAttendeeEmail}
                      onChange={(e) => {
                        setNewAttendeeEmail(e.target.value);
                        if (e.target.value) setNewAttendeeUserId("");
                      }}
                      placeholder="external@example.com"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={newAttendeeName}
                      onChange={(e) => setNewAttendeeName(e.target.value)}
                      placeholder="Display name (optional)"
                      disabled={!newAttendeeEmail}
                      className={inputClass}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="neutral-primary"
                        size="sm"
                        onClick={() => setShowAddAttendee(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" variant="primary" size="sm" loading={busy}>
                        Add
                      </Button>
                    </div>
                  </form>
                )}
                <ul className="space-y-0.5">{meeting.attendees?.map(renderAttendee)}</ul>
              </div>
            )}

            {!isAuditOnly && meeting.issue_links && meeting.issue_links.length > 0 && (
              <div className="border-t border-custom-border-200 pt-3">
                <div className="text-xs font-medium text-custom-text-200 mb-2">
                  Linked work items
                </div>
                <ul className="space-y-1">
                  {meeting.issue_links.map((l) => (
                    <li
                      key={l.id}
                      onClick={() => handleOpenIssue(l.issue, l.project_id)}
                      className="cursor-pointer flex items-center justify-between py-1 px-2 rounded hover:bg-custom-background-90"
                    >
                      <div className="text-sm text-custom-text-200 flex items-center gap-2 min-w-0">
                        <ExternalLink className="size-3.5 text-custom-text-300 flex-shrink-0" />
                        <span className="text-[11px] text-custom-text-300">
                          {l.project_identifier}-{l.issue_sequence_id}
                        </span>
                        <span className="truncate">{l.issue_name}</span>
                      </div>
                      {isCreator && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveIssueLink(l.id);
                          }}
                          disabled={busy}
                          className="text-custom-text-300 hover:text-red-600"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{error}</div>
            )}
          </div>
        )}

        {isCreator && meeting && !meeting.is_cancelled && (
          <div className="flex justify-between gap-2 p-4 border-t border-custom-border-200">
            <Button
              variant="link-danger"
              size="sm"
              onClick={handleCancel}
              disabled={busy}
              prependIcon={<Trash2 className="size-3.5" />}
            >
              Cancel meeting
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={busy}
              prependIcon={<Edit3 className="size-3.5" />}
            >
              Edit
            </Button>
          </div>
        )}
        </div>
      </ModalCore>

      {meeting && (
        <MeetingCreateModal
          mode="edit"
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          initialMeeting={meeting}
          onUpdated={() => {
            setEditOpen(false);
            mutate();
            onChanged?.();
          }}
        />
      )}
    </>
  );
});
