/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Modal per loggare ore manualmente. Chiamato da TimeTrackingSection
 *  con click su "+ Log time".
 *
 *  Form fields:
 *   - Duration (HH:MM o "1h 30m") - parsing tramite parseDurationToSeconds
 *   - Date logged (default oggi)
 *   - Description (opzionale)
 *
 *  Submit chiama useTimeLogs.create() che fa POST + optimistic update.
 */

import { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { Clock } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useTimeLogs } from "@/hooks/use-time-logs";
import { parseDurationToSeconds, formatDurationHM } from "@/lib/format-duration";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

// Format YYYY-MM-DDTHH:mm per <input type="datetime-local">
const localDateTimeForInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ManualLogModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, issueId } = props;

  const { create } = useTimeLogs(workspaceSlug, projectId, issueId);

  const [duration, setDuration] = useState("1:00");
  const [loggedAt, setLoggedAt] = useState(localDateTimeForInput(new Date()));
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form when opening
      setDuration("1:00");
      setLoggedAt(localDateTimeForInput(new Date()));
      setDescription("");
      setDurationError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const parsedSeconds = parseDurationToSeconds(duration);
  const durationPreview = parsedSeconds !== null ? formatDurationHM(parsedSeconds) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDurationError(null);

    if (parsedSeconds === null) {
      setDurationError("Invalid format. Use HH:MM (e.g. 1:30) or '1h 30m'.");
      return;
    }
    if (parsedSeconds <= 0) {
      setDurationError("Duration must be positive.");
      return;
    }
    if (parsedSeconds > 86400 * 7) {
      setDurationError("Duration cannot exceed 7 days.");
      return;
    }

    setSubmitting(true);
    try {
      await create({
        duration_seconds: parsedSeconds,
        logged_at: new Date(loggedAt).toISOString(),
        description: description.trim() || undefined,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Time logged",
        message: `${formatDurationHM(parsedSeconds)} saved.`,
      });
      onClose();
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to log time",
        message: err?.detail || err?.error || "Unknown error",
      });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel
          className="w-full max-w-md rounded-md border border-strong bg-layer-1 p-5 shadow-lg"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Dialog.Title className="mb-3 flex items-center gap-2 text-15 font-semibold text-primary">
            <Clock className="size-4" />
            Log time
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-12 font-medium text-secondary">Duration</label>
              <input
                type="text"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  setDurationError(null);
                }}
                placeholder="1:30 or 1h 30m"
                className="w-full rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-13 text-primary outline-none focus:border-strong"
                autoFocus
              />
              {durationError ? (
                <p className="mt-1 text-11 text-danger-strong">{durationError}</p>
              ) : durationPreview ? (
                <p className="mt-1 text-11 text-tertiary">= {durationPreview}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-12 font-medium text-secondary">Date</label>
              <input
                type="datetime-local"
                value={loggedAt}
                onChange={(e) => setLoggedAt(e.target.value)}
                className="w-full rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-13 text-primary outline-none focus:border-strong"
              />
            </div>

            <div>
              <label className="mb-1 block text-12 font-medium text-secondary">
                Description <span className="text-tertiary">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What did you work on?"
                className="w-full resize-none rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-13 text-primary outline-none focus:border-strong"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="neutral-primary" size="sm" onClick={onClose} type="button" disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" loading={submitting} disabled={submitting}>
                Log time
              </Button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
