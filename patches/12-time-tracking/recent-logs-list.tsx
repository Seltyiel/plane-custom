/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Lista degli ultimi log su un'issue. Mostrata sotto il TimeTrackingSection.
 *  Cap visivo: 5 entries + "View all (N)" se ce ne sono di piu' (per ora
 *  "View all" e' un placeholder no-op, in v1.33e linkera' al timesheet).
 *
 *  Per ogni log:
 *   - Avatar utente
 *   - Tempo (es. "2h 30m")
 *   - Description (truncated)
 *   - Data ("Today" / "Yesterday" / "DD MMM")
 *   - Bottone X per delete (solo se owner)
 */

import { observer } from "mobx-react";
import { Trash2 } from "lucide-react";
import { Avatar } from "@plane/propel/avatar";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useTimeLogs } from "@/hooks/use-time-logs";
import { useUser } from "@/hooks/store/user";
import { formatDurationHM } from "@/lib/format-duration";
import type { TTimeLog } from "@/services/time-log.service";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

const formatLogDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const logDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (logDay.getTime() === today.getTime()) return "Today";
  if (logDay.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
};

const VISIBLE_LIMIT = 5;

export const RecentLogsList = observer(function RecentLogsList(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;

  const { logs, isLoading, remove } = useTimeLogs(workspaceSlug, projectId, issueId);
  const { data: currentUser } = useUser();

  if (isLoading && logs.length === 0) {
    return <p className="mt-2 text-11 text-tertiary">Loading...</p>;
  }

  if (logs.length === 0) {
    return null; // Niente messaggio "no logs" - lo mostra TimeTrackingSection
  }

  const visible = logs.slice(0, VISIBLE_LIMIT);
  const hidden = logs.length - VISIBLE_LIMIT;

  const handleDelete = async (log: TTimeLog) => {
    if (!confirm(`Delete log: ${formatDurationHM(log.duration_seconds)}?`)) return;
    try {
      await remove(log.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Log deleted" });
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to delete",
        message: err?.detail || err?.error || "Unknown error",
      });
    }
  };

  return (
    <div className="mt-2 space-y-1">
      {visible.map((log) => {
        const isOwner = currentUser?.id === log.user;
        const canDelete = !disabled && isOwner && (log.approval_status === "auto" || log.approval_status === "pending");

        return (
          <div key={log.id} className="group flex items-center gap-2 rounded-sm px-2 py-1 text-12 hover:bg-layer-2">
            <Avatar src={log.user_avatar_url ?? undefined} name={log.user_display_name} size="sm" />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-primary">{formatDurationHM(log.duration_seconds)}</span>
                <span className="text-tertiary">·</span>
                <span className="text-tertiary">{formatLogDate(log.logged_at)}</span>
                {log.source === "timer" ? (
                  <Tooltip tooltipContent="Logged via timer">
                    <span className="text-11 text-tertiary">⏱</span>
                  </Tooltip>
                ) : null}
                {log.approval_status === "pending" ? (
                  <Tooltip tooltipContent="Pending approval">
                    <span className="text-11 text-warning-strong">⏳</span>
                  </Tooltip>
                ) : log.approval_status === "rejected" ? (
                  <Tooltip tooltipContent={log.rejection_reason || "Rejected"}>
                    <span className="text-11 text-danger-strong">✕</span>
                  </Tooltip>
                ) : null}
              </div>
              {log.description ? (
                <p className="truncate text-11 text-secondary" title={log.description}>
                  {log.description}
                </p>
              ) : null}
            </div>

            {canDelete && (
              <button
                type="button"
                onClick={() => handleDelete(log)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                title="Delete log"
              >
                <Trash2 className="size-3.5 text-danger-strong" />
              </button>
            )}
          </div>
        );
      })}

      {hidden > 0 ? (
        <p className="mt-1 text-11 text-tertiary">+ {hidden} more (timesheet page coming in v1.33e)</p>
      ) : null}
    </div>
  );
});
