/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.22b:
 *  Hook React per ottenere il progetto fittizio "Workspace" del workspace
 *  corrente (Opzione A v1.22). Fa lazy-fetch via SWR del backend
 *  /api/workspaces/<slug>/workspace-project/ se non gia' fetched, lo
 *  cache in store, e ritorna il TWorkspaceProjectInfo.
 *
 *  Use case principale:
 *    const { workspaceProject, isLoading } = useWorkspaceProject();
 *    // workspaceProject.id = ID per pre-selezionare nel modal Create
 *    // (voce "Workspace" in cima al picker progetto).
 *
 *  Pattern: backend lazy-create idempotente, quindi safe chiamarlo a ogni
 *  mount del componente. SWR fa il dedup di chiamate concorrenti.
 */

import { useParams } from "next/navigation";
import useSWR from "swr";
// services
import type { TWorkspaceProjectInfo } from "@/services/workspace-project.service";
import { WorkspaceProjectService } from "@/services/workspace-project.service";

const workspaceProjectService = new WorkspaceProjectService();

export type TUseWorkspaceProjectReturn = {
  workspaceProject: TWorkspaceProjectInfo | undefined;
  isLoading: boolean;
  error: unknown;
};

/**
 * Hook che ritorna il progetto fittizio "Workspace" per il workspace
 * corrente (router param). Lazy-fetch idempotente.
 */
export function useWorkspaceProject(): TUseWorkspaceProjectReturn {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data, error, isLoading } = useSWR(
    slug ? `WORKSPACE_PROJECT_${slug}` : null,
    slug ? () => workspaceProjectService.getWorkspaceProject(slug) : null,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  return {
    workspaceProject: data,
    isLoading: !!isLoading,
    error,
  };
}
