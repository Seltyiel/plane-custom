/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.26c + v1.30:
 *  Componente MyDashboard inserito SOPRA WorkspaceHomeView (la home stock
 *  rimane sotto, scrollabile). Mostra:
 *    - hero greeting con avatar + (per admin/member) dropdown "View as: <user>"
 *    - 4 KPI card: Total assigned, Due today, Overdue, This week
 *    - v1.30: WeeklyCalendar (7 colonne Lun-Dom) con task settimana corrente
 *    - 2 colonne: lista Today (top 5) + lista Overdue (top 5)
 *    - click su una row/card -> apre peek-overview del task
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckSquare, ChevronDown, Clock, ListChecks } from "lucide-react";
// plane imports
import { Avatar } from "@plane/propel/avatar";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useMyDashboard } from "@/hooks/use-my-dashboard";
// constants
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";

const greetingFor = (date: Date): string => {
  const h = date.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

type TKPIProps = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "warning" | "danger";
};

const KPICard = ({ label, value, icon: Icon, tone = "neutral" }: TKPIProps) => {
  const toneClasses =
    tone === "danger"
      ? "border-danger-strong/40 bg-danger-subtle/30 text-danger-strong"
      : tone === "warning"
        ? "border-warning-strong/40 bg-warning-subtle/30 text-warning-strong"
        : "border-subtle bg-layer-1 text-secondary";
  return (
    <div className={`flex items-center gap-3 rounded-md border px-4 py-3 ${toneClasses}`}>
      <Icon className="size-5 shrink-0" />
      <div className="flex flex-col">
        <span className="text-11 font-medium uppercase tracking-wide opacity-80">{label}</span>
        <span className="text-22 font-semibold leading-none">{value}</span>
      </div>
    </div>
  );
};

// PATCH v1.30: weekday labels (Lun-Dom)
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type TWeeklyCalendarProps = {
  issues: TIssue[];
  weekRange: { monday: string; sunday: string } | undefined;
  workspaceSlug: string;
};

