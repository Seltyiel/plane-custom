/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.22e + v1.25b:
 *  v1.22e: Marker globe per task del progetto "Workspace" (is_hidden=true).
 *  v1.25b: Avatar/logo del project PRIMA dell'IdentifierText (es. "[icon]
 *    O-13") cosi' nelle viste workspace l'utente vede subito a quale project
 *    appartiene ogni task. Tooltip mostra il nome completo del project.
 *
 *  Questo componente e' importato da tutti e 5 i layout (list, kanban,
 *  calendar, gantt, spreadsheet) + peek-overview + parent-select + relations
 *  + power-k search + parent-tag + ecc. Una sola patch copre l'intero UI.
 *
 *  Implementazione:
 *  - Avatar: <Logo logo={project.logo_props} size={14}/> (stesso componente
 *    usato dal sidebar e dai project picker). Color/icon scelto dall'utente.
 *  - Globe marker: post-pended quando isWorkspaceTask.
 *  - Tooltip sul logo con il nome del project.
 */

import { observer } from "mobx-react";
import { Globe2 } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueIdentifierProps, TIssueTypeIdentifier } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  // store hooks
  const { getProjectIdentifierById, getPartialProjectById, workspaceHiddenProjectId } = useProject();
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

  // PATCH v1.25b: avatar/logo del project per identificazione visiva.
  const projectDetails = projectId ? getPartialProjectById(projectId) : undefined;
  const projectLogoProps = projectDetails?.logo_props;
  const projectName = projectDetails?.name;
  const logoSize = size === "xs" || size === "sm" ? 12 : size === "lg" ? 16 : 14;
  // PATCH v1.25c: nelle viste estese (size="md", usato da IssueTypeSwitcher
  // che e' renderizzato dentro peek-overview e detail page) mostriamo
  // anche il nome del project, non solo il logo. Compact viste (xs/sm/lg)
  // mantengono solo il logo.
  const showProjectName = size === "md";

  if (!shouldRenderIssueID) return null;

  return (
    <div className="flex shrink-0 items-center space-x-1.5">
      {projectLogoProps && (
        <Tooltip tooltipContent={projectName ?? ""}>
          <span className="inline-flex shrink-0 items-center" aria-label={projectName ?? "project"}>
            <Logo logo={projectLogoProps} size={logoSize} />
          </span>
        </Tooltip>
      )}
      {showProjectName && projectName && (
        <span className="text-13 font-medium text-secondary">{projectName}</span>
      )}
      {showProjectName && (
        <span className="text-tertiary select-none" aria-hidden>
          /
        </span>
      )}
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
