/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19:
 *  Team dashboard - People page. Consuma v1.18 (/members/stats/).
 *
 * PATCH (plane-custom) v1.19b:
 *  Riscrittura come LISTA/TABELLA ESPANDIBILE con tree task/subtask.
 *
 * PATCH (plane-custom) v1.19c:
 *  Pagina INTERATTIVA allineata alle altre view di Plane (Spreadsheet-like).
 *
 *  Elementi cliccabili:
 *    - Avatar membro: ButtonAvatars (componente stock) con tooltip.
 *    - Chip "Active", "Overdue", chip state-group, chip timing -> toggle
 *      del filtro sulla tree espansa; clic su chip gia' attiva -> reset.
 *    - Task identifier + nome: apre il peek-overview (useIssuePeekOverviewRedirection)
 *      come in spreadsheet/issue-row.tsx.
 *    - State chip       -> <StateDropdown>   (inline edit via patchIssue)
 *    - Priority chip    -> <PriorityDropdown>
 *    - Start date       -> <DateDropdown>
 *    - Target date      -> <DateDropdown>
 *    - Assignee avatars -> <MemberDropdown multiple>
 *
 *  Dopo ogni patchIssue riuscito si chiama mutate(swrKey) per rinfrescare la
 *  lista del singolo membro. Il backend /members/<id>/issues/ filtra solo
 *  task attivi (backlog/unstarted/started); se l'utente passa uno stato a
 *  completed/cancelled il task sparisce dalla lista - comportamento voluto.
 *
 *  Stile: tabella con header sticky, colonne fisse (ID | Name | State |
 *  Priority | Start | Due | Assignees), righe con hover e bordi sottili,
 *  molto simile al layout spreadsheet stock.
 *
 *  Lazy-load: invariato vs v1.19b. Una chiave SWR per membro, fetch al
 *  primo expand, cache successiva.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { ChevronRight, ChevronDown, X as XIcon } from "lucide-react";
// plane imports
import { Avatar } from "@plane/propel/avatar";
import { Loader } from "@plane/ui";
import type { TIssue, TIssuePriorities } from "@plane/types";
import { getFileURL, renderFormattedPayloadDate, getDate } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
// services
import { IssueService } from "@/services/issue";
import type { TPeopleStatsEntry, TMemberIssue } from "@/services/people-stats.service";
import { PeopleStatsService } from "@/services/people-stats.service";

const peopleStatsService = new PeopleStatsService();
const issueService = new IssueService();

// Plane role codes: 20 = Admin, 15 = Member, 5 = Guest
const ROLE_LABEL: Record<number, string> = {
  20: "Admin",
  15: "Member",
  5: "Guest",
};

const ROLE_BADGE_CLASS: Record<number, string> = {
  20: "bg-custom-primary-100/10 text-custom-primary-100",
  15: "bg-layer-1 text-secondary",
  5: "bg-yellow-500/10 text-yellow-600",
};

