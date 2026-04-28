/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20d:
 *  StateDropdown ora include automaticamente gli workspace shared states
 *  (project=NULL) accanto ai project states locali.
 *
 *  Comportamento:
 *    - Se l'utente passa un `stateIds` esplicito via props -> rispetta
 *      quello (back-compat).
 *    - Altrimenti -> merge: project state ids del progetto corrente
 *      + workspace shared state ids del workspace corrente. Se il workspace
 *      non ha shared states, equivalente al comportamento stock.
 *
 *  Su `onDropdownOpen` ora si fetchano sia project states (come stock) sia
 *  workspace states (per popolare workspaceSharedStateIds nello store).
 *  La fetch e' guardata da fetchedMap per non rifare la stessa chiamata.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// local imports
import type { TWorkItemStateDropdownBaseProps } from "./base";
import { WorkItemStateDropdownBase } from "./base";

type TWorkItemStateDropdownProps = Omit<
  TWorkItemStateDropdownBaseProps,
  "stateIds" | "getStateById" | "onDropdownOpen" | "isInitializing"
> & {
  stateIds?: string[];
};

export const StateDropdown = observer(function StateDropdown(props: TWorkItemStateDropdownProps) {
  const { projectId, stateIds: propsStateIds } = props;
  // router params
  const { workspaceSlug } = useParams();
  // states
  const [stateLoader, setStateLoader] = useState(false);
  // store hooks
  const {
    fetchProjectStates,
    fetchWorkspaceStates,
    getProjectStateIds,
    getStateById,
    workspaceSharedStateIds,
  } = useProjectState();
  // derived values: merge project state ids + workspace shared state ids.
  // Se chiamante passa stateIds esplicito (workflow custom), lo rispettiamo.
  const projectStateIds = getProjectStateIds(projectId) ?? [];
  const sharedIds = workspaceSharedStateIds ?? [];
  const mergedStateIds = propsStateIds ?? Array.from(new Set([...projectStateIds, ...sharedIds]));

  // fetch states if not already loaded.
  // - project states: solo se mancanti per il progetto.
  // - workspace shared: solo se mai fetchati per il workspace corrente.
  const onDropdownOpen = async () => {
    if (!workspaceSlug) return;
    const slug = workspaceSlug.toString();
    const promises: Promise<unknown>[] = [];

    if ((projectStateIds.length === 0) && projectId) {
      promises.push(fetchProjectStates(slug, projectId));
    }
    if (sharedIds.length === 0) {
      // fetchWorkspaceStates carica TUTTI gli state del workspace
      // (project + shared) ma e' idempotente grazie a fetchedMap.
      promises.push(fetchWorkspaceStates(slug));
    }

    if (promises.length === 0) return;
    setStateLoader(true);
    try {
      await Promise.all(promises);
    } finally {
      setStateLoader(false);
    }
  };

  return (
    <WorkItemStateDropdownBase
      {...props}
      getStateById={getStateById}
      isInitializing={stateLoader}
      stateIds={mergedStateIds}
      onDropdownOpen={onDropdownOpen}
    />
  );
});
