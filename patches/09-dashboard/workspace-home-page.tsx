/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.26c:
 *  Inserisce <MyDashboard/> SOPRA il <WorkspaceHomeView/> stock.
 *  La home stock (sticky, recents, ecc) resta sotto, scrollabile.
 */

import { observer } from "mobx-react";
// components
import { useTranslation } from "@plane/i18n";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceHomeView } from "@/components/home";
// PATCH v1.26c
import { MyDashboard } from "@/components/home/my-dashboard";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// local components
import { WorkspaceDashboardHeader } from "./header";

function WorkspaceDashboardPage() {
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - ${t("home.title")}` : undefined;

  return (
    <>
      <AppHeader header={<WorkspaceDashboardHeader />} />
      <ContentWrapper>
        <PageHead title={pageTitle} />
        {/* PATCH v1.26c: la dashboard custom va sopra la home stock */}
        <MyDashboard />
        <WorkspaceHomeView />
      </ContentWrapper>
    </>
  );
}

export default observer(WorkspaceDashboardPage);
