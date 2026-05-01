/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Sostituisce lo stub vuoto stock di `IssueWorklogProperty`
 *  (apps/web/ce/components/issues/worklog/property/root.tsx) con la
 *  nostra implementazione Time Tracking. Pattern A travestito: lo slot
 *  esiste gia' nel sidebar.tsx (detail) e properties.tsx (peek), il
 *  vero worklog stock ritorna `<></>` (paid feature in Plane One).
 *  Sostituendo qui evitiamo di patchare quei due file e abbiamo la
 *  feature visibile in entrambi automaticamente.
 *
 *  Mantengono la stessa signature dello stub: {workspaceSlug, projectId,
 *  issueId, disabled}.
 *
 *  Render:
 *    ┌─ Time tracking ─────────────────────┐
 *    │ Logged: 2h 45m                      │
 *    │ [+ Log time]   [▶ Start timer]      │
 *    │ <RecentLogsList/>                   │
 *    └─────────────────────────────────────┘
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Clock, Play, Square, Plus } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

import { useTimeLogs } from "@/hooks/use-time-logs";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { formatDurationHM, formatDurationHMS } from "@/lib/format-duration";
import { ManualLogModal } from "@/components/issues/time-tracking/manual-log-modal";
import { RecentLogsList } from "@/components/issues/time-tracking/recent-logs-list";

type TIssueWorklogProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

// Re-export stesso nome cosi' lo slot esistente continua a funzionare
// senza patchare i file sidebar.tsx / properties.tsx.
export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;

  const [manualModalOpen, setManualModalOpen] = useState(false);

  const { totalSeconds, refresh: refreshLogs } = useTimeLogs(workspaceSlug, projectId, issueId);
  const { timer, isOnIssue, start, stop, cancel } = useActiveTimer(workspaceSlug);

  const timerOnThis = isOnIssue(issueId);
  const timerOnOther = timer !== null && !timerOnThis;

  const handleStart = async () => {
    try {
      await start({ issue_id: issueId });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Timer started",
        message: "Click Stop to log the time when you're done.",
      });
    } catch (err: any) {
      // 409: timer gia' attivo su un'altra issue
      if (err?.active_timer) {
        const otherName =
          err.active_timer.issue_name || `${err.active_timer.project_identifier ?? ""}-${err.active_timer.issue_sequence_id ?? "?"}`;
        if (confirm(`A timer is already running on "${otherName}". Stop it and start a new one here?`)) {
          try {
            await stop({});
            await start({ issue_id: issueId });
            setToast({ type: TOAST_TYPE.SUCCESS, title: "Switched timer to this task" });
          } catch (e: any) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "Failed to switch timer",
              message: e?.detail || e?.error || "Unknown error",
            });
          }
        }
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to start timer",
        message: err?.detail || err?.error || "Unknown error",
      });
    }
  };

  const handleStop = async () => {
    try {
      const result = await stop({});
      if (result.log_created) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Timer stopped",
          message: result.log ? `Logged ${formatDurationHM(result.log.duration_seconds)}` : "Time logged",
        });
        refreshLogs();
      } else {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Timer cancelled",
          message: result.error || "No log created",
        });
      }
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to stop timer",
        message: err?.detail || err?.error || "Unknown error",
      });
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel timer without logging the time?")) return;
    try {
      await cancel();
      setToast({ type: TOAST_TYPE.INFO, title: "Timer cancelled" });
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to cancel timer",
        message: err?.detail || err?.error || "Unknown error",
      });
    }
  };

  // Display timer su questa issue: aggiungiamo "elapsed_seconds + (now - last_sync)"
  // per UX live, anche se SWR fa polling ogni 5s.
  const liveElapsed = timer ? Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000) : 0;

  return (
    <div className="flex items-start gap-2">
      <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-12 text-tertiary">
        <Clock className="size-4 shrink-0" />
        <span>Time tracking</span>
      </div>
      <div className="flex grow flex-col gap-1.5">
        {/* Riga 1: totale loggato + (eventuale) timer attivo su questa issue */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-12 font-medium text-primary">
            Logged: {formatDurationHM(totalSeconds)}
          </span>
          {timerOnThis && (
            <span className="flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-11 font-medium text-success-strong">
              <span className="size-1.5 animate-pulse rounded-full bg-success-strong" />
              {formatDurationHMS(liveElapsed)}
            </span>
          )}
          {timerOnOther && (
            <Tooltip
              tooltipContent={`Timer running on ${timer?.issue_name ?? "another task"}. Stop it first.`}
            >
              <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-11 font-medium text-warning-strong">
                Timer on other task
              </span>
            </Tooltip>
          )}
        </div>

        {/* Riga 2: bottoni azioni */}
        {!disabled && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="neutral-primary"
              onClick={() => setManualModalOpen(true)}
              prependIcon={<Plus className="size-3.5" />}
            >
              Log time
            </Button>

            {timerOnThis ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleStop}
                  prependIcon={<Square className="size-3.5" />}
                >
                  Stop
                </Button>
                <Button size="sm" variant="link-neutral" onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="accent-primary"
                onClick={handleStart}
                prependIcon={<Play className="size-3.5" />}
              >
                Start timer
              </Button>
            )}
          </div>
        )}

        {/* Riga 3: ultimi log */}
        <RecentLogsList
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          disabled={disabled}
        />

        {/* Modal manual log */}
        <ManualLogModal
          isOpen={manualModalOpen}
          onClose={() => setManualModalOpen(false)}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
        />
      </div>
    </div>
  );
});
