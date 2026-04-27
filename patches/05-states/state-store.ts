/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20c:
 *  Frontend store per workspace shared states (Opzione 3).
 *  STEP 3 di 4 della milestone v1.20.
 *
 *  Estende StateStore stock con:
 *
 *    Computed:
 *      - workspaceSharedStateIds:    string[] degli state shared (project=NULL)
 *      - workspaceSharedStates:      IState[] degli state shared, sortati
 *      - groupedWorkspaceSharedStates: Record<group, IState[]>
 *      - getWorkspaceSharedStateById: getter da id
 *
 *    Actions:
 *      - createWorkspaceState(slug, data)
 *      - updateWorkspaceState(slug, stateId, data)
 *      - deleteWorkspaceState(slug, stateId)
 *      - markWorkspaceStateAsDefault(slug, stateId)
 *
 *  Tutti gli state (project + shared) vivono nello stesso `stateMap`
 *  esistente. La distinzione e' solo runtime via `state.project_id`:
 *    - project_id presente -> project-local state (legacy stock).
 *    - project_id null     -> workspace shared state (v1.20a+).
 *
 *  Il dropdown StateDropdown e la UI Workspace Settings seguiranno in
 *  v1.20d. Per ora questo store espone le API ma nessun consumer ancora
 *  le usa, quindi v1.20c e' invisibile lato UI.
 */

import { set, groupBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import type { IIntakeState, IState } from "@plane/types";
// helpers
import { sortStates } from "@plane/utils";
// plane web
import { ProjectStateService } from "@/services/project/project-state.service";
import type { RootStore } from "@/plane-web/store/root.store";

export interface IStateStore {
  //Loaders
  fetchedMap: Record<string, boolean>;
  fetchedIntakeMap: Record<string, boolean>;
  // observables
  stateMap: Record<string, IState>;
  intakeStateMap: Record<string, IIntakeState>;
  // computed
  workspaceStates: IState[] | undefined;
  projectStates: IState[] | undefined;
  groupedProjectStates: Record<string, IState[]> | undefined;
  // computed v1.20c (workspace shared states)
  workspaceSharedStateIds: string[] | undefined;
  workspaceSharedStates: IState[] | undefined;
  groupedWorkspaceSharedStates: Record<string, IState[]> | undefined;
  // computed actions
  getStateById: (stateId: string | null | undefined) => IState | undefined;
  getIntakeStateById: (intakeStateId: string | null | undefined) => IIntakeState | undefined;
  getProjectStates: (projectId: string | null | undefined) => IState[] | undefined;
  getProjectIntakeState: (projectId: string | null | undefined) => IIntakeState | undefined;
  getProjectStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectIntakeStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectDefaultStateId: (projectId: string | null | undefined) => string | undefined;
  // computed actions v1.20c
  getWorkspaceSharedStateById: (stateId: string | null | undefined) => IState | undefined;
  getWorkspaceSharedDefaultStateId: () => string | undefined;
  // fetch actions
  fetchProjectStates: (workspaceSlug: string, projectId: string) => Promise<IState[]>;
  fetchProjectIntakeState: (workspaceSlug: string, projectId: string) => Promise<IIntakeState>;
  fetchWorkspaceStates: (workspaceSlug: string) => Promise<IState[]>;
  // crud actions (project-scoped, stock)
  createState: (workspaceSlug: string, projectId: string, data: Partial<IState>) => Promise<IState>;
  updateState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    data: Partial<IState>
  ) => Promise<IState | undefined>;
  deleteState: (workspaceSlug: string, projectId: string, stateId: string) => Promise<void>;
  markStateAsDefault: (workspaceSlug: string, projectId: string, stateId: string) => Promise<void>;
  moveStatePosition: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    payload: Partial<IState>
  ) => Promise<void>;
  // crud actions v1.20c (workspace shared)
  createWorkspaceState: (workspaceSlug: string, data: Partial<IState>) => Promise<IState>;
  updateWorkspaceState: (
    workspaceSlug: string,
    stateId: string,
    data: Partial<IState>
  ) => Promise<IState | undefined>;
  deleteWorkspaceState: (workspaceSlug: string, stateId: string) => Promise<void>;
  markWorkspaceStateAsDefault: (workspaceSlug: string, stateId: string) => Promise<void>;

  getStatePercentageInGroup: (stateId: string | null | undefined) => number | undefined;
}

