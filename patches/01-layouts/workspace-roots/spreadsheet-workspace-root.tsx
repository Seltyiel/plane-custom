/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.31a - Fix Spreadsheet layout su workspace views
 * che mostra schermata bianca quando si naviga direttamente o transitando
 * da List/Board/Calendar.
 *
 * ROOT CAUSE:
 * Stock WorkspaceSpreadsheetRoot NON ha un useEffect che fetcha le issue.
 * Storicamente la fetch arrivava da AllIssueLayoutRoot via SWR (singola
 * fetch globale "canGroup: false, perPageCount: 100"). La nostra v1.16
 * ha pero' RIMOSSO quella fetch da AllIssueLayoutRoot perche' rompeva il
 * Calendar (sovrascriveva il bucketing per target_date). Tutti gli altri
 * workspace layout (List/Kanban/Calendar/Gantt) sopravvivono perche'
 * passano attraverso un Base*Root che ha gia' la sua useEffect con
 * fetchIssues. Spreadsheet non lo fa: e' un componente custom che assume
 * di trovare i dati gia' nel GLOBAL store.
 *
 * SINTOMO RIPORTATO DALL'UTENTE:
 *   "la view table in view workshop e' visibile solamente passando prima
 *    per la view gantt e poi tornando in table, se invece vado in view
 *    table direttamente o passando prima per list board o calendar
 *    invece la schermata e' bianca"
 *
 * Questo conferma la diagnosi: Gantt riempie il GLOBAL store, Spreadsheet
 * trova i dati. Direct -> nessuno ha fetchato -> bianca.
 *
 * FIX:
 * Aggiungo a WorkspaceSpreadsheetRoot un useEffect che chiama
 * fetchIssues con le opzioni "spreadsheet" (canGroup:false, perPage:100),
 * uguali a quelle che usavano gli altri base root quando lo store e'
 * GLOBAL. Lo wrappo in .catch(swallowAbort) per evitare il pattern
 * "throw undefined" introdotto da workspace.service.ts su AbortError
 * (vedi PATCH v1.08).
 */

import React, { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
// plane constants
import { ALL_ISSUES, EIssueFilterType, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { IIssueDisplayFilterOptions } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
// components
import { AllIssueQuickActions } from "@/components/issues/issue-layouts/quick-action-dropdowns";
import { SpreadsheetLayoutLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";
// store
import { IssueLayoutHOC } from "../../issue-layout-HOC";
import type { TRenderQuickActions } from "../../list/list-view-types";
import { SpreadsheetView } from "../spreadsheet-view";

// PATCH v1.31a: stessa swallowAbort dei base root per non lasciare
// rejection uncaught quando una fetch precedente viene abortita al
// layout change.
const swallowAbort = (e: unknown) => {
  if (e === undefined || e === null) return;
  // eslint-disable-next-line no-console
  console.warn("[plane-custom][workspace-spreadsheet] fetch rejected:", e);
};

type Props = {
  isDefaultView: boolean;
  isLoading?: boolean;
  toggleLoading: (value: boolean) => void;
  workspaceSlug: string;
  globalViewId: string;
  routeFilters: {
    [key: string]: string;
  };
  fetchNextPages: () => void;
  globalViewsLoading: boolean;
  issuesLoading: boolean;
};

export const WorkspaceSpreadsheetRoot = observer(function WorkspaceSpreadsheetRoot(props: Props) {
  const { isLoading = false, workspaceSlug, globalViewId, fetchNextPages, issuesLoading } = props;

  // Custom hooks
  useWorkspaceIssueProperties(workspaceSlug);

  // Store hooks
  const {
    issuesFilter: { filters, updateFilters },
    issues: { getIssueLoader, getPaginationData, groupedIssueIds },
  } = useIssues(EIssuesStoreType.GLOBAL);
  // PATCH v1.31a: fetchIssues dal hook centrale, come fanno i base root.
  const { fetchIssues, updateIssue, removeIssue, archiveIssue } = useIssuesActions(EIssuesStoreType.GLOBAL);
  const { allowPermissions } = useUserPermissions();

  // Derived values
  const issueFilters = globalViewId ? filters?.[globalViewId.toString()] : undefined;

  // PATCH v1.31a: useEffect che fetcha le issue al mount e quando cambia
  // globalViewId. Senza questo, navigare direttamente al layout Spreadsheet
  // (o switchare da List/Kanban/Calendar) lascia il GLOBAL store vuoto e
  // quindi groupedIssueIds[ALL_ISSUES] = undefined -> SpreadsheetLayoutLoader
  // resta in mount permanente -> schermata bianca.
  // Opzioni: { canGroup: false, perPageCount: 100 } come gli altri base
  // root del workspace per Spreadsheet.
  useEffect(() => {
    if (!workspaceSlug || !globalViewId) return;
    fetchIssues("init-loader", { canGroup: false, perPageCount: 100 })?.catch(swallowAbort);
  }, [fetchIssues, workspaceSlug, globalViewId]);

  // Permission checker
  const canEditProperties = useCallback(
    (projectId: string | undefined) => {
      if (!projectId) return false;
      return allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        workspaceSlug.toString(),
        projectId
      );
    },
    [allowPermissions, workspaceSlug]
  );

  // Display filters handler
  const handleDisplayFiltersUpdate = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !globalViewId) return;

      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        { ...updatedDisplayFilter },
        globalViewId.toString()
      );
    },
    [updateFilters, workspaceSlug, globalViewId]
  );

  // Quick actions renderer
  const renderQuickActions: TRenderQuickActions = useCallback(
    ({ issue, parentRef, customActionButton, placement, portalElement }) => (
      <AllIssueQuickActions
        parentRef={parentRef}
        customActionButton={customActionButton}
        issue={issue}
        handleDelete={async () => removeIssue(issue.project_id, issue.id)}
        handleUpdate={async (data) => updateIssue && updateIssue(issue.project_id, issue.id, data)}
        handleArchive={async () => archiveIssue && archiveIssue(issue.project_id, issue.id)}
        portalElement={portalElement}
        readOnly={!canEditProperties(issue.project_id ?? undefined)}
        placements={placement}
      />
    ),
    [canEditProperties, removeIssue, updateIssue, archiveIssue]
  );

  // Loading state
  if ((isLoading && issuesLoading && getIssueLoader() === "init-loader") || !globalViewId || !groupedIssueIds) {
    return <SpreadsheetLayoutLoader />;
  }

  // Computed values
  const issueIds = groupedIssueIds[ALL_ISSUES];
  const nextPageResults = getPaginationData(ALL_ISSUES, undefined)?.nextPageResults;

  // Render spreadsheet
  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.SPREADSHEET}>
      <SpreadsheetView
        displayProperties={issueFilters?.displayProperties ?? {}}
        displayFilters={issueFilters?.displayFilters ?? {}}
        handleDisplayFilterUpdate={handleDisplayFiltersUpdate}
        issueIds={Array.isArray(issueIds) ? issueIds : []}
        quickActions={renderQuickActions}
        updateIssue={updateIssue}
        canEditProperties={canEditProperties}
        canLoadMoreIssues={!!nextPageResults}
        loadMoreIssues={fetchNextPages}
        isWorkspaceLevel
      />
    </IssueLayoutHOC>
  );
});
