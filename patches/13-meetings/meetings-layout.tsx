/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d:
 *  Layout della Meetings page. Pattern identico a Timesheet (v1.33f):
 *  AppHeader + ContentWrapper + Outlet.
 */

import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { MeetingsHeader } from "./header";

export default function MeetingsLayout() {
  return (
    <>
      <AppHeader header={<MeetingsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
