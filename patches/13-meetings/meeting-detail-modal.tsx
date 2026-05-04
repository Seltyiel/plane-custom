/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34f-2:
 *  Detail modal con layout Plane-native: SidebarPropertyListItem stock per
 *  le proprieta' (Organizer, When, Location, Reminder), section header
 *  text-body-xs-medium, ButtonAvatars per gli avatar attendee. Tutti i
 *  pattern visuali replicano il sidebar dell'issue detail Plane.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import {
  X, Calendar, Clock, MapPin, Users, Edit3, Trash2,
  Check, Slash, HelpCircle, Plus, Bell, Link2,
} from "lucide-react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@plane/propel/button";
import {
  StartDatePropertyIcon,
  UserCirclePropertyIcon,
  MembersPropertyIcon,
} from "@plane/propel/icons";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
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
  if (sd === ed) return `${sd} · ${st} → ${et}`;
  return `${sd} ${st} → ${ed} ${et}`;
};

const StatusBadge = ({ status }: { status: TMeetingAttendeeStatus }) => {
  const styles: Record<TMeetingAttendeeStatus, string> = {
    accepted: "bg-success-primary/10 text-success-primary",
    tentative: "bg-warning-primary/10 text-warning-primary",
    declined: "bg-danger-primary/10 text-danger-primary",
    invited: "bg-accent-primary/10 text-accent-primary",
  };
  return (
    <span className={`text-11 rounded px-2 py-0.5 font-medium ${styles[status]}`}>
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

  const handleOpenIssue = (issueId: string, projectId: string | null) => {
    if (!projectId) return;
    onClose();
    navigate(`/${slug}/projects/${projectId}/issues/${issueId}`);
  };

  const inputClass =
    "w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-13 text-primary placeholder:text-placeholder focus:outline-none focus:border-accent-primary";

  const renderAttendee = (a: IMeetingAttendee) => {
    const isExternal = !a.user;
    const isSelf = a.user === currentUser?.id;
    const canRemove = isCreator && !isSelf;
    return (
      <li
        key={a.id}
        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExternal ? (
            <div className="size-6 rounded-full bg-surface-2 flex items-center justify-center text-11 text-secondary flex-shrink-0">
              {(a.user_display_name || "?").slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div className="flex-shrink-0">
              <ButtonAvatars showTooltip userIds={a.user || ""} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-13 text-primary truncate">
              {a.user_display_name}
              {isExternal && (
                <span className="text-11 ml-1.5 text-secondary">(external)</span>
              )}
              {isSelf && (
                <span className="text-11 ml-1.5 text-accent-primary">(you)</span>
              )}
            </div>
            <div className="text-11 text-secondary truncate">{a.user_email}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={a.status} />
          {canRemove && (
            <button
              type="button"
              onClick={() => handleRemoveAttendee(a.id)}
              disabled={busy}
              className="text-secondary hover:text-danger-primary"
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
        <div data-prevent-outside-click="meeting-modal">
          {/* HEADER */}
          <div className="flex items-start justify-between p-4 border-b border-subtle">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="size-8 rounded-md bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="size-4 text-accent-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-primary truncate">
                  {isLoading ? "Loading..." : meeting?.title || "(meeting)"}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {meeting && (
                    <span className="text-11 text-secondary flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatRange(meeting)}
                    </span>
                  )}
                  {meeting?.is_cancelled && (
                    <span className="text-11 px-1.5 py-0.5 rounded bg-danger-primary/10 text-danger-primary font-medium">
                      cancelled
                    </span>
                  )}
                  {isAuditOnly && (
                    <span className="text-11 px-1.5 py-0.5 rounded bg-warning-primary/10 text-warning-primary font-medium">
                      audit-only
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-secondary hover:text-primary flex-shrink-0"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {!meeting && !isLoading && (
            <div className="p-6 text-center text-13 text-secondary">Meeting not found.</div>
          )}

          {meeting && (
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* DESCRIPTION */}
              {meeting.description && (
                <p className="text-13 text-secondary whitespace-pre-wrap">
                  {meeting.description}
                </p>
              )}

              {/* PROPERTIES */}
              <div>
                <h5 className="text-body-xs-medium text-secondary mb-2">Properties</h5>
                <div className="space-y-2.5">
                  <SidebarPropertyListItem icon={UserCirclePropertyIcon} label="Organizer">
                    <span className="text-13 text-primary px-2">
                      {meeting.creator_display_name || "—"}
                    </span>
                  </SidebarPropertyListItem>

                  <SidebarPropertyListItem icon={StartDatePropertyIcon} label="When">
                    <span className="text-13 text-primary px-2">{formatRange(meeting)}</span>
                  </SidebarPropertyListItem>

                  {meeting.location && (
                    <SidebarPropertyListItem
                      icon={(props: { className?: string }) => <MapPin {...props} />}
                      label="Location"
                    >
                      <a
                        href={meeting.location}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-13 text-accent-primary hover:underline truncate px-2"
                      >
                        {meeting.location}
                      </a>
                    </SidebarPropertyListItem>
                  )}

                  <SidebarPropertyListItem
                    icon={(props: { className?: string }) => <Bell {...props} />}
                    label="Reminder"
                  >
                    <span className="text-13 text-primary px-2">
                      {meeting.reminder_minutes_before}m before
                    </span>
                  </SidebarPropertyListItem>
                </div>
              </div>

              {/* RSVP */}
              {myAttendee && !meeting.is_cancelled && !isAuditOnly && (
                <div className="border-t border-subtle pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-body-xs-medium text-secondary">Your RSVP</h5>
                    <StatusBadge status={myAttendee.status} />
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

              {/* ATTENDEES */}
              {!isAuditOnly && (
                <div className="border-t border-subtle pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-body-xs-medium text-secondary flex items-center gap-1.5">
                      <MembersPropertyIcon className="size-3.5" />
                      Attendees ({meeting.attendees?.length || 0})
                    </h5>
                    {isCreator && (
                      <button
                        type="button"
                        onClick={() => setShowAddAttendee(!showAddAttendee)}
                        className="text-11 text-accent-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="size-3" /> Add
                      </button>
                    )}
                  </div>
                  {showAddAttendee && (
                    <form
                      onSubmit={handleAddAttendee}
                      className="bg-surface-2 rounded p-3 mb-2 space-y-2"
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
                        <option value="">— Pick workspace member —</option>
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
                      <div className="text-11 text-placeholder text-center">or add external</div>
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

              {/* LINKED WORK ITEMS */}
              {!isAuditOnly && meeting.issue_links && meeting.issue_links.length > 0 && (
                <div className="border-t border-subtle pt-4">
                  <h5 className="text-body-xs-medium text-secondary flex items-center gap-1.5 mb-2">
                    <Link2 className="size-3.5" />
                    Linked work items
                  </h5>
                  <ul className="space-y-1">
                    {meeting.issue_links.map((l) => (
                      <li
                        key={l.id}
                        onClick={() => handleOpenIssue(l.issue, l.project_id)}
                        className="cursor-pointer flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2 transition-colors"
                      >
                        <div className="text-13 text-primary flex items-center gap-2 min-w-0">
                          <span className="text-11 text-secondary font-mono flex-shrink-0">
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
                            className="text-secondary hover:text-danger-primary flex-shrink-0"
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
                <div className="text-11 text-danger-primary bg-danger-primary/10 px-2 py-1.5 rounded">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* FOOTER */}
          {isCreator && meeting && !meeting.is_cancelled && (
            <div className="flex justify-between gap-2 p-4 border-t border-subtle">
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
