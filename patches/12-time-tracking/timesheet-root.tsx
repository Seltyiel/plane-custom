/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Root della Timesheet page.
 *
 *  Layout:
 *   ┌─ Filters bar ────────────────────────────────────────┐
 *   │ User [▼]  Project [▼]  Period [This week ▼]  Status [▼]│
 *   └──────────────────────────────────────────────────────┘
 *   ┌─ Summary cards ──────────────────────────────────────┐
 *   │ Total: 42h  │ Approved: 38h  │ Pending: 4h           │
 *   └──────────────────────────────────────────────────────┘
 *   ┌─ Logs table ─────────────────────────────────────────┐
 *   │ Date  User  Project  Issue  Hours  Status  Actions   │
 *   │ ...                                                  │
 *   └──────────────────────────────────────────────────────┘
 *
 *  Permessi: MEMBER vede solo i propri (filter user_id locked).
 *  ADMIN vede tutto e puo' approve/reject pending dalla tabella.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Check, ChevronDown, X, Trash2 } from "lucide-react";
import { Avatar } from "@plane/propel/avatar";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect } from "@plane/ui";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";

import { useUserPermissions, useUser } from "@/hooks/store/user";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import {
  TimeLogService,
  type TTimeLog,
  type TTimeLogReportQuery,
  type TTimeLogReportTotals,
} from "@/services/time-log.service";
import { formatDurationHM } from "@/lib/format-duration";

const service = new TimeLogService();

type Props = {
  workspaceSlug: string;
};

type PeriodKey = "today" | "this_week" | "this_month" | "last_30_days" | "all";

const PERIOD_OPTIONS: Record<PeriodKey, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  last_30_days: "Last 30 days",
  all: "All time",
};

const computePeriod = (key: PeriodKey): { from?: string; to?: string } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { from: start.toISOString() };
    case "this_week": {
      const dow = start.getDay() === 0 ? 7 : start.getDay(); // Sun=0->7
      const monday = new Date(start);
      monday.setDate(start.getDate() - (dow - 1));
      return { from: monday.toISOString() };
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: first.toISOString() };
    }
    case "last_30_days": {
      const past = new Date(start);
      past.setDate(start.getDate() - 30);
      return { from: past.toISOString() };
    }
    case "all":
    default:
      return {};
  }
};

