/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";
// local imports
import { AllIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseListRoot } from "../base-list-root";

// NOTA: il WorkspaceLayoutErrorBoundary NON e' piu' qui dentro.
// E' stato spostato nel dispatcher `WorkspaceAdditionalLayouts`
// (apps/web/ce/components/views/helper.tsx) cosi' da sedere SOPRA questo
// componente observer. Un ErrorBoundary cattura solo gli errori dei FIGLI:
// se lo mettiamo qui dentro, non vede gli errori che avvengono nel body
// stesso della funzione observer (hook come useIssues, ecc.).

export const WorkspaceListLayout = observer(function WorkspaceListLayout() {
  // router
  const { workspaceSlug, globalViewId } = useParams();
  // PATCH: fetcha modules/cycles/labels/estimates a livello workspace, come fa
  // WorkspaceSpreadsheetRoot. Senza questi dati i componenti issue crashano
  // durante il render (errore React #418).
  useWorkspaceIssueProperties(workspaceSlug);
  // hooks
  const { allowPermissions } = useUserPermissions();

  const canEditPropertiesBasedOnProject = (projectId: string) =>
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug?.toString(),
      projectId
    );

  return (
    <BaseListRoot
      QuickActions={AllIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
      viewId={globalViewId?.toString()}
    />
  );
});
