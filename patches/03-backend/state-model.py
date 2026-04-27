# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.20a:
#  Workspace-level shared states (Opzione 3 - True workspace-shared).
#
#  Modifica chiave: State.project diventa NULLABLE.
#    - State con project=NOT NULL    -> stato "project-local" (legacy stock).
#    - State con project=NULL        -> stato "workspace-shared", visibile da
#                                        TUTTI i progetti del workspace.
#
#  Per non destabilizzare Issue / Module / Cycle / Label / ecc che ereditano
#  ancora da ProjectBaseModel (con project FK NOT NULL), State NON eredita
#  piu' da ProjectBaseModel. Definisce esplicitamente i due FK
#  (project NULLABLE + workspace NOT NULL).
#
#  Gli unique constraint sono ora due UniqueConstraint condizionali:
#    - state_unique_name_project_when_active:
#        unique(name, project) WHERE deleted_at IS NULL AND project IS NOT NULL
#    - state_unique_name_workspace_shared_when_active:
#        unique(name, workspace) WHERE deleted_at IS NULL AND project IS NULL
#  Cosi' un workspace puo' avere "In Progress" sia come state shared (1 record
#  con project=NULL) sia come state custom in N progetti (N record con
#  project=<n>) senza collisioni.
#
#  related_name preservati: project.project_state (back-compat con
#  apps/api/plane/bgtasks/workspace_seed_task.py).
#
#  save() override:
#    - Se project e' settato, popola workspace dal project (back-compat
#      ProjectBaseModel.save).
#    - Se project NULL, workspace deve essere passato esplicitamente dal
#      caller (workspace_id sara' richiesto dall'endpoint v1.20b).
#    - Sequence calcolata SOLO fra states dello stesso scope:
#      project-local fra project state, shared fra shared state.

# Django imports
from django.db import models
from django.template.defaultfilters import slugify
from django.db.models import Q

# Module imports
from .base import BaseModel
from plane.db.mixins import SoftDeletionManager


class StateGroup(models.TextChoices):
    BACKLOG = "backlog", "Backlog"
    UNSTARTED = "unstarted", "Unstarted"
    STARTED = "started", "Started"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    TRIAGE = "triage", "Triage"


# Default states (legacy: usato quando un nuovo progetto NON ha workspace
# states disponibili - vedi project/base.py patch v1.20a).
DEFAULT_STATES = [
    {
        "name": "Backlog",
        "color": "#60646C",
        "sequence": 15000,
        "group": StateGroup.BACKLOG.value,
        "default": True,
    },
    {
        "name": "Todo",
        "color": "#60646C",
        "sequence": 25000,
        "group": StateGroup.UNSTARTED.value,
    },
    {
        "name": "In Progress",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Done",
        "color": "#46A758",
        "sequence": 45000,
        "group": StateGroup.COMPLETED.value,
    },
    {
        "name": "Cancelled",
        "color": "#9AA4BC",
        "sequence": 55000,
        "group": StateGroup.CANCELLED.value,
    },
    {
        "name": "Triage",
        "color": "#4E5355",
        "sequence": 65000,
        "group": StateGroup.TRIAGE.value,
    },
]


class StateManager(SoftDeletionManager):
    """Default manager - excludes triage states"""

    def get_queryset(self):
        return super().get_queryset().exclude(group=StateGroup.TRIAGE.value)


class TriageStateManager(SoftDeletionManager):
    """Manager for triage states only"""

    def get_queryset(self):
        return super().get_queryset().filter(group=StateGroup.TRIAGE.value)


class State(BaseModel):
    # PATCH v1.20a: project NULLABLE per supportare workspace-shared states.
    # related_name="project_state" preservato per back-compat (era generato
    # da ProjectBaseModel come "project_%(class)s").
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="project_state",
        null=True,
        blank=True,
    )
    # workspace resta NOT NULL: ogni state appartiene SEMPRE a un workspace,
    # opzionalmente a un project. related_name="workspace_state".
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_state",
    )

    name = models.CharField(max_length=255, verbose_name="State Name")
    description = models.TextField(verbose_name="State Description", blank=True)
    color = models.CharField(max_length=255, verbose_name="State Color")
    slug = models.SlugField(max_length=100, blank=True)
    sequence = models.FloatField(default=65535)
    group = models.CharField(
        choices=StateGroup.choices,
        default=StateGroup.BACKLOG,
        max_length=20,
    )
    is_triage = models.BooleanField(default=False)
    default = models.BooleanField(default=False)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    objects = StateManager()
    all_state_objects = models.Manager()
    triage_objects = TriageStateManager()

    def __str__(self):
        """Return name of the state"""
        scope = self.project.name if self.project_id else f"workspace:{self.workspace.slug}"
        return f"{self.name} <{scope}>"

    class Meta:
        # PATCH v1.20a: rimosso unique_together legacy.
        # Sostituito da due UniqueConstraint condizionali (project / workspace
        # shared) per supportare entrambi gli scope senza collisioni.
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True, project__isnull=False),
                name="state_unique_name_project_when_active",
            ),
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True, project__isnull=True),
                name="state_unique_name_workspace_shared_when_active",
            ),
        ]
        verbose_name = "State"
        verbose_name_plural = "States"
        db_table = "states"
        ordering = ("sequence",)

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        # Popola workspace dal project se disponibile (back-compat
        # ProjectBaseModel.save). Se project e' NULL, il caller DEVE aver
        # passato workspace_id esplicitamente.
        if self.project_id and not self.workspace_id:
            self.workspace = self.project.workspace
        if not self.workspace_id:
            raise ValueError(
                "State must have either a project (which provides workspace) "
                "or an explicit workspace (for workspace-shared states)."
            )
        if self._state.adding:
            # Sequence: calcolata fra states dello stesso scope.
            #   project state -> max sequence fra altri project state dello
            #                     stesso project.
            #   workspace state -> max sequence fra altri workspace state
            #                       dello stesso workspace.
            if self.project_id:
                last_id = (
                    State.all_state_objects.filter(project=self.project)
                    .aggregate(largest=models.Max("sequence"))
                ["largest"]
                )
            else:
                last_id = (
                    State.all_state_objects.filter(
                        workspace=self.workspace, project__isnull=True
                    )
                    .aggregate(largest=models.Max("sequence"))
                ["largest"]
                )
            if last_id is not None:
                self.sequence = last_id + 15000

        return super().save(*args, **kwargs)
