/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.20d + v1.33f:
 *  Aggiunte mappature icone:
 *   - v1.20d: "states" -> Layers
 *   - v1.33f: "time-tracking" -> Clock
 */

import type { LucideIcon } from "lucide-react";
import { ArrowUpToLine, Building, Clock, CreditCard, Layers, Users, Webhook } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, LucideIcon | React.FC<ISvgIcons>> = {
  general: Building,
  members: Users,
  // PATCH v1.20d: icona Layers per "States".
  states: Layers,
  // PATCH v1.33f: icona Clock per "Time tracking".
  "time-tracking": Clock,
  export: ArrowUpToLine,
  "billing-and-plans": CreditCard,
  webhooks: Webhook,
};
