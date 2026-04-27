/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19:
 *  Aggiunta voce "people" nello switcher di icone del sidebar (Users icon
 *  da lucide-react). Senza questa entry la voce People apparirebbe senza
 *  icona.
 */

import { Users } from "lucide-react";
import {
  AnalyticsIcon,
  ArchiveIcon,
  CycleIcon,
  DraftIcon,
  HomeIcon,
  InboxIcon,
  MultipleStickyIcon,
  ProjectIcon,
  ViewsIcon,
  YourWorkIcon,
} from "@plane/propel/icons";
import { cn } from "@plane/utils";

export const getSidebarNavigationItemIcon = (key: string, className: string = "") => {
  switch (key) {
    case "home":
      return <HomeIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "inbox":
      return <InboxIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "projects":
      return <ProjectIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "views":
      return <ViewsIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "active_cycles":
      return <CycleIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "analytics":
      return <AnalyticsIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "your_work":
      return <YourWorkIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "drafts":
      return <DraftIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "archives":
      return <ArchiveIcon className={cn("size-4 flex-shrink-0", className)} />;
    case "stickies":
      return <MultipleStickyIcon className={cn("size-4 flex-shrink-0", className)} />;
    // plane-custom v1.19
    case "people":
      return <Users className={cn("size-4 flex-shrink-0", className)} />;
  }
};
