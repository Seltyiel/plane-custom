/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.22c:
 *  Esteso IssueProjectSelect per supportare il progetto fittizio
 *  "Workspace" (Opzione A v1.22) come scelta valida nel picker.
 *
 *  Modifiche vs stock:
 *    1. Chiama useWorkspaceProject() per lazy-fetch del progetto fittizio
 *       (idempotente, fa get_or_create + sync ProjectMember server-side).
 *    2. Estende renderCondition: il workspace project e' accettato anche
 *       se non e' in allowedProjectIds (caller non puo' conoscerlo a
 *       priori). Gli altri continuano a passare per il filter stock.
 *
 *  Risultato: nel modal "Create work item" l'utente vede "Workspace" in
 *  cima al picker (grazie a ProjectDropdown patchato v1.22c). Selezionando
 *  "Workspace" il task viene creato con project_id=workspaceHiddenProjectId
 *  (il backend lo salva sul progetto fittizio).
 */

import React from "react";
import { observer } from "mobx-react";
import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
// types
import type { TIssue } from "@plane/types";
import { getTabIndex } from "@plane/utils";
// components
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useProject } from "@/hooks/store/use-project";
// PATCH v1.22c: lazy-fetch del progetto fittizio Workspace.
import { useWorkspaceProject } from "@/hooks/use-workspace-project";

type TIssueProjectSelectProps = {
  control: Control<TIssue>;
  disabled?: boolean;
  handleFormChange: () => void;
};

export const IssueProjectSelect = observer(function IssueProjectSelect(props: TIssueProjectSelectProps) {
  const { control, disabled = false, handleFormChange } = props;
  // store hooks
  const { isMobile } = usePlatformOS();
  const { workspaceHiddenProjectId } = useProject();
  // context hooks
  const { allowedProjectIds } = useIssueModal();
  // PATCH v1.22c: triggera la fetch del progetto fittizio (no-op se gia'
  // creato lato backend, popola il projectMap per il dropdown).
  useWorkspaceProject();

  const { getIndex } = getTabIndex(ETabIndices.ISSUE_FORM, isMobile);

  return (
    <Controller
      control={control}
      name="project_id"
      rules={{
        required: true,
      }}
      render={({ field: { value, onChange } }) => (
        <div className="h-7">
          <ProjectDropdown
            value={value}
            onChange={(projectId) => {
              onChange(projectId);
              handleFormChange();
            }}
            multiple={false}
            buttonVariant="border-with-text"
            renderCondition={(projectId) =>
              // PATCH v1.22c: il workspace project (fittizio) e' sempre
              // accettato anche se non e' in allowedProjectIds (caller
              // non puo' conoscerlo a priori).
              projectId === workspaceHiddenProjectId || allowedProjectIds.includes(projectId)
            }
            tabIndex={getIndex("project_id")}
            disabled={disabled}
          />
        </div>
      )}
    />
  );
});
