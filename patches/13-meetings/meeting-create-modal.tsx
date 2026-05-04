/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d + v1.35a-2:
 *  Modal "Create meeting" + "Edit meeting" (riusato via mode="edit").
 *  Usa ModalCore da @plane/ui per coerenza visiva con il resto di Plane
 *  (overlay backdrop + z-index + transizioni gestite dal core).
 *
 *  v1.35a-2: aggiunto campo "Repeat" (preset Daily/Weekly/Weekdays/Monthly
 *  by date / Monthly by day) + fine ricorrenza (Forever / Ends on date /
 *  After N occurrences). Genera stringa RRULE (RFC 5545) lato client e la
 *  manda al backend nel campo `recurrence_rule`. In edit mode parsa la
 *  RRULE esistente per ripopolare il preset (custom rule non
 *  riconosciute mostrano warning read-only).
 */

import { useState, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { Calendar, X, RefreshCw } from "lucide-react";
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

// v1.35a-2: codici giorno settimana RFC 5545. Indice = JS Date.getDay()
// (0 = Sunday, 1 = Monday, ...).
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TRepeatPreset =
  | "none"
  | "daily"
  | "weekly"
  | "weekdays"
  | "monthly_date"
  | "monthly_day"
  | "yearly"
  | "custom"; // sentinella read-only per RRULE non riconosciute in edit
type TRepeatEndType = "forever" | "until" | "count";

/**
 * Costruisce stringa RRULE da preset + fine ricorrenza.
 * Ritorna null se preset === "none" o "custom".
 */
const buildRRule = (
  preset: TRepeatPreset,
  startDate: Date,
  endType: TRepeatEndType,
  untilDate: string,
  count: number,
): string | null => {
  if (preset === "none" || preset === "custom") return null;
  const parts: string[] = [];
  switch (preset) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly":
      parts.push("FREQ=WEEKLY");
      parts.push(`BYDAY=${WEEKDAY_CODES[startDate.getDay()]}`);
      break;
    case "weekdays":
      parts.push("FREQ=WEEKLY");
      parts.push("BYDAY=MO,TU,WE,TH,FR");
      break;
    case "monthly_date":
      parts.push("FREQ=MONTHLY");
      parts.push(`BYMONTHDAY=${startDate.getDate()}`);
      break;
    case "monthly_day": {
      // Ordinale del weekday nel mese: 1=primo, 2=secondo, ... 4=quarto.
      // Per il quinto/ultimo usiamo -1 (ultimo del mese) se day > 28.
      const ordinal = Math.ceil(startDate.getDate() / 7);
      const n = ordinal > 4 ? -1 : ordinal;
      parts.push("FREQ=MONTHLY");
      parts.push(`BYDAY=${n}${WEEKDAY_CODES[startDate.getDay()]}`);
      break;
    }
    case "yearly":
      parts.push("FREQ=YEARLY");
      break;
  }
  if (endType === "until" && untilDate) {
    // RRULE UNTIL deve essere YYYYMMDDTHHMMSSZ in UTC.
    // Prendiamo end-of-day per essere inclusivi della data scelta.
    const u = new Date(`${untilDate}T23:59:59Z`);
    if (!isNaN(u.getTime())) {
      const utc = u.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      parts.push(`UNTIL=${utc}`);
    }
  } else if (endType === "count" && count > 0) {
    parts.push(`COUNT=${count}`);
  }
  return parts.join(";");
};

/**
 * Parsa una RRULE esistente per ripopolare il preset in edit mode.
 * Se la rule non matcha nessuno dei preset noti, ritorna preset="custom"
 * (read-only nel modal: l'utente puo' solo lasciarla cosi' o sostituirla
 * con un preset).
 */
