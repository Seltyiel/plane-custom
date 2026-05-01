# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.33a:
#  Modello TimeLog per il sistema di tracking ore lavoro.
#
#  Ogni riga rappresenta una sessione di lavoro loggata da un utente
#  su un'issue. La durata e' salvata come INTEGER seconds (non
#  DECIMAL hours) per evitare problemi di arrotondamento.
#
#  Provenienza: 'manual' (utente compila form) o 'timer' (creato
#  automaticamente al stop del timer attivo - vedi v1.33b).
#
#  Approval workflow (off di default in MVP, attivabile in v1.33e):
#  - 'auto':     creato e gia' contabilizzato (no approval_required)
#  - 'pending':  creato e in attesa di approval (admin)
#  - 'approved': admin ha confermato
#  - 'rejected': admin ha rigettato (con reason)
#
#  Soft delete via mixin AuditModel (ereditato da BaseModel).
#
#  NOTA v1.33a MVP: issue_id NOT NULL, niente "ore generiche". Si
#  potra' allentare in futuro se serve.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


# Costanti per validazione duration: max 7 giorni in seconds (sanity bound)
TIME_LOG_MAX_DURATION_SECONDS = 86400 * 7


class TimeLogSource(models.TextChoices):
    MANUAL = "manual", "Manual entry"
    TIMER = "timer", "Timer stop"


class TimeLogApprovalStatus(models.TextChoices):
    AUTO = "auto", "Auto-approved (no workflow)"
    PENDING = "pending", "Pending approval"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class TimeLog(BaseModel):
    """
    Una sessione di lavoro loggata da un utente su un'issue.
    """

    # Scope: workspace required, project required (in MVP).
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_time_logs",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="project_time_logs",
        null=True,
        blank=True,
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="issue_time_logs",
    )

    # Chi ha loggato.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_time_logs",
    )

    # Durata in secondi. CheckConstraint a livello DB per impedire
    # valori 0/negativi/eccessivi (gestione errori applicativa).
    duration_seconds = models.IntegerField()

    # Quando e' stato fatto il lavoro (timestamp lavorato, non
    # timestamp di creazione record). E' quello che usiamo per
    # filtrare report "ore della scorsa settimana".
    logged_at = models.DateTimeField()

    # Nota libera (es. "fix bug X", "review PR", ecc.).
    description = models.TextField(null=True, blank=True)

    # Provenienza: manual o timer-stop.
    source = models.CharField(
        max_length=16,
        choices=TimeLogSource.choices,
        default=TimeLogSource.MANUAL,
    )

    # Solo per source='timer': start time della sessione, per audit.
    timer_started_at = models.DateTimeField(null=True, blank=True)

    # Approval workflow.
    approval_status = models.CharField(
        max_length=16,
        choices=TimeLogApprovalStatus.choices,
        default=TimeLogApprovalStatus.AUTO,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="approved_time_logs",
        null=True,
        blank=True,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Time Log"
        verbose_name_plural = "Time Logs"
        db_table = "time_logs"
        ordering = ("-logged_at", "-created_at")
        constraints = [
            models.CheckConstraint(
                check=models.Q(duration_seconds__gt=0)
                & models.Q(duration_seconds__lte=TIME_LOG_MAX_DURATION_SECONDS),
                name="time_log_duration_seconds_range",
            ),
        ]
        indexes = [
            # Report per utente in un periodo (timesheet page filtri user+from+to).
            models.Index(fields=["user", "-logged_at"], name="time_log_user_logged_idx"),
            # Lista log per issue (sidebar issue).
            models.Index(fields=["issue", "-logged_at"], name="time_log_issue_idx"),
            # Report workspace-wide.
            models.Index(fields=["workspace", "logged_at"], name="time_log_ws_logged_idx"),
            # Approval queue (admin vede pending). Partial via condition not
            # supported in tutti i db ma postgres si.
            models.Index(
                fields=["workspace", "approval_status"],
                name="time_log_pending_idx",
                condition=models.Q(approval_status="pending"),
            ),
        ]

    def save(self, *args, **kwargs):
        # Auto-fill workspace e project dall'issue per coerenza.
        if self.issue_id:
            if not self.workspace_id:
                self.workspace_id = self.issue.workspace_id
            if not self.project_id:
                self.project_id = self.issue.project_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"TimeLog<{self.user_id} {self.duration_seconds}s on issue {self.issue_id}>"