const APPROVAL_OPTIONS: { key: TTimeLogReportQuery["approval_status"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "auto", label: "Auto-approved" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
];

export const TimesheetRoot = observer(function TimesheetRoot(props: Props) {
  const { workspaceSlug } = props;

  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.WORKSPACE
  );

  // Stores
  const { workspace } = useMember();
  const workspaceMemberIds = workspace?.workspaceMemberIds ?? [];
  const { getUserDetails } = useMember();
  const { workspaceProjectIds, getProjectById } = useProject();

  // Filters
  const [userId, setUserId] = useState<string>(currentUser?.id ?? "");
  const [projectId, setProjectId] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodKey>("this_week");
  const [approvalStatus, setApprovalStatus] =
    useState<TTimeLogReportQuery["approval_status"] | "all">("all");

  useEffect(() => {
    if (currentUser?.id && !userId) setUserId(currentUser.id);
  }, [currentUser?.id]);

  const query: TTimeLogReportQuery = useMemo(() => {
    const periodRange = computePeriod(period);
    const q: TTimeLogReportQuery = { ...periodRange };
    if (userId) q.user_id = userId;
    if (projectId !== "all") q.project_id = projectId;
    if (approvalStatus !== "all") q.approval_status = approvalStatus as any;
    return q;
  }, [userId, projectId, period, approvalStatus]);

  // SWR
  const cacheKey = workspaceSlug
    ? `TIMESHEET_${workspaceSlug}_${userId}_${projectId}_${period}_${approvalStatus}`
    : null;

  const { data, isLoading, mutate } = useSWR(
    cacheKey,
    () => service.report(workspaceSlug, query),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  const logs: TTimeLog[] = data?.logs ?? [];
  const totals: TTimeLogReportTotals = data?.totals ?? {
    total_seconds: 0,
    approved_seconds: 0,
    pending_seconds: 0,
    rejected_seconds: 0,
  };

  const handleApprove = async (log: TTimeLog) => {
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/time-logs/${log.id}/approve/`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrftoken": getCsrf() },
      }).then((r) => {
        if (!r.ok) throw r;
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Log approved" });
      mutate();
    } catch (err: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Failed to approve" });
    }
  };

  const handleReject = async (log: TTimeLog) => {
    const reason = prompt("Rejection reason (optional):");
    if (reason === null) return; // user cancelled
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/time-logs/${log.id}/reject/`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrftoken": getCsrf() },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      }).then((r) => {
        if (!r.ok) throw r;
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Log rejected" });
      mutate();
    } catch (err: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Failed to reject" });
    }
  };

  const handleDelete = async (log: TTimeLog) => {
    if (!confirm(`Delete log: ${formatDurationHM(log.duration_seconds)}?`)) return;
    try {
      await service.remove(workspaceSlug, log.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Log deleted" });
      mutate();
    } catch (err: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Failed to delete" });
    }
  };

  const memberOptions = workspaceMemberIds
    .map((id) => getUserDetails(id))
    .filter(Boolean)
    .map((m: any) => ({ id: m.id, name: m.display_name || m.email, avatar_url: m.avatar_url }));

  const userMenuItems = isAdmin
    ? [{ id: "", name: "All users", avatar_url: null }, ...memberOptions]
    : memberOptions.filter((m) => m.id === currentUser?.id);

  return (
    <div className="space-y-4 p-4">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-layer-1 p-3">
        <CustomSelect
          value={userId}
          label={
            userMenuItems.find((m) => m.id === userId)?.name ?? (isAdmin ? "All users" : "Me")
          }
          onChange={(v: string) => setUserId(v)}
          customButton={
            <button className="inline-flex items-center gap-1.5 rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium">
              User: {userMenuItems.find((m) => m.id === userId)?.name ?? "Me"}
              <ChevronDown className="size-3" />
            </button>
          }
        >
          {userMenuItems.map((m) => (
            <CustomSelect.Option key={m.id || "all"} value={m.id}>
              <div className="flex items-center gap-2">
                {m.avatar_url ? <Avatar src={m.avatar_url} name={m.name} size="sm" /> : null}
                <span className="text-12">{m.name}</span>
              </div>
            </CustomSelect.Option>
          ))}
        </CustomSelect>

        <CustomSelect
          value={projectId}
          label={
            projectId === "all"
              ? "All projects"
              : (getProjectById(projectId) as any)?.name ?? "Project"
          }
          onChange={(v: string) => setProjectId(v)}
          customButton={
            <button className="inline-flex items-center gap-1.5 rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium">
              Project: {projectId === "all" ? "All" : (getProjectById(projectId) as any)?.name}
              <ChevronDown className="size-3" />
            </button>
          }
        >
          <CustomSelect.Option value="all">All projects</CustomSelect.Option>
          {(workspaceProjectIds ?? []).map((pid) => {
            const p = getProjectById(pid) as any;
            return (
              <CustomSelect.Option key={pid} value={pid}>
                {p?.name ?? pid}
              </CustomSelect.Option>
            );
          })}
        </CustomSelect>

        <CustomSelect
          value={period}
          label={PERIOD_OPTIONS[period]}
          onChange={(v: PeriodKey) => setPeriod(v)}
          customButton={
            <button className="inline-flex items-center gap-1.5 rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium">
              Period: {PERIOD_OPTIONS[period]}
              <ChevronDown className="size-3" />
            </button>
          }
        >
          {Object.entries(PERIOD_OPTIONS).map(([k, label]) => (
            <CustomSelect.Option key={k} value={k}>
              {label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>

        <CustomSelect
          value={approvalStatus}
          label={APPROVAL_OPTIONS.find((o) => o.key === approvalStatus)?.label ?? "All"}
          onChange={(v: any) => setApprovalStatus(v)}
          customButton={
            <button className="inline-flex items-center gap-1.5 rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium">
              Status: {APPROVAL_OPTIONS.find((o) => o.key === approvalStatus)?.label}
              <ChevronDown className="size-3" />
            </button>
          }
        >
          {APPROVAL_OPTIONS.map((o) => (
            <CustomSelect.Option key={o.key as string} value={o.key}>
              {o.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>

      {/* Summary cards.
          PATCH v1.33h: "Total" esclude i log 'rejected'. La card
          "Rejected" appare solo se ci sono log respinti nel periodo,
          per non sporcare la UI quando l'approval workflow non viene
          usato. */}
      <div
        className={`grid grid-cols-1 gap-3 ${
          totals.rejected_seconds > 0 ? "md:grid-cols-4" : "md:grid-cols-3"
        }`}
      >
        <SummaryCard label="Total" seconds={totals.total_seconds} />
        <SummaryCard label="Approved" seconds={totals.approved_seconds} tone="success" />
        <SummaryCard label="Pending" seconds={totals.pending_seconds} tone="warning" />
        {totals.rejected_seconds > 0 && (
          <SummaryCard label="Rejected" seconds={totals.rejected_seconds} tone="danger" />
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-subtle bg-layer-1">
        <table className="w-full text-12">
          <thead className="border-b border-subtle bg-layer-2 text-tertiary">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Issue</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Hours</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-tertiary">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-tertiary">
                  No logs in this period.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-subtle hover:bg-layer-2">
                  <td className="px-3 py-2 text-secondary">
                    {new Date(log.logged_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Avatar
                        src={log.user_avatar_url ?? undefined}
                        name={log.user_display_name}
                        size="sm"
                      />
                      <span className="text-secondary">{log.user_display_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-secondary">{log.project_identifier ?? "—"}</td>
                  <td className="px-3 py-2 text-secondary">
                    {log.project_identifier}-{log.issue_sequence_id}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-secondary">
                    {log.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-primary">
                    {formatDurationHM(log.duration_seconds)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={log.approval_status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && log.approval_status === "pending" && (
                        <>
                          <Tooltip tooltipContent="Approve">
                            <button
                              onClick={() => handleApprove(log)}
                              className="rounded-sm border border-subtle p-1 hover:bg-success-subtle"
                            >
                              <Check className="size-3.5 text-success-strong" />
                            </button>
                          </Tooltip>
                          <Tooltip tooltipContent="Reject">
                            <button
                              onClick={() => handleReject(log)}
                              className="rounded-sm border border-subtle p-1 hover:bg-danger-subtle"
                            >
                              <X className="size-3.5 text-danger-strong" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                      {(isAdmin || (log.user === currentUser?.id && (log.approval_status === "auto" || log.approval_status === "pending"))) && (
                        <Tooltip tooltipContent="Delete log">
                          <button
                            onClick={() => handleDelete(log)}
                            className="rounded-sm border border-subtle p-1 hover:bg-danger-subtle"
                          >
                            <Trash2 className="size-3.5 text-danger-strong" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function SummaryCard(props: { label: string; seconds: number; tone?: "success" | "warning" | "danger" }) {
  const { label, seconds, tone } = props;
  const toneClass =
    tone === "success"
      ? "border-success-strong/30 bg-success-subtle/30"
      : tone === "warning"
        ? "border-warning-strong/30 bg-warning-subtle/30"
        : tone === "danger"
          ? "border-danger-strong/30 bg-danger-subtle/30"
          : "border-subtle bg-layer-1";
  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <p className="text-11 font-medium uppercase text-tertiary">{label}</p>
      <p className="mt-1 text-20 font-semibold text-primary">{formatDurationHM(seconds)}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: TTimeLog["approval_status"] }) {
  const cls =
    status === "approved" || status === "auto"
      ? "bg-success-subtle text-success-strong"
      : status === "pending"
        ? "bg-warning-subtle text-warning-strong"
        : "bg-danger-subtle text-danger-strong";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-11 font-medium ${cls}`}>
      {status}
    </span>
  );
}

// Helper per CSRF token (Django mette session cookie + csrftoken cookie).
function getCsrf(): string {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : "";
}