const parseRRule = (
  rrule: string | null | undefined,
): {
  preset: TRepeatPreset;
  endType: TRepeatEndType;
  untilDate: string;
  count: number;
} => {
  if (!rrule) return { preset: "none", endType: "forever", untilDate: "", count: 0 };
  const tokens: Record<string, string> = {};
  rrule.split(";").forEach((kv) => {
    const eq = kv.indexOf("=");
    if (eq <= 0) return;
    tokens[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1).toUpperCase();
  });

  let preset: TRepeatPreset = "custom";
  if (tokens.FREQ === "DAILY" && !tokens.BYDAY && !tokens.BYMONTHDAY) {
    preset = "daily";
  } else if (tokens.FREQ === "WEEKLY") {
    if (tokens.BYDAY === "MO,TU,WE,TH,FR") preset = "weekdays";
    else if (tokens.BYDAY && !tokens.BYDAY.includes(",")) preset = "weekly";
  } else if (tokens.FREQ === "MONTHLY") {
    if (tokens.BYMONTHDAY) preset = "monthly_date";
    else if (tokens.BYDAY && /^-?\d/.test(tokens.BYDAY)) preset = "monthly_day";
  } else if (tokens.FREQ === "YEARLY" && !tokens.BYDAY && !tokens.BYMONTH) {
    preset = "yearly";
  }

  let endType: TRepeatEndType = "forever";
  let untilDate = "";
  let count = 0;
  if (tokens.UNTIL) {
    endType = "until";
    const u = tokens.UNTIL;
    if (u.length >= 8) {
      untilDate = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    }
  } else if (tokens.COUNT) {
    endType = "count";
    count = parseInt(tokens.COUNT, 10) || 0;
  }
  return { preset, endType, untilDate, count };
};

