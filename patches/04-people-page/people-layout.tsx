/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19:
 *  Layout wrapper per la People page. Stessa struttura usata dalla
 *  pagina stickies (AppHeader + ContentWrapper + Outlet).
 */

import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { WorkspacePeopleHeader } from "./header";

export default function WorkspacePeopleLayout() {
  return (
    <>
      <AppHeader header={<WorkspacePeopleHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
