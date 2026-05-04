/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d:
 *  Modal "Create meeting" + "Edit meeting" (riusato via mode="edit").
 *  Usa ModalCore da @plane/ui per coerenza visiva con il resto di Plane
 *  (overlay backdrop + z-index + transizioni gestite dal core).
 */

import { useState, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { Calendar, X } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import {
  MeetingService,
  type IMeeting,
  type IMeetingCreatePayload,
} from "@/services/meeting.service";

const meetingService = new MeetingService();

const dateTimeLocalToISO = (value: string): string => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
};

const isoToDateTimeLocal = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (m: IMeeting) => void;
  mode?: "create" | "edit";
  initialMeeting?: IMeeting;
  onUpdated?: (m: IMeeting) => void;
  // v1.34e: scheduling da task. Pre-popola il project + auto-link al task
  // post-create.
  initialIssueId?: string;
  initialProjectId?: string;
};

export const MeetingCreateModal = observer(function MeetingCreateModal(props: Props) {
  const {
    isOpen, onClose, onCreated, mode = "create", initialMeeting, onUpdated,
    initialIssueId, initialProjectId,
  } = props;
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() || "";
  const { joinedProjectIds, getProjectById, workspaceHiddenProjectId } = useProject();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(15);
  const [projectId, setProjectId] = useState<string | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && initialMeeting && isOpen) {
      setTitle(initialMeeting.title || "");
      setDescription(initialMeeting.description || "");
      setLocation(initialMeeting.location || "");
      setStartAt(isoToDateTimeLocal(initialMeeting.start_at));
      setEndAt(isoToDateTimeLocal(initialMeeting.end_at));
      setAllDay(initialMeeting.all_day || false);
      setReminderMinutesBefore(initialMeeting.reminder_minutes_before ?? 15);
      setProjectId(initialMeeting.project || "");
    } else if (mode === "create" && isOpen) {
      const now = new Date();
      const minutes = now.getMinutes();
      const roundUp = minutes < 30 ? 30 : 60;
      now.setMinutes(roundUp === 60 ? 0 : 30, 0, 0);
      if (roundUp === 60) now.setHours(now.getHours() + 1);
      const end = new Date(now);
      end.setHours(end.getHours() + 1);
      setStartAt(isoToDateTimeLocal(now.toISOString()));
      setEndAt(isoToDateTimeLocal(end.toISOString()));
      setTitle("");
      setDescription("");
      setLocation("");
      setAllDay(false);
      setReminderMinutesBefore(15);
      // v1.34e: se invocato da task, pre-seleziona il project del task.
      setProjectId(initialProjectId || "");
    }
    setError(null);
  }, [mode, initialMeeting, isOpen]);

  const projectOptions = useMemo(() => {
    const ids = (joinedProjectIds ?? []).filter((id) => id !== workspaceHiddenProjectId);
    return ids
      .map((id) => {
        const p = getProjectById(id);
        return p ? { id, name: p.name } : null;
      })
      .filter((x): x is { id: string; name: string } => x !== null);
  }, [joinedProjectIds, workspaceHiddenProjectId, getProjectById]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!startAt || !endAt) {
      setError("Start and end are required");
      return;
    }
    const startISO = dateTimeLocalToISO(startAt);
    const endISO = dateTimeLocalToISO(endAt);
    if (new Date(endISO).getTime() < new Date(startISO).getTime()) {
      setError("End must be at or after start");
      return;
    }

    const payload: IMeetingCreatePayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start_at: startISO,
      end_at: endISO,
      all_day: allDay,
      reminder_minutes_before: reminderMinutesBefore,
      project: projectId || null,
    };

    setSubmitting(true);
    try {
      if (mode === "edit" && initialMeeting) {
        const updated = await meetingService.update(slug, initialMeeting.id, payload);
        onUpdated?.(updated);
      } else {
        const created = await meetingService.create(slug, payload);
        // v1.34e: auto-link all'issue di partenza, se presente.
        if (initialIssueId) {
          try {
            await meetingService.addIssueLink(slug, created.id, { issue_id: initialIssueId });
          } catch (linkErr) {
            // L'errore di link non blocca il flusso: il meeting e' stato creato.
            // Il consumer puo' decidere se mostrare un avviso al refresh.
            console.warn("Auto-link to issue failed:", linkErr);
          }
        }
        onCreated?.(created);
      }
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.error || "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-13 text-primary placeholder:text-placeholder focus:outline-none focus:border-accent-primary";
  const labelClass = "text-body-xs-medium text-secondary mb-1 block";

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !submitting && onClose()}
      position={EModalPosition.CENTER}
      width={EModalWidth.XL}
    >
      {/* v1.34e-3: data-prevent-outside-click evita che il peek (parent)
          si chiuda quando l'utente clicca dentro la modale. Vedi
          usePeekOverviewOutsideClickDetector hook stock. */}
      <form onSubmit={handleSubmit} data-prevent-outside-click="meeting-modal">
        <div className="flex items-center justify-between p-4 border-b border-subtle">
          <h3 className="flex items-center gap-2 text-base font-semibold text-primary">
            <div className="size-7 rounded-md bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="size-4 text-accent-primary" />
            </div>
            {mode === "edit" ? "Edit meeting" : "Create meeting"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-primary"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className={labelClass}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Meeting title"
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Agenda, notes..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start *</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? startAt.slice(0, 10) : startAt}
                onChange={(e) =>
                  setStartAt(allDay ? `${e.target.value}T00:00` : e.target.value)
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>End *</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? endAt.slice(0, 10) : endAt}
                onChange={(e) =>
                  setEndAt(allDay ? `${e.target.value}T23:59` : e.target.value)
                }
                className={inputClass}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-3.5 rounded"
            />
            <span className="text-13 text-secondary">All-day event</span>
          </label>

          <div>
            <label className={labelClass}>Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
              placeholder="https://meet.example.com/abc or office room"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Reminder (min)</label>
              <input
                type="number"
                min={0}
                step={5}
                value={reminderMinutesBefore}
                onChange={(e) => setReminderMinutesBefore(parseInt(e.target.value || "0", 10))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass}
              >
                <option value="">Workspace-level (no project)</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="text-11 text-danger-primary bg-danger-primary/10 px-2 py-1.5 rounded">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-subtle">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={submitting}>
            {mode === "edit" ? "Save changes" : "Create meeting"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
