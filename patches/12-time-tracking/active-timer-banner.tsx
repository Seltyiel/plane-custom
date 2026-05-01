/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33d:
 *  Banner persistente in cima alle pagine workspace quando l'utente
 *  ha un ActiveTimer in corso. Mostra:
 *   - Icona pulsante (cronometro live)
 *   - "Working on PROJECT-NN: Issue title"
 *   - Cronometro HH:MM:SS che incrementa client-side ogni secondo
 *   - [Stop] -> ferma + crea TimeLog
 *   - [Cancel] -> cancella senza creare log
 *   - [→] click sul titolo: naviga al task
 *
 *  Layout: sticky top-0 z-40 dentro il WorkspaceContentWrapper, cosi'
 *  resta visibile durante scroll della pagina ma non sovrappone le
 *  sidebar (AppRail / WorkspaceSidebar). Si nasconde se nessun timer.
 *
 *  Tick live: useState + setInterval(1000ms) sul componente. Il polling
 *  SWR a 5s del hook useActiveTimer fa il resync di sicurezza
 *  (es. timer fermato da un'altra tab).
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Square, X, Play } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { formatDurationHM, formatDurationHMS } from "@/lib/format-duration";

type Props = {
  workspaceSlug: string;
};

export const ActiveTimerBanner = observer(function ActiveTimerBanner(props: Props) {
  const { workspaceSlug } = props;

  const { timer, stop, cancel } = useActiveTimer(workspaceSlug);

  // Tick locale per il display HH:MM:SS, indipendente dal polling SWR.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  if (!timer) return null;

  const startedAtMs = new Date(timer.started_at).getTime();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));

  const issueLabel = timer.issue_name
    ? `${timer.project_identifier ?? ""}-${timer.issue_sequence_id ?? "?"}: ${timer.issue_name}`
    : "Untitled issue";

  // Link al task: se abbiamo project_id e issue id, costruiamo URL.
  // Schema URL Plane: /<workspaceSlug>/projects/<projectId>/issues/<issueId>/
  const taskHref =
    timer.project_id && timer.issue
      ? `/${workspaceSlug}/projects/${timer.project_id}/issues/${timer.issue}/`
      : null;

  const handleStop = async () => {
    try {
      const result = await stop({});
      if (result.log_created && result.log) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Timer stopped",
          message: `Logged ${formatDurationHM(result.log.duration_seconds)}`,
        });
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
        title: "Failed to cancel",
        message: err?.detail || err?.error || "Unknown error",
      });
    }
  };

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-success-strong/30 bg-success-subtle/40 px-4 py-1.5 backdrop-blur-sm"
      role="status"
      aria-label="Active timer"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Live indicator + cronometro */}
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-strong opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success-strong" />
          </span>
          <span className="font-mono text-13 font-semibold text-success-strong">
            {formatDurationHMS(elapsedSec)}
          </span>
        </div>

        {/* Issue label - clickable se taskHref */}
        <span className="truncate text-12 text-secondary">
          Working on{" "}
          {taskHref ? (
            <Link to={taskHref} className="font-medium text-primary hover:underline">
              {issueLabel}
            </Link>
          ) : (
            <span className="font-medium text-primary">{issueLabel}</span>
          )}
        </span>

        {/* Description (se settata) */}
        {timer.description ? (
          <span className="hidden truncate text-11 text-tertiary md:inline">
            · {timer.description}
          </span>
        ) : null}
      </div>

      {/* Pulsanti azione */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip tooltipContent="Stop timer and log the time">
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-1 rounded-sm bg-success-strong px-2.5 py-1 text-11 font-medium text-white hover:bg-success-strong/90"
          >
            <Square className="size-3" />
            Stop
          </button>
        </Tooltip>

        <Tooltip tooltipContent="Cancel timer without logging">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center justify-center rounded-sm border border-subtle bg-layer-1 p-1 text-tertiary hover:text-danger-strong"
            aria-label="Cancel timer"
          >
            <X className="size-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
