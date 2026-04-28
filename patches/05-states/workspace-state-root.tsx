/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20d:
 *  Workspace Settings -> States Root component.
 *
 *  PATCH v1.20d hotfix #1:
 *    - Loader gating su isLoading di SWR (NON sulla computed dello store)
 *      per evitare skeleton infiniti quando la computed dipende da
 *      router.workspaceSlug che potrebbe non essere popolato in tempo.
 *    - groupedWorkspaceSharedStates calcolato localmente con groupBy
 *      sulla osservabile stateMap dello store, indipendente dal
 *      fetchedMap. Cosi' la pagina si popola appena la fetch torna,
 *      anche se altre parti dello store non sono pronte.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { groupBy } from "lodash-es";
// plane imports
import { EUserPermissionsLevel, STATE_GROUPS } from "@plane/constants";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { sortStates } from "@plane/utils";
// components
import { ProjectStateLoader, GroupList } from "@/components/project-states";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";

type TWorkspaceStateRootProps = {
  workspaceSlug: string;
};

export const WorkspaceStateRoot = observer(function WorkspaceStateRoot(props: TWorkspaceStateRootProps) {
  const { workspaceSlug } = props;
  // hooks
  const {
    stateMap,
    fetchWorkspaceStates,
    createWorkspaceState,
    updateWorkspaceState,
    deleteWorkspaceState,
    markWorkspaceStateAsDefault,
  } = useProjectState();
  const { allowPermissions } = useUserPermissions();
  // derived: solo workspace admin puo' modificare
  const isEditable = allowPermissions(
    [EUserWorkspaceRoles.ADMIN],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );

  // Fetch workspace states (project + shared aggregati lato server).
  // Usiamo isLoading per il gating del loader, NON la computed dello store.
  const { isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_STATES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchWorkspaceStates(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // Filtra workspace shared (project_id == null) direttamente dallo stateMap.
  // Indipendente da this.router.workspaceSlug interno allo store.
  // NB: NO useMemo qui. stateMap e' un MobX observable: useMemo con dep
  // [stateMap] non si invalida quando il contenuto cambia (la reference
  // resta stabile). L'observer HOC ricalcola comunque il body della
  // funzione ad ogni render reattivo, quindi va bene fare il filter
  // inline. Il costo e' irrilevante (qualche dozzina di state max).
  const sharedStates = sortStates(
    Object.values(stateMap).filter((state) => state.project_id == null)
  );
  const groupedShared = groupBy(sharedStates, "group") as Record<string, IState[]>;
  const groupedWorkspaceSharedStates = Object.keys(STATE_GROUPS).reduce(
    (acc, group) => ({
      ...acc,
      [group]: groupedShared[group] || [],
    }),
    {} as Record<string, IState[]>
  );

  // Callback CRUD per la GroupList. Adatta la signature TStateOperationsCallbacks
  // (project-scoped: stateId + data) wrappando le action workspace-scoped.
  const stateOperationsCallbacks: TStateOperationsCallbacks = useMemo(
    () => ({
      createState: async (data: Partial<IState>) => {
        const cleaned = { ...data };
        delete (cleaned as { project_id?: unknown }).project_id;
        delete (cleaned as { project?: unknown }).project;
        return createWorkspaceState(workspaceSlug, cleaned);
      },
      updateState: async (stateId: string, data: Partial<IState>) =>
        updateWorkspaceState(workspaceSlug, stateId, data),
      deleteState: async (stateId: string) => deleteWorkspaceState(workspaceSlug, stateId),
      // Workspace shared non hanno una moveStatePosition dedicata: il sequence
      // si aggiorna come qualsiasi altro campo via updateWorkspaceState.
      moveStatePosition: async (stateId: string, data: Partial<IState>) => {
        await updateWorkspaceState(workspaceSlug, stateId, data);
      },
      markStateAsDefault: async (stateId: string) =>
        markWorkspaceStateAsDefault(workspaceSlug, stateId),
    }),
    [
      workspaceSlug,
      createWorkspaceState,
      updateWorkspaceState,
      deleteWorkspaceState,
      markWorkspaceStateAsDefault,
    ]
  );

  // Loader durante la prima fetch (isLoading flag SWR).
  if (isLoading) return <ProjectStateLoader />;

  return (
    <GroupList
      groupedStates={groupedWorkspaceSharedStates}
      stateOperationsCallbacks={stateOperationsCallbacks}
      isEditable={isEditable}
      shouldTrackEvents={false}
    />
  );
});
