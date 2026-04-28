/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.22e:
 *  Marker visivo per task del progetto "Workspace" (is_hidden=true).
 *  Aggiunta un'icona Globe + tooltip "Workspace task" dopo l'IdentifierText
 *  quando projectId === workspaceHiddenProjectId.
 *
 *  Questo componente e' importato da tutti e 5 i layout (list, kanban,
 *  calendar, gantt, spreadsheet) + peek-overview + parent-select + relations
 *  + power-k search + parent-tag + ecc. Una sola patch copre l'intero UI.
 *
 *  Implementazione:
 *  - Confronto projectId vs store.workspaceHiddenProjectId (computed v1.22b
 *    con fix interface v1.22d).
 *  - Icona Globe2 di lucide-react, dimensione coerente con la variante:
 *    inline-block 14px per variant=default, 12px per variant=small.
 *  - Tooltip da @plane/propel/tooltip con contenuto "Workspace task".
 *  - color text-tertiary per non rubare attenzione al contenuto.
 */

import { observer } from "mobx-react";
import { Globe2 } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueIdentifierProps, TIssueTypeIdentifier } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  // store hooks
  const { getProjectIdentifierById, workspaceHiddenProjectId } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // Determine if the component is using store data or not
  const isUsingStoreData = "issueId" in props;
  // derived values
  const issue = isUsingStoreData ? getIssueById(props.issueId) : null;
  const projectIdentifier = isUsingStoreData ? getProjectIdentifierById(projectId) : props.projectIdentifier;
  const issueSequenceId = isUsingStoreData ? issue?.sequence_id : props.issueSequenceId;
  const shouldRenderIssueID = displayProperties ? displayProperties.key : true;

  // PATCH v1.22e: marker workspace-level task.
  const isWorkspaceTask = !!workspaceHiddenProjectId && projectId === workspaceHiddenProjectId;
  // dimensione icona coerente con il testo dell'identifier
  const iconSizeClass = size === "xs" || size === "sm" ? "size-3" : "size-3.5";

  if (!shouldRenderIssueID) return null;

  return (
    <div className="flex shrink-0 items-center space-x-2">
      <IdentifierText
        identifier={`${projectIdentifier}-${issueSequenceId}`}
        enableClickToCopyIdentifier={enableClickToCopyIdentifier}
        variant={variant}
        size={size}
      />
      {isWorkspaceTask && (
        <Tooltip tooltipContent="Workspace task">
          <span className="inline-flex items-center text-tertiary" aria-label="Workspace task">
            <Globe2 className={`${iconSizeClass} shrink-0`} strokeWidth={2} />
          </span>
        </Tooltip>
      )}
    </div>
  );
});

export const IssueTypeIdentifier = observer(function IssueTypeIdentifier(_props: TIssueTypeIdentifier) {
  return <></>;
});
