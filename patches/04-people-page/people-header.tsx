/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19 + v1.22d:
 *  Header per la People page.
 *  v1.19: Minimale, solo breadcrumb.
 *  v1.22d: Aggiunto pulsante "+ Add work item" a destra. Apre il global
 *          CreateUpdateIssueModal (montato in WorkItemLevelModals al livello
 *          (all)/[workspaceSlug]/(projects)/layout.tsx). Permesso a Admin/
 *          Member del workspace; disabilitato altrimenti. allowedProjectIds
 *          = undefined => tutti i project utente + il "Workspace" project
 *          (in cima al picker grazie a v1.22c).
 */

import { observer } from "mobx-react";
import { Plus, Users } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

export const WorkspacePeopleHeader = observer(function WorkspacePeopleHeader() {
  // store hooks
  const { toggleCreateIssueModal } = useCommandPalette();
  const { joinedProjectIds, workspaceHiddenProjectId } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const canCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  // Disabled solo se l'utente NON ha permessi. joinedProjectIds puo' essere
  // vuoto: con v1.22 esiste sempre il "Workspace" project come fallback
  // (lazy-creato dal picker grazie a useWorkspaceProject in
  // issue-modal/components/project-select.tsx).
  const hasAnyTarget = (joinedProjectIds?.length ?? 0) > 0 || !!workspaceHiddenProjectId;
  const disabled = !canCreateIssue || !hasAnyTarget;

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="People"
                  icon={<Users className="size-4 text-secondary" />}
                />
              }
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        <Button
          variant="primary"
          size="lg"
          prependIcon={<Plus className="size-4" />}
          disabled={disabled}
          onClick={() => toggleCreateIssueModal(true, EIssuesStoreType.PROJECT, undefined)}
        >
          Add work item
        </Button>
      </Header.RightItem>
    </Header>
  );
});
