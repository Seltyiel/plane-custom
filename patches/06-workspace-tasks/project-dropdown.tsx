/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.22c:
 *  ProjectDropdown ora include come PRIMA voce il progetto fittizio
 *  "Workspace" (Opzione A v1.22). Cosi' nel modal Create work item
 *  l'utente puo' creare un task workspace-level selezionando "Workspace"
 *  come progetto.
 *
 *  Implementazione:
 *    - Concatena workspaceHiddenProjectId (dal store) in cima a
 *      joinedProjectIds prima di passarli a ProjectDropdownBase.
 *    - L'item viene renderizzato dal base con name="Workspace" e
 *      identifier="WS" (i metadata che il backend ha salvato sul progetto
 *      fittizio v1.22a). Nessuna icon custom: il nome "Workspace" e' gia'
 *      visivamente distinto dagli altri progetti.
 *    - Se workspaceHiddenProjectId non e' ancora nello store (prima fetch
 *      di /projects/), viene saltato.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import type { TDropdownProps } from "../types";
import { ProjectDropdownBase } from "./base";

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  onClose?: () => void;
  renderCondition?: (projectId: string) => boolean;
  renderByDefault?: boolean;
  currentProjectId?: string;
} & (
    | {
        multiple: false;
        onChange: (val: string) => void;
        value: string | null;
      }
    | {
        multiple: true;
        onChange: (val: string[]) => void;
        value: string[];
      }
  );

export const ProjectDropdown = observer(function ProjectDropdown(props: Props) {
  // store hooks
  const { joinedProjectIds, getProjectById, workspaceHiddenProjectId } = useProject();

  // PATCH v1.22c: concatena il workspace project (fittizio) in cima.
  // Se workspaceHiddenProjectId e' undefined (non ancora nel store),
  // si comporta come stock.
  const ids = workspaceHiddenProjectId
    ? [workspaceHiddenProjectId, ...(joinedProjectIds ?? [])]
    : joinedProjectIds;

  return <ProjectDropdownBase {...props} getProjectById={getProjectById} projectIds={ids} />;
});
