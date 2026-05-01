# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33e:
#  Tabella generica per workspace-level feature toggles. JSONB cosi' e'
#  espandibile senza migration ogni volta che aggiungiamo un flag.
#
#  Scelta JSONB vs columns separate:
#   + Espandibile a costo zero (Meeting v1.34 aggiunge `meetings_enabled`
#     senza migrare lo schema, basta scrivere una nuova chiave).
#   + Lookup per workspace_id O(1) (UNIQUE su workspace_id).
#   - Niente CHECK constraint sui valori, validation lato app.
#   - Query "tutti i workspace dove flag X = true" non e' indicizzata
#     (usiamo il GIN index opzionale solo se serve in futuro).
#
#  Convenzione naming dei flag (importante per coerenza):
#   - Snake case
#   - Prefix con la feature (es. `time_tracking_*`, `meetings_*`)
#   - Boolean default false
#  Esempio JSON valido:
#    {
#      "time_tracking_enabled": true,
#      "time_tracking_approval_required": false,
#      "time_tracking_timer_enabled": true,
#      "meetings_enabled": false
#    }
#
#  Lazy create: se il workspace non ha mai toccato i settings,
#  l'endpoint GET ritorna {} e PATCH lo crea al primo write.

import uuid
from django.db import models


class WorkspaceFeatureSettings(models.Model):
    """
    Feature toggles per-workspace, flessibili via JSONB.
    """

    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, primary_key=True)

    workspace = models.OneToOneField(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="feature_settings",
    )

    features = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Workspace Feature Settings"
        verbose_name_plural = "Workspace Feature Settings"
        db_table = "workspace_feature_settings"

    def __str__(self):
        return f"FeatureSettings<{self.workspace_id}>"


# ---- helpers per leggere singoli flag con default safe ----

def get_workspace_feature(workspace, key: str, default=False):
    """
    Ritorna il valore del flag `key` per il workspace dato.
    Se il record non esiste o la chiave manca, ritorna `default`.
    Non solleva mai eccezione (chiamabile da qualsiasi view senza
    dover wrappare in try/except).
    """
    try:
        settings = WorkspaceFeatureSettings.objects.get(workspace=workspace)
        return settings.features.get(key, default)
    except WorkspaceFeatureSettings.DoesNotExist:
        return default
