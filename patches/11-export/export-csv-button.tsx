/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.28:
 *  Componente ExportCsvButton riutilizzabile. Esporta i task attualmente
 *  nel cache dello store (rispetta filtri applicati lato server) come file
 *  CSV. Niente dipendenze esterne: il CSV viene costruito a mano con
 *  proper escaping per virgole, virgolette, newline.
 *
 *  Parametri:
 *    storeType: EIssuesStoreType (per recuperare il giusto store)
 *    contextLabel: string usato nel filename (es. "workspace-views")
 *
 *  Limitazione MVP: esporta solo i task gia' caricati nel issuesMap
 *  (paginati). Per esportare TUTTI i task della view senza paginazione
 *  serve un endpoint backend dedicato (rinviato a v1.28b).
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EIssuesStoreType, TIssue, TIssuePriorities } from "@plane/types";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";

type Props = {
  storeType: EIssuesStoreType;
  contextLabel?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "neutral-primary" | "tertiary";
};

const PRIORITY_LABEL: Record<TIssuePriorities, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

/**
 * Escape un valore CSV. Wrap in virgolette se contiene virgola, virgoletta
 * o newline. Le virgolette interne vengono raddoppiate.
 */
const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return iso.split("T")[0]; // YYYY-MM-DD
};

const buildFilename = (workspace: string, contextLabel: string): string => {
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  return `${workspace}-${contextLabel}-${stamp}.csv`;
};

const triggerDownload = (csvText: string, filename: string) => {
  // BOM (\uFEFF) per Excel: forza UTF-8 e mostra accenti correttamente.
  const blob = new Blob(["\uFEFF" + csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const ExportCsvButton = observer(function ExportCsvButton(props: Props) {
  const { storeType, contextLabel = "issues", size = "lg", variant = "neutral-primary" } = props;
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "workspace";

  const { issueMap } = useIssues();
  const { issues } = useIssues(storeType);
  const { getProjectById, getProjectIdentifierById } = useProject();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    try {
      // Recupera gli ID grouped o flat. Stock store rende sempre groupedIssueIds
      // come Record<groupKey, string[]> oppure (subgrouped) Record<groupKey,
      // Record<subKey, string[]>>. Estraiamo tutti gli ID flat.
      const grouped = issues?.groupedIssueIds as unknown;
      const allIds = new Set<string>();
      const collect = (val: unknown): void => {
        if (Array.isArray(val)) {
          val.forEach((id) => typeof id === "string" && allIds.add(id));
        } else if (val && typeof val === "object") {
          Object.values(val as Record<string, unknown>).forEach(collect);
        }
      };
      collect(grouped);

      const rows: TIssue[] = [];
      allIds.forEach((id) => {
        const i = issueMap?.[id];
        if (i) rows.push(i);
      });

      if (rows.length === 0) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Nothing to export",
          message: "No work items in the current view.",
        });
        return;
      }

      // Header
      const header = [
        "Identifier",
        "Title",
        "State",
        "Priority",
        "Assignees",
        "Start date",
        "Target date",
        "Project",
        "Labels",
        "Created by",
        "Created at",
      ];

      const lines: string[] = [header.map(csvEscape).join(",")];

      rows.forEach((issue) => {
        const project = issue.project_id ? getProjectById(issue.project_id) : undefined;
        const projectIdentifier = issue.project_id ? getProjectIdentifierById(issue.project_id) : "";
        const state = issue.state_id ? getStateById(issue.state_id) : undefined;
        const assigneeNames = (issue.assignee_ids ?? [])
          .map((uid) => {
            const u = getUserDetails(uid);
            return u?.display_name || `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || u?.email || uid;
          })
          .join(", ");
        // Labels: lo store potrebbe non avere il nome label; usiamo gli ID se mancano.
        const labelNames = (issue.label_ids ?? []).join(", ");
        const createdBy = issue.created_by ? getUserDetails(issue.created_by) : undefined;
        const createdByName = createdBy
          ? createdBy.display_name || `${createdBy.first_name ?? ""} ${createdBy.last_name ?? ""}`.trim() || createdBy.email
          : "";

        const row = [
          `${projectIdentifier}-${issue.sequence_id ?? ""}`,
          issue.name ?? "",
          state?.name ?? "",
          issue.priority ? PRIORITY_LABEL[issue.priority as TIssuePriorities] ?? issue.priority : "",
          assigneeNames,
          formatDate(issue.start_date),
          formatDate(issue.target_date),
          project?.name ?? "",
          labelNames,
          createdByName,
          formatDate(issue.created_at),
        ];

        lines.push(row.map(csvEscape).join(","));
      });

      const csv = lines.join("\n");
      const filename = buildFilename(slug, contextLabel);
      triggerDownload(csv, filename);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Exported",
        message: `${rows.length} work item${rows.length === 1 ? "" : "s"} exported.`,
      });
    } catch (e) {
      const err = e as { message?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Export failed",
        message: err?.message || "Unknown error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      prependIcon={isExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? "Exporting..." : "Export"}
    </Button>
  );
});