const previewText = (
  preset: TRepeatPreset,
  startDate: Date,
  endType: TRepeatEndType,
  untilDate: string,
  count: number,
): string => {
  if (preset === "none") return "";
  if (preset === "custom") return "Custom rule (cannot edit here)";
  let head = "";
  switch (preset) {
    case "daily":
      head = "Daily";
      break;
    case "weekly":
      head = `Weekly on ${WEEKDAY_LABELS[startDate.getDay()]}`;
      break;
    case "weekdays":
      head = "Every weekday (Mon–Fri)";
      break;
    case "monthly_date":
      head = `Monthly on day ${startDate.getDate()}`;
      break;
    case "monthly_day": {
      const ordinal = Math.ceil(startDate.getDate() / 7);
      const ordLabels = ["", "first", "second", "third", "fourth", "last"];
      const ord = ordinal > 4 ? "last" : ordLabels[ordinal] || "";
      head = `Monthly on the ${ord} ${WEEKDAY_LABELS[startDate.getDay()]}`;
      break;
    }
    case "yearly":
      head = "Yearly";
      break;
  }
  let tail = "";
  if (endType === "until" && untilDate) tail = `, until ${untilDate}`;
  else if (endType === "count" && count > 0) tail = `, ${count} occurrence${count === 1 ? "" : "s"}`;
  return head + tail;
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
  // v1.35a-2: recurrence state
  const [repeatPreset, setRepeatPreset] = useState<TRepeatPreset>("none");
  const [repeatEndType, setRepeatEndType] = useState<TRepeatEndType>("forever");
  const [repeatUntilDate, setRepeatUntilDate] = useState<string>("");
  const [repeatCount, setRepeatCount] = useState<number>(10);
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
      // v1.35a-2: ripopola dalla RRULE esistente.
      const parsed = parseRRule(initialMeeting.recurrence_rule);
      setRepeatPreset(parsed.preset);
      setRepeatEndType(parsed.endType);
      setRepeatUntilDate(parsed.untilDate);
      setRepeatCount(parsed.count || 10);
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
      // v1.35a-2: default no recurrence.
      setRepeatPreset("none");
      setRepeatEndType("forever");
      setRepeatUntilDate("");
      setRepeatCount(10);
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

  // v1.35a-2: anteprima testuale della rule. Memo per evitare ricalcolo.
  const recurrencePreview = useMemo(() => {
    if (!startAt) return "";
    const d = new Date(startAt);
    if (isNaN(d.getTime())) return "";
    return previewText(repeatPreset, d, repeatEndType, repeatUntilDate, repeatCount);
  }, [repeatPreset, startAt, repeatEndType, repeatUntilDate, repeatCount]);

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

    // v1.35a-2: costruisci RRULE da preset (a meno che sia "custom" in edit
    // mode: in quel caso preserviamo la rule originale).
    let rrule: string | null = null;
    let recurrenceUntil: string | null = null;
    if (repeatPreset === "custom" && initialMeeting?.recurrence_rule) {
      rrule = initialMeeting.recurrence_rule;
      recurrenceUntil = initialMeeting.recurrence_until || null;
    } else if (repeatPreset !== "none") {
      const startD = new Date(startISO);
      rrule = buildRRule(repeatPreset, startD, repeatEndType, repeatUntilDate, repeatCount);
      // Se end-type=until salviamo anche recurrence_until separato (utile
      // per query/filter lato backend senza dover parsare la stringa).
      if (repeatEndType === "until" && repeatUntilDate) {
        const u = new Date(`${repeatUntilDate}T23:59:59Z`);
        if (!isNaN(u.getTime())) recurrenceUntil = u.toISOString();
      }
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
      // v1.35a-2: campi recurrence (null se "none").
      recurrence_rule: rrule,
      recurrence_until: recurrenceUntil,
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

          {/* v1.35a-2: Repeat field */}
          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="size-3" /> Repeat
              </span>
            </label>
            <select
              value={repeatPreset}
              onChange={(e) => setRepeatPreset(e.target.value as TRepeatPreset)}
              className={inputClass}
              disabled={repeatPreset === "custom"}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="weekdays">Every weekday (Mon–Fri)</option>
              <option value="monthly_date">Monthly (same date)</option>
              <option value="monthly_day">Monthly (same weekday)</option>
              <option value="yearly">Yearly</option>
              {repeatPreset === "custom" && (
                <option value="custom">Custom rule (read-only)</option>
              )}
            </select>
            {repeatPreset === "custom" && (
              <p className="text-11 text-warning-primary mt-1">
                This meeting uses a custom RRULE not editable here. Save without
                touching this field to preserve it, or pick a preset to replace.
              </p>
            )}
          </div>

          {repeatPreset !== "none" && repeatPreset !== "custom" && (
            <div className="rounded-md border border-subtle bg-surface-1 p-3 space-y-3">
              <div>
                <label className={labelClass}>Ends</label>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-13 text-primary cursor-pointer">
                    <input
                      type="radio"
                      name="repeat-end"
                      checked={repeatEndType === "forever"}
                      onChange={() => setRepeatEndType("forever")}
                    />
                    Never (no end date)
                  </label>
                  <label className="flex items-center gap-2 text-13 text-primary cursor-pointer">
                    <input
                      type="radio"
                      name="repeat-end"
                      checked={repeatEndType === "until"}
                      onChange={() => setRepeatEndType("until")}
                    />
                    On date
                    {repeatEndType === "until" && (
                      <input
                        type="date"
                        value={repeatUntilDate}
                        onChange={(e) => setRepeatUntilDate(e.target.value)}
                        className="ml-2 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-13"
                      />
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-13 text-primary cursor-pointer">
                    <input
                      type="radio"
                      name="repeat-end"
                      checked={repeatEndType === "count"}
                      onChange={() => setRepeatEndType("count")}
                    />
                    After
                    {repeatEndType === "count" && (
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={repeatCount}
                        onChange={(e) => setRepeatCount(parseInt(e.target.value || "1", 10))}
                        className="ml-2 w-20 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-13"
                      />
                    )}
                    occurrences
                  </label>
                </div>
              </div>
              {recurrencePreview && (
                <p className="text-11 text-secondary italic">
                  {recurrencePreview}
                </p>
              )}
            </div>
          )}

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
