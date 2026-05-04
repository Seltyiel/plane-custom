/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34h-2:
 *  Toggle "Show meetings in calendar" inline da renderizzare DENTRO il
 *  Display dropdown (display-filters-selection.tsx full-replacement).
 *
 *  Replica il pattern stock di FilterOption (CheckIcon + button cliccabile).
 *  Stesso visual di "Show sub-work items".
 *
 *  Storage backend: workspace_feature_settings (v1.33e generic, riusato).
 *  Key: meetings_show_in_calendar (bool, default true).
 *  Scope: per-workspace (non per-user). PATCH richiede admin.
 *  Member/Guest: vedono il flag corrente ma non possono cambiarlo.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
import { CheckIcon } from "@plane/propel/icons";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useFeatureSettings } from "@/hooks/use-feature-settings";
import { useUserPermissions } from "@/hooks/store/user";

const FLAG_KEY = "meetings_show_in_calendar";

export const MeetingsShowToggle = observer(function MeetingsShowToggle() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() || "";
  const { getFlag, setFlags } = useFeatureSettings(slug);
  const { allowPermissions } = useUserPermissions();

  const enabled = getFlag<boolean>(FLAG_KEY, true);
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAdmin) return;
    // Fire-and-forget: setFlags fa mutate sincrono lato cache.
    // Errori swallow silente (nessun toast invasivo).
    setFlags({ [FLAG_KEY]: !enabled }).catch(() => {});
  };

  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-sm p-1.5 hover:bg-layer-transparent-hover ${
        !isAdmin ? "cursor-not-allowed opacity-60" : ""
      }`}
      onClick={handleClick}
      disabled={!isAdmin}
      title={
        !isAdmin
          ? "Only workspace admins can change this setting"
          : enabled
            ? "Hide meetings from calendar"
            : "Show meetings in calendar"
      }
    >
      <div
        className={`grid h-3 w-3 flex-shrink-0 place-items-center rounded-xs border ${
          enabled
            ? "border-accent-strong bg-accent-primary text-on-color"
            : "border-strong"
        }`}
      >
        {enabled && <CheckIcon width={10} height={10} strokeWidth={3} />}
      </div>
      <div className="flex items-center gap-2 truncate">
        <div className="flex-grow truncate text-caption-sm-regular text-secondary">
          Show meetings in calendar
        </div>
      </div>
    </button>
  );
});
