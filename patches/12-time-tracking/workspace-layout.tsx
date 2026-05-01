/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33d:
 *  Layout root del workspace. Aggiunto <ActiveTimerBanner/> sopra
 *  l'<Outlet/> cosi' il banner timer appare in cima a TUTTE le pagine
 *  workspace (project list/detail, your work, settings, ecc) quando
 *  c'e' un timer attivo. Il componente self-hides se nessun timer.
 *
 *  Posizione: dentro WorkspaceContentWrapper -> non sovrappone i sidebar
 *  (AppRail / WorkspaceSidebar), occupa solo l'area main content.
 *  Sticky top-0 con z-40, mantiene visibile durante scroll.
 */

import { Outlet } from "react-router";
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
import { WorkspaceContentWrapper } from "@/plane-web/components/workspace/content-wrapper";
import { AppRailVisibilityProvider } from "@/plane-web/hooks/app-rail";
import { GlobalModals } from "@/plane-web/components/common/modal/global";
import { WorkspaceAuthWrapper } from "@/layouts/auth-layout/workspace-wrapper";
// PATCH v1.33d: timer banner persistente.
import { ActiveTimerBanner } from "@/components/issues/time-tracking/active-timer-banner";
import type { Route } from "./+types/layout";

export default function WorkspaceLayout(props: Route.ComponentProps) {
  const { workspaceSlug } = props.params;

  return (
    <AuthenticationWrapper>
      <WorkspaceAuthWrapper>
        <AppRailVisibilityProvider>
          <WorkspaceContentWrapper>
            {/* PATCH v1.33d: banner timer attivo (sticky top-0, self-hide
                se nessun timer). */}
            <ActiveTimerBanner workspaceSlug={workspaceSlug} />
            <GlobalModals workspaceSlug={workspaceSlug} />
            <Outlet />
          </WorkspaceContentWrapper>
        </AppRailVisibilityProvider>
      </WorkspaceAuthWrapper>
    </AuthenticationWrapper>
  );
}
