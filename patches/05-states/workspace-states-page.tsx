/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20d:
 *  Workspace Settings -> States page (page.tsx).
 *
 *  Rotta: /<workspaceSlug>/settings/states/
 *
 *  Mostra la lista dei workspace shared states (modificabile solo da Admin)
 *  riutilizzando WorkspaceStateRoot (v1.20d).
 *
 *  PATCH v1.20d hotfix #1: stringhe statiche invece di t() con defaultValue
 *  (la i18n di Plane non supporta defaultValue come fallback).
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// plane-custom v1.20d
import { WorkspaceStateRoot } from "@/components/workspace-states/root";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import type { Route } from "./+types/page";
import { StatesWorkspaceSettingsHeader } from "./header";

function StatesWorkspaceSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  // store
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  // derived
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - States` : "Workspace States";

  // accesso: Admin/Member del workspace possono vedere; solo Admin puo' editare
  // (la edit-gate e' gestita dentro WorkspaceStateRoot via isEditable).
  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  if (workspaceUserInfo && !canPerformWorkspaceMemberActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<StatesWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title="Workspace States"
          description="Stati condivisi a livello workspace. Visibili da tutti i progetti del workspace; le modifiche si applicano automaticamente a tutti i task che li usano."
        />
        <div className="mt-6">
          <WorkspaceStateRoot workspaceSlug={workspaceSlug} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(StatesWorkspaceSettingsPage);