export class StateStore implements IStateStore {
  stateMap: Record<string, IState> = {};
  intakeStateMap: Record<string, IIntakeState> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  fetchedIntakeMap: Record<string, boolean> = {};
  rootStore: RootStore;
  router;
  stateService: ProjectStateService;

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      stateMap: observable,
      intakeStateMap: observable,
      fetchedMap: observable,
      fetchedIntakeMap: observable,
      // computed
      projectStates: computed,
      groupedProjectStates: computed,
      // v1.20c computed
      workspaceSharedStateIds: computed,
      workspaceSharedStates: computed,
      groupedWorkspaceSharedStates: computed,
      // fetch action
      fetchProjectStates: action,
      fetchProjectIntakeState: action,
      // CRUD actions
      createState: action,
      updateState: action,
      deleteState: action,
      // v1.20c CRUD actions
      createWorkspaceState: action,
      updateWorkspaceState: action,
      deleteWorkspaceState: action,
      markWorkspaceStateAsDefault: action,
      // state actions
      markStateAsDefault: action,
      moveStatePosition: action,
    });
    this.stateService = new ProjectStateService();
    this.router = _rootStore.router;
    this.rootStore = _rootStore;
  }

  /**
   * Returns the stateMap belongs to a specific workspace
   */
  get workspaceStates() {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!workspaceSlug || !this.fetchedMap[workspaceSlug]) return;
    return sortStates(Object.values(this.stateMap));
  }

  /**
   * Returns the stateMap belongs to a specific project
   */
  get projectStates() {
    const projectId = this.router.projectId;
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(Object.values(this.stateMap).filter((state) => state.project_id === projectId));
  }

  /**
   * Returns the stateMap belongs to a specific project grouped by group
   */
  get groupedProjectStates() {
    if (!this.router.projectId) return;

    // First group the existing states
    const groupedStates = groupBy(this.projectStates, "group") as Record<string, IState[]>;

    // Ensure all STATE_GROUPS are present
    const allGroups = Object.keys(STATE_GROUPS).reduce(
      (acc, group) => ({
        ...acc,
        [group]: groupedStates[group] || [],
      }),
      {} as Record<string, IState[]>
    );

    return allGroups;
  }

  // ===================================================================
  // v1.20c computed: workspace shared states (project_id == null)
  // ===================================================================

  /**
   * Workspace shared states: tutti gli state nel workspace corrente con
   * project_id null. Disponibili dopo fetchWorkspaceStates.
   */
  get workspaceSharedStates() {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!workspaceSlug || !this.fetchedMap[workspaceSlug]) return;
    return sortStates(Object.values(this.stateMap).filter((state) => state.project_id == null));
  }

  /**
   * Solo gli ID, comodo per dropdown stateIds prop.
   */
  get workspaceSharedStateIds() {
    return this.workspaceSharedStates?.map((s) => s.id);
  }

  /**
   * Workspace shared states grouped by group (backlog, unstarted, ...).
   * Garantisce che tutti i gruppi STATE_GROUPS siano presenti (vuoti se
   * nessuno state shared in quel gruppo).
   */
  get groupedWorkspaceSharedStates() {
    const shared = this.workspaceSharedStates;
    if (!shared) return;
    const groupedStates = groupBy(shared, "group") as Record<string, IState[]>;
    return Object.keys(STATE_GROUPS).reduce(
      (acc, group) => ({
        ...acc,
        [group]: groupedStates[group] || [],
      }),
      {} as Record<string, IState[]>
    );
  }

  /**
   * @description returns state details using state id
   * @param stateId
   */
  getStateById = computedFn((stateId: string | null | undefined) => {
    if (!this.stateMap || !stateId) return;
    return this.stateMap[stateId] ?? undefined;
  });

  /**
   * @description returns intake state details using intake state id
   * @param intakeStateId
   */
  getIntakeStateById = computedFn((intakeStateId: string | null | undefined) => {
    if (!this.intakeStateMap || !intakeStateId) return;
    return this.intakeStateMap[intakeStateId] ?? undefined;
  });

  /**
   * Returns the stateMap belongs to a project by projectId
   * @param projectId
   * @returns IState[]
   */
  getProjectStates = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(Object.values(this.stateMap).filter((state) => state.project_id === projectId));
  });

  /**
   * Returns the intake state for a project by projectId
   * @param projectId
   * @returns IIntakeState | undefined
   */
  getProjectIntakeState = computedFn((projectId: string | null | undefined) => {
    if (!projectId || !this.fetchedIntakeMap[projectId]) return;
    return Object.values(this.intakeStateMap).find((state) => state.project_id === projectId);
  });

  /**
   * Returns the state ids for a project by projectId
   * @param projectId
   * @returns string[]
   */
  getProjectStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug]))
      return undefined;
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.map((state) => state.id) ?? [];
  });

  /**
   * Returns the intake state ids for a project by projectId
   * @param projectId
   * @returns string[]
   */
  getProjectIntakeStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !this.fetchedIntakeMap[projectId]) return undefined;
    const projectIntakeState = this.getProjectIntakeState(projectId);
    return projectIntakeState?.id ? [projectIntakeState.id] : [];
  });

  /**
   * Returns the default state id for a project
   * @param projectId
   * @returns string | undefined
   */
  getProjectDefaultStateId = computedFn((projectId: string | null | undefined) => {
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.find((state) => state.default)?.id;
  });

  // ===================================================================
  // v1.20c getters per workspace shared states
  // ===================================================================

  /**
   * Workspace shared state by id (filtra project_id null per evitare di
   * mascherare un project state come workspace state).
   */
  getWorkspaceSharedStateById = computedFn((stateId: string | null | undefined) => {
    if (!stateId) return;
    const state = this.stateMap[stateId];
    if (!state) return;
    if (state.project_id != null) return;
    return state;
  });

  /**
   * ID dello workspace shared state marcato default (uno solo per workspace).
   */
  getWorkspaceSharedDefaultStateId = () => {
    return this.workspaceSharedStates?.find((s) => s.default)?.id;
  };

  /**
   * fetches the stateMap of a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchProjectStates = async (workspaceSlug: string, projectId: string) => {
    const statesResponse = await this.stateService.getStates(workspaceSlug, projectId);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
      });
      set(this.fetchedMap, projectId, true);
    });
    return statesResponse;
  };

  /**
   * fetches the intakeStateMap of a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchProjectIntakeState = async (workspaceSlug: string, projectId: string) => {
    const intakeStateResponse = await this.stateService.getIntakeState(workspaceSlug, projectId);
    runInAction(() => {
      set(this.intakeStateMap, [intakeStateResponse.id], intakeStateResponse);
      set(this.fetchedIntakeMap, projectId, true);
    });
    return intakeStateResponse;
  };

  /**
   * fetches the stateMap of all the states in workspace
   * @param workspaceSlug
   * @returns
   */
  fetchWorkspaceStates = async (workspaceSlug: string) => {
    const statesResponse = await this.stateService.getWorkspaceStates(workspaceSlug);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
      });
      set(this.fetchedMap, workspaceSlug, true);
    });
    return statesResponse;
  };

  /**
   * creates a new state in a project and adds it to the store
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns
   */
  createState = async (workspaceSlug: string, projectId: string, data: Partial<IState>) =>
    await this.stateService.createState(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.stateMap, [response?.id], response);
      });
      return response;
    });

  /**
   * Updates the state details in the store, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param data
   * @returns
   */
  updateState = async (workspaceSlug: string, projectId: string, stateId: string, data: Partial<IState>) => {
    const originalState = this.stateMap[stateId];
    try {
      runInAction(() => {
        set(this.stateMap, [stateId], { ...this.stateMap?.[stateId], ...data });
      });
      const response = await this.stateService.patchState(workspaceSlug, projectId, stateId, data);
      return response;
    } catch (error) {
      runInAction(() => {
        this.stateMap = {
          ...this.stateMap,
          [stateId]: originalState,
        };
      });
      throw error;
    }
  };

  /**
   * deletes the state from the store, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   */
  deleteState = async (workspaceSlug: string, projectId: string, stateId: string) => {
    if (!this.stateMap?.[stateId]) return;
    await this.stateService.deleteState(workspaceSlug, projectId, stateId).then(() => {
      runInAction(() => {
        delete this.stateMap[stateId];
      });
    });
  };

  /**
   * marks a state as default in a project
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   */
  markStateAsDefault = async (workspaceSlug: string, projectId: string, stateId: string) => {
    const originalStates = this.stateMap;
    const currentDefaultState = Object.values(this.stateMap).find(
      (state) => state.project_id === projectId && state.default
    );
    try {
      runInAction(() => {
        if (currentDefaultState) set(this.stateMap, [currentDefaultState.id, "default"], false);
        set(this.stateMap, [stateId, "default"], true);
      });
      await this.stateService.markDefault(workspaceSlug, projectId, stateId);
    } catch (error) {
      // reverting back to old state group if api fails
      runInAction(() => {
        this.stateMap = originalStates;
      });
      throw error;
    }
  };

  /**
   * updates the sort order of a state and updates the state information using API, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param direction
   * @param groupIndex
   */
  moveStatePosition = async (workspaceSlug: string, projectId: string, stateId: string, payload: Partial<IState>) => {
    const originalStates = this.stateMap;
    try {
      Object.entries(payload).forEach(([key, value]) => {
        runInAction(() => {
          set(this.stateMap, [stateId, key], value);
        });
      });
      // updating using api
      await this.stateService.patchState(workspaceSlug, projectId, stateId, payload);
    } catch {
      // reverting back to old state group if api fails
      runInAction(() => {
        this.stateMap = originalStates;
      });
    }
  };

  // ===================================================================
  // v1.20c CRUD actions: workspace shared states
  // ===================================================================

  /**
   * Crea uno workspace shared state. Il backend forza project_id=null.
   * Aggiunge la response al stateMap (insieme agli state project-local).
   */
  createWorkspaceState = async (workspaceSlug: string, data: Partial<IState>) =>
    await this.stateService.createWorkspaceState(workspaceSlug, data).then((response) => {
      runInAction(() => {
        set(this.stateMap, [response?.id], response);
      });
      return response;
    });

  /**
   * Modifica uno workspace shared state. Optimistic update + rollback su errore.
   */
  updateWorkspaceState = async (workspaceSlug: string, stateId: string, data: Partial<IState>) => {
    const originalState = this.stateMap[stateId];
    if (!originalState) return undefined;
    if (originalState.project_id != null) {
      throw new Error("updateWorkspaceState invoked on a project-local state; use updateState instead.");
    }
    try {
      runInAction(() => {
        set(this.stateMap, [stateId], { ...originalState, ...data });
      });
      const response = await this.stateService.patchWorkspaceState(workspaceSlug, stateId, data);
      // refresh con la response definitiva del server
      runInAction(() => {
        set(this.stateMap, [stateId], { ...this.stateMap[stateId], ...response });
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.stateMap = { ...this.stateMap, [stateId]: originalState };
      });
      throw error;
    }
  };

  /**
   * Cancella uno workspace shared state. Backend rifiuta se default o ha
   * issue collegati (lascia che il caller gestisca l'errore).
   */
  deleteWorkspaceState = async (workspaceSlug: string, stateId: string) => {
    if (!this.stateMap?.[stateId]) return;
    if (this.stateMap[stateId].project_id != null) {
      throw new Error("deleteWorkspaceState invoked on a project-local state; use deleteState instead.");
    }
    await this.stateService.deleteWorkspaceState(workspaceSlug, stateId).then(() => {
      runInAction(() => {
        delete this.stateMap[stateId];
      });
    });
  };

  /**
   * Setta default=true sullo state passato e default=false su tutti gli
   * altri workspace shared dello stesso workspace. Optimistic update.
   */
  markWorkspaceStateAsDefault = async (workspaceSlug: string, stateId: string) => {
    const originalStates = this.stateMap;
    const target = this.stateMap[stateId];
    if (!target) return;
    if (target.project_id != null) {
      throw new Error("markWorkspaceStateAsDefault on a project-local state.");
    }
    const currentDefault = Object.values(this.stateMap).find(
      (s) => s.project_id == null && s.default
    );
    try {
      runInAction(() => {
        if (currentDefault) set(this.stateMap, [currentDefault.id, "default"], false);
        set(this.stateMap, [stateId, "default"], true);
      });
      await this.stateService.markWorkspaceStateAsDefault(workspaceSlug, stateId);
    } catch (error) {
      runInAction(() => {
        this.stateMap = originalStates;
      });
      throw error;
    }
  };

  /**
   * Returns the percentage position of a state within its group based on sequence
   * @param stateId The ID of the state to find the percentage for
   * @returns The percentage position of the state in its group (0-100), or -1 if not found
   */
  getStatePercentageInGroup = computedFn((stateId: string | null | undefined) => {
    if (!stateId || !this.stateMap[stateId]) return -1;

    const state = this.stateMap[stateId];
    const group = state.group;

    if (!group || !this.groupedProjectStates || !this.groupedProjectStates[group]) return -1;

    // Get all states in the same group
    const statesInGroup = this.groupedProjectStates[group];
    const stateIndex = statesInGroup.findIndex((s) => s.id === stateId);

    if (stateIndex === -1) return undefined;

    // Calculate percentage: ((index + 1) / totalLength) * 100
    return ((stateIndex + 1) / statesInGroup.length) * 100;
  });
}