const STATE_GROUP_LABELS: Record<string, string> = {
  backlog: "Backlog",
  unstarted: "Unstarted",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATE_GROUP_SHORT: Record<string, string> = {
  backlog: "B",
  unstarted: "U",
  started: "S",
  completed: "C",
  cancelled: "X",
};

const STATE_GROUP_DOT: Record<string, string> = {
  backlog: "bg-placeholder",
  unstarted: "bg-gray-400",
  started: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

type TFilterKind =
  | "all"
  | "active"
  | "overdue"
  | "due_this_week"
  | "no_target_date"
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "cancelled";

// ===== helpers ============================================================

function isOverdue(targetIso: string | null): boolean {
  if (!targetIso) return false;
  const t = new Date(targetIso);
  if (Number.isNaN(t.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return t.getTime() < today.getTime();
}

function isDueThisWeek(targetIso: string | null): boolean {
  if (!targetIso) return false;
  const t = new Date(targetIso);
  if (Number.isNaN(t.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

function matchesFilter(issue: TMemberIssue, filter: TFilterKind): boolean {
  switch (filter) {
    case "all":
    case "active":
      return true;
    case "overdue":
      return isOverdue(issue.target_date);
    case "due_this_week":
      return isDueThisWeek(issue.target_date);
    case "no_target_date":
      return !issue.target_date;
    case "backlog":
    case "unstarted":
    case "started":
    case "completed":
    case "cancelled":
      return issue.state_group === filter;
    default:
      return true;
  }
}

// Build tree from flat list; orphan subtask (parent fuori scope / filtrato) -> root.
type TTreeNode = TMemberIssue & { children: TTreeNode[] };

function buildTree(issues: TMemberIssue[]): TTreeNode[] {
  const idSet = new Set(issues.map((i) => i.id));
  const byId: Record<string, TTreeNode> = {};
  issues.forEach((i) => {
    byId[i.id] = { ...i, children: [] };
  });

  const roots: TTreeNode[] = [];
  issues.forEach((i) => {
    const node = byId[i.id];
    if (!i.parent_id || !idSet.has(i.parent_id)) {
      roots.push(node);
    } else {
      byId[i.parent_id].children.push(node);
    }
  });

  return roots;
}

// Sintetizza un TIssue parziale dal TMemberIssue sufficiente per
// useIssuePeekOverviewRedirection.handleRedirection (usa solo id, project_id,
// sequence_id, archived_at, tempId).
function syntheticIssueForPeek(i: TMemberIssue): TIssue {
  // Cast al TIssue completo: handleRedirection destruttura solo i campi sopra,
  // quindi il resto non e' mai letto. La forma e' lineare all'uso in
  // spreadsheet/issue-row.tsx quando si costruiscono stub di navigation.
  return {
    id: i.id,
    project_id: i.project_id,
    sequence_id: i.sequence_id,
    archived_at: null,
    // campi non letti da handleRedirection: tempId, e resto delle props
    // lasciamo cast per evitare di dover replicare TBaseIssue intero.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ===== sub-components =====================================================

function FilterChip({
  active,
  onClick,
  title,
  className = "",
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-11 font-medium transition-colors ${
        active
          ? "border-custom-primary-100 bg-custom-primary-100/10 ring-1 ring-custom-primary-100/40"
          : "border-layer-2 bg-layer-0 hover:bg-layer-1"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function StateGroupChips({
  stats,
  activeFilter,
  onFilterChange,
}: {
  stats: { backlog: number; unstarted: number; started: number; completed: number; cancelled: number };
  activeFilter: TFilterKind;
  onFilterChange: (f: TFilterKind) => void;
}) {
  const order: Array<keyof typeof stats> = ["backlog", "unstarted", "started", "completed", "cancelled"];
  return (
    <div className="flex items-center gap-1">
      {order.map((k) => {
        const isActive = activeFilter === k;
        return (
          <FilterChip
            key={k}
            active={isActive}
            onClick={() => onFilterChange(isActive ? "all" : (k as TFilterKind))}
            title={`${STATE_GROUP_LABELS[k]} - click to filter`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STATE_GROUP_DOT[k]}`} />
            <span className="text-placeholder">{STATE_GROUP_SHORT[k]}</span>
            <span className="tabular-nums text-secondary">{stats[k]}</span>
          </FilterChip>
        );
      })}
    </div>
  );
}

function TimingChips({
  stats,
  activeFilter,
  onFilterChange,
}: {
  stats: { overdue: number; due_this_week: number; no_target_date: number };
  activeFilter: TFilterKind;
  onFilterChange: (f: TFilterKind) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <FilterChip
        active={activeFilter === "overdue"}
        onClick={() => onFilterChange(activeFilter === "overdue" ? "all" : "overdue")}
        title="Overdue - click to filter"
        className="!border-red-500/30 hover:!bg-red-500/5"
      >
        <span className="tabular-nums text-red-500">{stats.overdue}</span>
        <span className="text-placeholder">od</span>
      </FilterChip>
      <FilterChip
        active={activeFilter === "due_this_week"}
        onClick={() => onFilterChange(activeFilter === "due_this_week" ? "all" : "due_this_week")}
        title="Due this week - click to filter"
        className="!border-yellow-500/30 hover:!bg-yellow-500/5"
      >
        <span className="tabular-nums text-yellow-600">{stats.due_this_week}</span>
        <span className="text-placeholder">dw</span>
      </FilterChip>
      <FilterChip
        active={activeFilter === "no_target_date"}
        onClick={() => onFilterChange(activeFilter === "no_target_date" ? "all" : "no_target_date")}
        title="No target date - click to filter"
      >
        <span className="tabular-nums text-secondary">{stats.no_target_date}</span>
        <span className="text-placeholder">nd</span>
      </FilterChip>
    </div>
  );
}

// ===== IssueRow ===========================================================

type TIssueRowProps = {
  node: TTreeNode;
  level: number;
  workspaceSlug: string;
  swrKey: string;
  handleRedirection: ReturnType<typeof useIssuePeekOverviewRedirection>["handleRedirection"];
};

const IssueRow = observer(function IssueRow(props: TIssueRowProps) {
  const { node, level, workspaceSlug, swrKey, handleRedirection } = props;
  const indent = level * 20;
  const { mutate } = useSWRConfig();

  const projectId = node.project_id ?? undefined;
  const disabled = !projectId;

  // patchIssue helpers
  const onPatch = async (data: Partial<TIssue>) => {
    if (!projectId) return;
    try {
      await issueService.patchIssue(workspaceSlug, projectId, node.id, data);
      mutate(swrKey);
    } catch (e) {
      // swallow: a livello riga non abbiamo un toast dedicato; l'UI verra'
      // reconciliata al prossimo refresh SWR se la patch e' andata a buon fine.
      // eslint-disable-next-line no-console
      console.error("[people v1.19c] patchIssue failed", e);
    }
  };

  // peek open su click identifier/name
  const openPeek = () => {
    handleRedirection(workspaceSlug, syntheticIssueForPeek(node), false, level);
  };

  // esclude l'utente corrente dagli assignees mostrati come extra? No, v1.19c
  // mostriamo tutti gli assignee come la spreadsheet normale.
  return (
    <>
      <div
        className="group grid grid-cols-[minmax(260px,2fr)_minmax(140px,1fr)_minmax(120px,1fr)_minmax(100px,120px)_minmax(100px,120px)_minmax(80px,120px)] items-center gap-0 border-t border-subtle text-12 hover:bg-layer-1/60"
        style={{ paddingLeft: indent }}
      >
        {/* Col 1: identifier + name (clickable peek) */}
        <div className="flex items-center gap-2 px-3 py-1.5 min-w-0">
          <span className="shrink-0 rounded-sm border border-layer-2 bg-layer-1 px-1.5 py-0.5 font-mono text-11 text-secondary">
            {node.project_identifier}-{node.sequence_id}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPeek();
            }}
            className="flex-1 truncate text-left text-primary hover:text-custom-primary-100 hover:underline"
            title="Open work item"
          >
            {node.name}
          </button>
        </div>

        {/* Col 2: State dropdown */}
        <div className="min-w-0 border-l border-subtle">
          <StateDropdown
            projectId={projectId}
            value={node.state_id}
            onChange={(newId) => onPatch({ state_id: newId })}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            buttonContainerClassName="w-full"
            buttonClassName="rounded-none px-2 text-left"
            showTooltip
          />
        </div>

        {/* Col 3: Priority dropdown */}
        <div className="min-w-0 border-l border-subtle">
          <PriorityDropdown
            value={(node.priority as TIssuePriorities) ?? "none"}
            onChange={(val) => onPatch({ priority: val })}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            buttonContainerClassName="w-full"
            buttonClassName="rounded-none px-2 text-left"
          />
        </div>

        {/* Col 4: Start date */}
        <div className="min-w-0 border-l border-subtle">
          <DateDropdown
            value={node.start_date}
            maxDate={getDate(node.target_date)}
            placeholder="Start"
            onChange={(d) => {
              const iso = d ? renderFormattedPayloadDate(d) : null;
              onPatch({ start_date: iso });
            }}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            buttonContainerClassName="w-full"
            buttonClassName="rounded-none px-2 text-left"
          />
        </div>

        {/* Col 5: Target date */}
        <div className="min-w-0 border-l border-subtle">
          <DateDropdown
            value={node.target_date}
            minDate={getDate(node.start_date)}
            placeholder="Due"
            onChange={(d) => {
              const iso = d ? renderFormattedPayloadDate(d) : null;
              onPatch({ target_date: iso });
            }}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            buttonContainerClassName="w-full"
            buttonClassName={`rounded-none px-2 text-left ${isOverdue(node.target_date) ? "text-danger-primary" : ""}`}
          />
        </div>

        {/* Col 6: Assignees */}
        <div className="min-w-0 border-l border-subtle px-2 py-1">
          <MemberDropdown
            projectId={projectId}
            value={node.assignee_ids}
            onChange={(vals) => onPatch({ assignee_ids: vals })}
            disabled={disabled}
            multiple
            buttonVariant={node.assignee_ids.length > 0 ? "transparent-without-text" : "transparent-with-text"}
            buttonContainerClassName="w-full"
            buttonClassName="rounded-none"
            placeholder="Assignees"
            showTooltip
          />
        </div>
      </div>
      {node.children.map((c) => (
        <IssueRow
          key={c.id}
          node={c}
          level={level + 1}
          workspaceSlug={workspaceSlug}
          swrKey={swrKey}
          handleRedirection={handleRedirection}
        />
      ))}
    </>
  );
});

// ===== ExpandedTree =======================================================

const ExpandedTree = observer(function ExpandedTree({
  slug,
  memberId,
  expected,
  activeFilter,
  onClearFilter,
}: {
  slug: string;
  memberId: string;
  expected: number;
  activeFilter: TFilterKind;
  onClearFilter: () => void;
}) {
  const swrKey = `member-issues-${slug}-${memberId}`;
  const { handleRedirection } = useIssuePeekOverviewRedirection();

  const { data, error, isLoading } = useSWR(
    slug && memberId ? swrKey : null,
    slug && memberId ? () => peopleStatsService.fetchMemberIssues(slug, memberId) : null,
    { revalidateOnFocus: false }
  );

  // Filtra la lista piatta prima di costruire l'albero cosi' anche i subtask
  // orfani (il cui parent e' stato escluso dal filtro) compaiono come root.
  const filtered = useMemo(() => (data ?? []).filter((i) => matchesFilter(i, activeFilter)), [data, activeFilter]);
  const tree = useMemo(() => buildTree(filtered), [filtered]);

  if (isLoading) {
    return (
      <div className="px-3 py-3">
        <Loader className="flex flex-col gap-1">
          <Loader.Item height="28px" />
          <Loader.Item height="28px" />
          <Loader.Item height="28px" />
        </Loader>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-subtle bg-danger-primary/5 px-3 py-2 text-12 text-danger-primary">
        Failed to load tasks for this member.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="border-t border-subtle px-3 py-3 text-12 text-placeholder">
        No active tasks{expected > 0 ? ` (expected ${expected}, perhaps project access differs)` : ""}.
      </div>
    );
  }

  return (
    <div className="border-t border-subtle bg-layer-0/40">
      {/* Active filter banner */}
      {activeFilter !== "all" && (
        <div className="flex items-center justify-between border-b border-subtle bg-custom-primary-100/5 px-3 py-1.5 text-11">
          <span className="text-secondary">
            Filter: <span className="font-medium text-primary">{activeFilter.replace(/_/g, " ")}</span>
            <span className="ml-2 text-placeholder">
              ({filtered.length} of {data.length})
            </span>
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-placeholder hover:bg-layer-1 hover:text-primary"
          >
            <XIcon className="size-3" />
            Clear
          </button>
        </div>
      )}

      {/* Header row (spreadsheet-like) */}
      <div className="grid grid-cols-[minmax(260px,2fr)_minmax(140px,1fr)_minmax(120px,1fr)_minmax(100px,120px)_minmax(100px,120px)_minmax(80px,120px)] items-center gap-0 bg-layer-1/30 text-10 uppercase tracking-wide text-placeholder">
        <span className="px-3 py-1.5">Work item</span>
        <span className="border-l border-subtle px-3 py-1.5">State</span>
        <span className="border-l border-subtle px-3 py-1.5">Priority</span>
        <span className="border-l border-subtle px-3 py-1.5">Start date</span>
        <span className="border-l border-subtle px-3 py-1.5">Due date</span>
        <span className="border-l border-subtle px-3 py-1.5">Assignees</span>
      </div>

      {filtered.length === 0 ? (
        <div className="border-t border-subtle px-3 py-3 text-12 text-placeholder">
          No tasks matching filter <span className="font-medium text-secondary">{activeFilter}</span>.
        </div>
      ) : (
        tree.map((n) => (
          <IssueRow
            key={n.id}
            node={n}
            level={0}
            workspaceSlug={slug}
            swrKey={swrKey}
            handleRedirection={handleRedirection}
          />
        ))
      )}
    </div>
  );
});

// ===== MemberRow ==========================================================

const MemberRow = observer(function MemberRow({ entry, slug }: { entry: TPeopleStatsEntry; slug: string }) {
  const { member, stats } = entry;
  const [expanded, setExpanded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TFilterKind>("all");

  const fullName =
    [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || member.display_name || member.email;
  const roleLabel = ROLE_LABEL[member.role] ?? "Member";
  const roleClass = ROLE_BADGE_CLASS[member.role] ?? ROLE_BADGE_CLASS[15];

  // Toggle filter helper: se l'utente clicca un chip mentre la riga e'
  // collassata, espande automaticamente; reimposta il filtro se uguale.
  const applyFilter = (f: TFilterKind) => {
    const next = activeFilter === f ? "all" : f;
    setActiveFilter(next);
    if (next !== "all") setExpanded(true);
  };

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-layer-0">
      {/* summary row */}
      <div className="flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-layer-1/60">
        {/* chevron */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="shrink-0 rounded-sm p-1 text-secondary hover:bg-layer-1"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        {/* avatar (stock Plane - clickable tooltip) */}
        <div
          className="shrink-0"
          onClick={(e) => {
            // Avatar non apre profile; manteniamo cliccabile per espandere.
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          role="button"
          tabIndex={0}
        >
          <Avatar name={fullName} src={getFileURL(member.avatar_url ?? "")} size="lg" shape="square" showTooltip />
        </div>

        {/* name + email */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 flex-col text-left"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-13 font-semibold text-primary">{fullName}</span>
            <span className={`rounded-sm px-1.5 py-0.5 text-10 font-medium ${roleClass}`}>{roleLabel}</span>
          </div>
          <span className="truncate text-11 text-placeholder">{member.email}</span>
        </button>

        {/* Active / Overdue counters (clickable) */}
        <div className="flex shrink-0 items-center gap-2 px-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              applyFilter("active");
            }}
            title="Active tasks - click to show all"
            className={`flex flex-col items-end rounded-sm px-2 py-1 transition-colors ${
              activeFilter === "active" || activeFilter === "all"
                ? "bg-layer-1"
                : "hover:bg-layer-1"
            }`}
          >
            <span className="text-16 font-semibold text-primary tabular-nums">{stats.total_active}</span>
            <span className="text-10 uppercase tracking-wide text-placeholder">Active</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              applyFilter("overdue");
            }}
            title="Overdue - click to filter"
            className={`flex flex-col items-end rounded-sm px-2 py-1 transition-colors ${
              activeFilter === "overdue" ? "bg-danger-primary/10" : "hover:bg-layer-1"
            }`}
          >
            <span
              className={`text-16 font-semibold tabular-nums ${stats.overdue > 0 ? "text-danger-primary" : "text-primary"}`}
            >
              {stats.overdue}
            </span>
            <span className="text-10 uppercase tracking-wide text-placeholder">Overdue</span>
          </button>
        </div>

        {/* state group breakdown */}
        <div className="hidden shrink-0 xl:block">
          <StateGroupChips stats={stats} activeFilter={activeFilter} onFilterChange={applyFilter} />
        </div>

        {/* timing breakdown */}
        <div className="hidden shrink-0 xl:block">
          <TimingChips stats={stats} activeFilter={activeFilter} onFilterChange={applyFilter} />
        </div>
      </div>

      {/* below-xl fallback: chips on their own row */}
      <div className="flex flex-wrap items-center gap-2 border-t border-subtle px-3 py-2 xl:hidden">
        <StateGroupChips stats={stats} activeFilter={activeFilter} onFilterChange={applyFilter} />
        <span className="mx-1 h-3 w-px bg-layer-2" />
        <TimingChips stats={stats} activeFilter={activeFilter} onFilterChange={applyFilter} />
      </div>

      {/* expanded tree */}
      {expanded && (
        <ExpandedTree
          slug={slug}
          memberId={member.id}
          expected={stats.total_active}
          activeFilter={activeFilter}
          onClearFilter={() => setActiveFilter("all")}
        />
      )}
    </div>
  );
});

// ===== page ==============================================================

export default observer(function WorkspacePeoplePage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";

  const { data, error, isLoading } = useSWR(
    slug ? `workspace-members-stats-${slug}` : null,
    slug ? () => peopleStatsService.fetchWorkspaceMembersStats(slug) : null,
    { revalidateOnFocus: false }
  );

  const totalMembers = data?.length ?? 0;
  const totalActive = useMemo(
    () => (data ? data.reduce((acc, e) => acc + (e.stats?.total_active ?? 0), 0) : 0),
    [data]
  );
  const totalOverdue = useMemo(
    () => (data ? data.reduce((acc, e) => acc + (e.stats?.overdue ?? 0), 0) : 0),
    [data]
  );

  return (
    <>
      <PageHead title="People" />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto p-4">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-subtle bg-layer-0 px-3 py-2">
              <span className="text-11 uppercase tracking-wide text-placeholder">Members</span>
              <div className="text-18 font-semibold text-primary">{totalMembers}</div>
            </div>
            <div className="rounded-md border border-subtle bg-layer-0 px-3 py-2">
              <span className="text-11 uppercase tracking-wide text-placeholder">Total active</span>
              <div className="text-18 font-semibold text-primary">{totalActive}</div>
            </div>
            <div className="rounded-md border border-subtle bg-layer-0 px-3 py-2">
              <span className="text-11 uppercase tracking-wide text-placeholder">Total overdue</span>
              <div className="text-18 font-semibold text-danger-primary">{totalOverdue}</div>
            </div>
          </div>

          {isLoading ? (
            <Loader className="flex flex-col gap-2">
              <Loader.Item height="64px" />
              <Loader.Item height="64px" />
              <Loader.Item height="64px" />
              <Loader.Item height="64px" />
            </Loader>
          ) : error ? (
            <div className="rounded-md border border-danger-primary/30 bg-danger-primary/5 p-4 text-danger-primary">
              Failed to load team stats.
            </div>
          ) : data && data.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.map((entry) => (
                <MemberRow key={entry.member.id} entry={entry} slug={slug} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-subtle bg-layer-0 p-6 text-center text-secondary">
              No members to display.
            </div>
          )}
        </div>
      </div>
    </>
  );
});