const WeeklyCalendar = observer(function WeeklyCalendar(props: TWeeklyCalendarProps) {
  const { issues, weekRange, workspaceSlug } = props;
  const { setPeekIssue } = useIssueDetail();

  // Calcola i 7 giorni della settimana corrente (Lun-Dom).
  const days = useMemo(() => {
    const start = weekRange ? new Date(weekRange.monday + "T00:00:00") : new Date();
    if (!weekRange) {
      // fallback client-side: Lun di questa settimana
      const today = new Date();
      const dayOfWeek = today.getDay(); // Sun=0..Sat=6
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start.setTime(today.getTime());
      start.setDate(today.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
    }
    const out: { iso: string; label: string; dayNum: number; isToday: boolean }[] = [];
    const todayIso = new Date().toISOString().split("T")[0];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      out.push({
        iso,
        label: WEEKDAY_LABELS[i],
        dayNum: d.getDate(),
        isToday: iso === todayIso,
      });
    }
    return out;
  }, [weekRange]);

  // Raggruppa task per target_date.
  const issuesByDay = useMemo(() => {
    const map: Record<string, TIssue[]> = {};
    issues.forEach((iss) => {
      if (!iss.target_date) return;
      const day = String(iss.target_date).split("T")[0];
      if (!map[day]) map[day] = [];
      map[day].push(iss);
    });
    return map;
  }, [issues]);

  const handleClick = (issue: TIssue) => {
    if (!issue.id || !issue.project_id) return;
    setPeekIssue({ workspaceSlug, projectId: issue.project_id, issueId: issue.id });
  };

  const VISIBLE_PER_DAY = 5;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock className="size-4 text-secondary" />
        <h3 className="text-13 font-semibold text-primary">This week</h3>
      </div>
      <div className="grid grid-cols-7 gap-1.5 rounded-md border border-subtle bg-layer-1 p-2">
        {days.map((day) => {
          const dayIssues = issuesByDay[day.iso] ?? [];
          const visible = dayIssues.slice(0, VISIBLE_PER_DAY);
          const hidden = dayIssues.length - visible.length;
          return (
            <div
              key={day.iso}
              className={`flex min-h-[120px] flex-col rounded-sm border ${
                day.isToday ? "border-accent-strong bg-accent-primary/5" : "border-subtle bg-layer-transparent"
              }`}
            >
              <div
                className={`px-1.5 py-1 text-center text-11 font-medium ${
                  day.isToday ? "text-accent-primary" : "text-tertiary"
                }`}
              >
                {day.label}{" "}
                <span className={day.isToday ? "font-semibold" : ""}>{day.dayNum}</span>
              </div>
              <div className="flex flex-col gap-1 px-1 pb-1">
                {visible.map((iss) => (
                  <button
                    key={iss.id}
                    type="button"
                    onClick={() => handleClick(iss)}
                    className="rounded-sm bg-layer-2 px-1.5 py-1 text-left text-11 text-primary hover:bg-layer-3"
                    title={iss.name}
                  >
                    <span className="block truncate">{iss.name}</span>
                  </button>
                ))}
                {hidden > 0 && (
                  <span className="px-1.5 text-10 text-tertiary">+{hidden} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

type TDashboardIssueRowProps = {
  issue: TIssue;
  workspaceSlug: string;
  showOverdueDays?: boolean;
};

const DashboardIssueRow = observer(function DashboardIssueRow(props: TDashboardIssueRowProps) {
  const { issue, workspaceSlug, showOverdueDays } = props;
  const { setPeekIssue } = useIssueDetail();

  const overdueDays = useMemo(() => {
    if (!showOverdueDays || !issue.target_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(issue.target_date);
    due.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [issue.target_date, showOverdueDays]);

  const handleClick = () => {
    if (!issue.id || !issue.project_id) return;
    setPeekIssue({ workspaceSlug, projectId: issue.project_id, issueId: issue.id });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-between gap-3 rounded-sm border-b border-subtle px-3 py-2 text-left hover:bg-layer-1"
    >
      <div className="min-w-0 flex-1 truncate text-13 text-primary">{issue.name}</div>
      {showOverdueDays && overdueDays && (
        <span className="shrink-0 rounded-sm bg-danger-subtle/40 px-1.5 py-0.5 text-11 font-medium text-danger-strong">
          {overdueDays}d late
        </span>
      )}
      {issue.target_date && !showOverdueDays && (
        <span className="shrink-0 text-11 text-tertiary">
          {new Date(issue.target_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}
    </button>
  );
});

export const MyDashboard = observer(function MyDashboard() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  // store
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { getUserDetails, workspace: workspaceMemberStore } = useMember();
  const workspaceMemberIds = workspaceMemberStore?.workspaceMemberIds;
  // state: target user del dashboard ("View as" picker)
  const [viewAsUserId, setViewAsUserId] = useState<string | undefined>(undefined);
  // permission: admin/member del workspace possono vedere altri user
  const canViewOthers = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  // dashboard data
  const { dashboard, isLoading } = useMyDashboard(slug, viewAsUserId);

  // user da renderizzare nell'header
  const targetUser = dashboard?.user;
  const greeting = useMemo(() => greetingFor(new Date()), []);
  const greetingName = targetUser?.first_name || targetUser?.display_name || "";

  // Lista user per il picker (escludi guest)
  const memberOptions = useMemo(() => {
    if (!canViewOthers) return [];
    return (workspaceMemberIds ?? [])
      .map((id) => {
        const u = getUserDetails(id);
        if (!u) return null;
        return {
          id,
          name: u.display_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
          avatar_url: (u as { avatar_url?: string | null }).avatar_url ?? null,
        };
      })
      .filter(Boolean) as { id: string; name: string; avatar_url: string | null }[];
  }, [canViewOthers, workspaceMemberIds, getUserDetails]);

  if (!slug) return null;

  const kpi = dashboard?.kpi;
  const todayIssues = dashboard?.today_issues ?? [];
  const overdueIssues = dashboard?.overdue_issues ?? [];

  const isOtherUser = viewAsUserId && viewAsUserId !== currentUser?.id;

  return (
    <div className="mb-4 rounded-md border border-subtle bg-layer-transparent p-5">
      {/* Hero */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {targetUser && (
            <Avatar
              src={targetUser.avatar_url ?? undefined}
              name={targetUser.display_name || `${targetUser.first_name} ${targetUser.last_name}`}
              size="lg"
            />
          )}
          <div>
            <h2 className="text-18 font-semibold text-primary">
              {greeting}
              {greetingName ? `, ${greetingName}` : ""}
            </h2>
            <p className="text-12 text-tertiary">
              {isOtherUser
                ? `Viewing dashboard as ${targetUser?.display_name ?? "user"}`
                : "Here's a snapshot of your work"}
            </p>
          </div>
        </div>

        {/* PATCH v1.26 hotfix: mostra il picker se l'utente ha permission,
            anche se il workspace ha 1 solo member. In tal caso il dropdown
            avra' solo l'opzione "Me", che e' meno utile ma fa vedere il
            controllo all'utente. Quando si aggiunge un secondo membro, le
            opzioni si popolano automaticamente via observer. */}
        {canViewOthers && (
          <CustomSelect
            value={viewAsUserId ?? "self"}
            onChange={(value: string) => setViewAsUserId(value === "self" ? undefined : value)}
            customButton={
              <Tooltip tooltipContent="View dashboard as another user">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-sm border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 font-medium text-secondary hover:bg-layer-2"
                >
                  {isOtherUser ? `Viewing: ${targetUser?.display_name ?? "user"}` : "View as..."}
                  <ChevronDown className="size-3" />
                </button>
              </Tooltip>
            }
            optionsClassName="max-h-[280px] w-56 overflow-y-auto"
          >
            <CustomSelect.Option value="self">
              <span className="text-13">Me</span>
            </CustomSelect.Option>
            {memberOptions.map((m) => (
              <CustomSelect.Option key={m.id} value={m.id}>
                <div className="flex items-center gap-2">
                  <Avatar src={m.avatar_url ?? undefined} name={m.name} size="sm" />
                  <span className="truncate text-13">{m.name}</span>
                </div>
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        )}
      </div>

      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPICard label="Assigned" value={kpi?.total_assigned ?? 0} icon={ListChecks} />
        <KPICard label="Due today" value={kpi?.due_today ?? 0} icon={CalendarClock} tone="warning" />
        <KPICard label="Overdue" value={kpi?.overdue ?? 0} icon={AlertTriangle} tone="danger" />
        <KPICard label="This week" value={kpi?.due_this_week ?? 0} icon={Clock} />
      </div>

      {/* PATCH v1.30: mini-calendario settimanale (Lun-Dom). */}
      <WeeklyCalendar
        issues={dashboard?.week_issues ?? []}
        weekRange={dashboard?.week_range}
        workspaceSlug={slug}
      />

      {/* Today + Overdue lists */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="size-4 text-warning-strong" />
            <h3 className="text-13 font-semibold text-primary">Today</h3>
            <span className="text-11 text-tertiary">({todayIssues.length})</span>
          </div>
          {isLoading ? (
            <div className="text-12 text-tertiary">Loading…</div>
          ) : todayIssues.length === 0 ? (
            <div className="rounded-sm border border-dashed border-subtle px-3 py-6 text-center text-12 text-tertiary">
              <CheckSquare className="mx-auto mb-1 size-4" />
              Nothing due today
            </div>
          ) : (
            <div className="rounded-sm border border-subtle bg-layer-1">
              {todayIssues.map((issue) => (
                <DashboardIssueRow key={issue.id} issue={issue} workspaceSlug={slug} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="size-4 text-danger-strong" />
            <h3 className="text-13 font-semibold text-primary">Overdue</h3>
            <span className="text-11 text-tertiary">({overdueIssues.length})</span>
          </div>
          {isLoading ? (
            <div className="text-12 text-tertiary">Loading…</div>
          ) : overdueIssues.length === 0 ? (
            <div className="rounded-sm border border-dashed border-subtle px-3 py-6 text-center text-12 text-tertiary">
              <CheckSquare className="mx-auto mb-1 size-4" />
              No overdue items
            </div>
          ) : (
            <div className="rounded-sm border border-danger-strong/30 bg-danger-subtle/10">
              {overdueIssues.map((issue) => (
                <DashboardIssueRow key={issue.id} issue={issue} workspaceSlug={slug} showOverdueDays />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
