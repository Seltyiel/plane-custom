/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34g:
 *  Form con i toggle Meeting workspace settings. Solo ADMIN puo' editare;
 *  per gli altri ruoli mostra read-only.
 *
 *  Toggle:
 *   - meetings_admin_audit_mode (admin vede meeting altrui in lite mode)
 *
 *  Riusa la stessa struttura "Row" del time-tracking-settings-form (v1.33f)
 *  per coerenza visiva. Riusa useFeatureSettings (workspace_feature_settings
 *  table generic, v1.33e).
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Eye } from "lucide-react";
import { ToggleSwitch } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useFeatureSettings } from "@/hooks/use-feature-settings";

type Props = {
  workspaceSlug: string;
  isAdmin: boolean;
};

const FLAG_AUDIT_MODE = "meetings_admin_audit_mode";

export const MeetingsSettingsForm = observer(function MeetingsSettingsForm(props: Props) {
  const { workspaceSlug, isAdmin } = props;

  const { getFlag, setFlags, isLoading } = useFeatureSettings(workspaceSlug);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const auditMode = getFlag<boolean>(FLAG_AUDIT_MODE, false);

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
        icon={<Eye className="size-4" />}
        title="Audit mode for workspace admins"
        description="When ON, workspace admins can see meeting metadata (title, start/end, attendee count) for meetings they are not part of. Detail content (description, attendee names, location) remains private. Useful for compliance/audit. Default OFF: each user sees only meetings they're creator or attendee of."
        value={auditMode}
        loading={savingKey === FLAG_AUDIT_MODE}
        disabled={!isAdmin}
        onChange={(v) => handleToggle(FLAG_AUDIT_MODE, v)}
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
