/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33f:
 *  Form con i toggle Time Tracking. Solo ADMIN puo' editare; per
 *  gli altri ruoli mostra read-only.
 *
 *  Toggle:
 *   - time_tracking_enabled (master)
 *   - time_tracking_timer_enabled (mostra/nascondi pulsante timer)
 *   - time_tracking_approval_required (admin approva ore prima del conteggio)
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Clock, Play, ShieldCheck } from "lucide-react";
import { ToggleSwitch } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useFeatureSettings } from "@/hooks/use-feature-settings";

type Props = {
  workspaceSlug: string;
  isAdmin: boolean;
};

const FLAG_ENABLED = "time_tracking_enabled";
const FLAG_TIMER_ENABLED = "time_tracking_timer_enabled";
const FLAG_APPROVAL_REQUIRED = "time_tracking_approval_required";

export const TimeTrackingSettingsForm = observer(function TimeTrackingSettingsForm(props: Props) {
  const { workspaceSlug, isAdmin } = props;

  const { getFlag, setFlags, isLoading } = useFeatureSettings(workspaceSlug);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const enabled = getFlag<boolean>(FLAG_ENABLED, false);
  const timerEnabled = getFlag<boolean>(FLAG_TIMER_ENABLED, true);
  const approvalRequired = getFlag<boolean>(FLAG_APPROVAL_REQUIRED, false);

  const handleToggle = async (key: string, value: boolean) => {
    setSavingKey(key);
    try {
      await setFlags({ [key]: value });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Settings saved",
      });
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to save",
        message: err?.detail || err?.error || "Unknown error",
      });
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return <p className="text-13 text-tertiary">Loading settings…</p>;
  }

  return (
    <div className="space-y-4">
      <Row
        icon={<Clock className="size-4" />}
        title="Enable Time Tracking"
        description="Master toggle. When OFF, the Time tracking section in issue sidebar and the timer banner are hidden."
        value={enabled}
        loading={savingKey === FLAG_ENABLED}
        disabled={!isAdmin}
        onChange={(v) => handleToggle(FLAG_ENABLED, v)}
      />

      <Row
        icon={<Play className="size-4" />}
        title="Show timer button (start/stop)"
        description="If OFF, only the manual log entry is available. The timer banner is also hidden."
        value={timerEnabled}
        loading={savingKey === FLAG_TIMER_ENABLED}
        disabled={!isAdmin || !enabled}
        onChange={(v) => handleToggle(FLAG_TIMER_ENABLED, v)}
      />

      <Row
        icon={<ShieldCheck className="size-4" />}
        title="Require admin approval"
        description="When ON, new logs are 'pending' and don't count in totals until an admin approves them. Existing approved logs are not affected."
        value={approvalRequired}
        loading={savingKey === FLAG_APPROVAL_REQUIRED}
        disabled={!isAdmin || !enabled}
        onChange={(v) => handleToggle(FLAG_APPROVAL_REQUIRED, v)}
      />

      {!isAdmin && (
        <p className="rounded-sm border border-subtle bg-layer-2 p-3 text-12 text-tertiary">
          Only workspace admins can change these settings.
        </p>
      )}
    </div>
  );
});

type RowProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  loading: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
};

function Row(props: RowProps) {
  const { icon, title, description, value, loading, disabled, onChange } = props;
  return (
    <div className="flex items-start justify-between gap-4 rounded-sm border border-subtle bg-layer-1 p-4">
      <div className="flex flex-1 items-start gap-3">
        <div className="mt-0.5 text-secondary">{icon}</div>
        <div className="flex-1">
          <h4 className="text-13 font-semibold text-primary">{title}</h4>
          <p className="mt-1 text-12 text-tertiary">{description}</p>
        </div>
      </div>
      <div className="shrink-0 pt-1">
        <ToggleSwitch value={value} onChange={onChange} disabled={disabled || loading} size="sm" />
      </div>
    </div>
  );
}
