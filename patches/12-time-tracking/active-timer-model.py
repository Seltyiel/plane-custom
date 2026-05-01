# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33b:
#  Modello ActiveTimer per il timer start/stop del Time Tracking.
#
#  Ogni utente ha al massimo 1 timer attivo (DB UNIQUE su user_id).
#  Quando l'utente preme "Start" su un task, creiamo questo record.
#  Quando preme "Stop", calcoliamo la durata, creiamo una riga TimeLog
#  con source='timer' + timer_started_at, e cancelliamo l'ActiveTimer.
#
#  Edge case "issue eliminata mentre timer girava": issue FK ha
#  on_delete=SET_NULL. Se l'utente prova a stoppare un timer su issue
#  ormai gone, l'endpoint stop() la gestisce graziosamente (cancella
#  il timer + warning, non crea TimeLog orfano).
#
#  NON eredita da BaseModel/AuditModel: non ha senso soft-delete su un
#  timer, ne' versioning. E' uno stato volatile.

import uuid
from django.conf import settings
from django.db import models


class ActiveTimer(models.Model):
    """
    Timer attivo. Massimo 1 per utente (UNIQUE constraint).
    """

    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, primary_key=True)

    # UNIQUE: 1 timer per utente. Postgres lo enforced a livello DB.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="active_timer",
    )

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_active_timers",
    )

    # Issue su cui il timer e' attivo. SET_NULL se l'issue viene cancellata
    # mentre il timer gira: cosi' lo stop puo' rilevarlo e gestirlo.
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.SET_NULL,
        related_name="issue_active_timers",
        null=True,
        blank=True,
    )

    # Quando e' partito il timer. Usato a stop() per calcolare duration.
    started_at = models.DateTimeField(auto_now_add=True)

    # Annotazione opzionale impostabile a start o aggiornabile durante.
    # Il valore finale viene copiato sulla TimeLog risultante allo stop,
    # ma puo' essere sovrascritto dal payload di stop().
    description = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Active Timer"
        verbose_name_plural = "Active Timers"
        db_table = "active_timers"
        ordering = ("-started_at",)

    def __str__(self):
        return f"ActiveTimer<user={self.user_id} issue={self.issue_id} since {self.started_at}>"
