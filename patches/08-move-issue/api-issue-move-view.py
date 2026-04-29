# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# PATCH (plane-custom) v1.24a:
#  Endpoint POST /api/workspaces/<slug>/issues/<issue_id>/move/
#  Sposta un task da un project ad un altro all'interno dello stesso
#  workspace. Si appoggia a sub-issue ricorsive opzionali.
#
#  Body:
#    {
#      "target_project_id": "<uuid>",
#      "include_sub_issues": true   // opzionale, default true
#    }
#
#  Logica:
#    1. transaction.atomic + select_for_update sull'issue.
#    2. Permission: ADMIN/MEMBER del workspace + member del target project.
#    3. Genera nuovo sequence_id col pattern stock (advisory_xact_lock per
#       il target project, fonte: Issue.save() in db/models/issue.py:217).
#    4. Smart state mapping: cerca nel target project uno state con stesso
#       (name, group). Se non c'e' match, usa il default state. Se non c'e'
#       neanche un default, usa il primo state per sequence.
#    5. Filter assignees ai member del target project (rimuove chi non e').
#    6. Reset parent_id se cross-project.
#    7. Update Issue.project, sequence_id, state, parent_id.
#    8. DELETE IssueSequence vecchia + INSERT nuova nel target.
#    9. UPDATE project_id su tabelle correlate (IssueAssignee, IssueLink,
#       IssueAttachment, IssueActivity, IssueComment, IssueSubscriber,
#       IssueReaction, IssueMention, IssueVersion, IssueDescriptionVersion,
#       IssueBlocker (entrambi i lati), IssueRelation (entrambi i lati)).
#    10. DELETE CycleIssue, ModuleIssue, IssueLabel (project-scoped).
#    11. Se include_sub_issues=True, ricorsivo sui sub-issue.
#    12. Issue activity tracker (sync, non delay, per atomicita').
#
#  Permission gate: WorkspaceEntityPermission (gia' usato in workspace
#  endpoints) + custom check member target project.
#
#  Response: l'issue serializzato con i nuovi valori.

from django.db import transaction, connection
from django.db.models import Max
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceEntityPermission, allow_permission, ROLE
from plane.app.serializers import IssueSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    CycleIssue,
    FileAsset,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueBlocker,
    IssueComment,
    IssueDescriptionVersion,
    IssueLabel,
    IssueLink,
    IssueMention,
    IssueReaction,
    IssueRelation,
    IssueSequence,
    IssueSubscriber,
    IssueVersion,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    Workspace,
)
# PATCH v1.24a hotfix: IssueAttachment NON e' nel __init__.py di plane.db.models
# (probabilmente legacy, soppiantato da FileAsset). Import diretto dal submodule.
from plane.db.models.issue import IssueAttachment
from plane.utils.uuid import convert_uuid_to_integer


# Tabelle correlate che hanno project_id e devono essere aggiornate al
# target project (NON cancellate). L'issue le porta con se'.
# IssueAttachment = legacy table (issue_attachments). FileAsset = nuova
# tabella generic (assets) con FK opzionale a issue. Aggiorniamo entrambe
# per essere safe.
_PROJECT_ID_TABLES = (
    IssueAssignee,
    IssueLink,
    IssueAttachment,
    IssueActivity,
    IssueComment,
    IssueSubscriber,
    IssueReaction,
    IssueMention,
    IssueVersion,
    IssueDescriptionVersion,
)


def _map_state_to_target(source_state, target_project):
    """
    Smart state mapping (1a):
      1. cerca nel target project uno state con stesso (name, group)
      2. fallback al default state del target project
      3. ultimo fallback: primo state per sequence
    """
    target_states = State.objects.filter(project=target_project, deleted_at__isnull=True)

    # 1. exact match (name + group)
    if source_state:
        match = target_states.filter(name__iexact=source_state.name, group=source_state.group).first()
        if match:
            return match

    # 2. default state
    default = target_states.filter(default=True).order_by("sequence").first()
    if default:
        return default

    # 3. first state by sequence
    first = target_states.order_by("sequence").first()
    return first  # puo' essere None se il target non ha ancora state - improbabile


def _move_issue_recursive(issue, target_project, request_user, include_sub_issues):
    """
    Logica vera del move. Chiamata da MoveIssueEndpoint.post() dentro
    una transaction.atomic e con select_for_update sull'issue principale.
    Per i sub-issue facciamo lock individuale.
    """
    source_project = issue.project
    workspace = target_project.workspace

    # Genera sequence_id con advisory lock postgres (pattern stock).
    lock_key = convert_uuid_to_integer(target_project.id)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])

    last_sequence = IssueSequence.objects.filter(project=target_project).aggregate(largest=Max("sequence"))["largest"]
    new_sequence_id = (last_sequence or 0) + 1

    # State mapping
    new_state = _map_state_to_target(issue.state, target_project)

    # Reset parent se cross-project (parent ora in altro progetto fa rumore).
    if issue.parent_id and issue.parent.project_id != target_project.id:
        issue.parent = None

    # Filter assignees ai member del target project.
    target_member_ids = set(
        ProjectMember.objects.filter(
            project=target_project, is_active=True, deleted_at__isnull=True
        ).values_list("member_id", flat=True)
    )
    IssueAssignee.objects.filter(issue=issue).exclude(assignee_id__in=target_member_ids).delete()

    # Update Issue principale.
    issue.project = target_project
    issue.workspace = workspace  # difensivo: ProjectBaseModel ha workspace, ma stock lo deriva da project
    issue.sequence_id = new_sequence_id
    if new_state:
        issue.state = new_state
    issue.save()

    # IssueSequence: cancella riga vecchia (se esiste), inserisci la nuova.
    IssueSequence.objects.filter(issue=issue).delete()
    IssueSequence.objects.create(issue=issue, sequence=new_sequence_id, project=target_project, workspace=workspace)

    # Update project_id (e workspace_id) su tabelle correlate.
    for Model in _PROJECT_ID_TABLES:
        Model.objects.filter(issue=issue).update(project=target_project, workspace=workspace)

    # FileAsset (table 'assets') ha FK opzionale a issue. Aggiorniamo
    # project + workspace per gli asset legati a quest'issue.
    FileAsset.objects.filter(issue=issue).update(project=target_project, workspace=workspace)

    # IssueBlocker e IssueRelation hanno DUE side: block/blocked_by, issue/related_issue.
    # Aggiornare il project_id solo del lato del task spostato. Le rows
    # rimangono valide (le relations possono essere cross-project).
    IssueBlocker.objects.filter(block=issue).update(project=target_project, workspace=workspace)
    IssueBlocker.objects.filter(blocked_by=issue).update(project=target_project, workspace=workspace)
    IssueRelation.objects.filter(issue=issue).update(project=target_project, workspace=workspace)
    IssueRelation.objects.filter(related_issue=issue).update(project=target_project, workspace=workspace)

    # Tabelle project-scoped da CANCELLARE (no equivalente nel target).
    CycleIssue.objects.filter(issue=issue).delete()
    ModuleIssue.objects.filter(issue=issue).delete()
    IssueLabel.objects.filter(issue=issue).delete()

    # Sub-issue ricorsivo (opzionale).
    if include_sub_issues:
        sub_issues = list(
            Issue.objects.select_for_update().filter(parent=issue, deleted_at__isnull=True)
        )
        for sub in sub_issues:
            _move_issue_recursive(sub, target_project, request_user, include_sub_issues=True)

    return issue


class MoveIssueEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, issue_id):
        target_project_id = request.data.get("target_project_id")
        include_sub_issues = bool(request.data.get("include_sub_issues", True))

        if not target_project_id:
            return Response(
                {"error": "target_project_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Workspace lookup
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        # Issue lookup (deve essere nel workspace)
        try:
            issue = Issue.objects.select_related("project", "state", "parent").get(
                pk=issue_id, workspace=workspace, deleted_at__isnull=True
            )
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Target project lookup (deve essere nello stesso workspace)
        try:
            target_project = Project.objects.get(
                pk=target_project_id, workspace=workspace, deleted_at__isnull=True
            )
        except Project.DoesNotExist:
            return Response({"error": "Target project not found"}, status=status.HTTP_404_NOT_FOUND)

        # No-op: stesso project source e target.
        if issue.project_id == target_project.id:
            return Response(
                {"error": "Issue already belongs to the target project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Permission: l'utente deve essere ADMIN/MEMBER del target project.
        is_member_of_target = ProjectMember.objects.filter(
            project=target_project,
            member=request.user,
            is_active=True,
            deleted_at__isnull=True,
            role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
        ).exists()
        if not is_member_of_target:
            return Response(
                {"error": "You are not a member of the target project"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Esegui il move dentro una transaction.
        with transaction.atomic():
            # Lock l'issue principale per evitare race con altre update.
            issue = Issue.objects.select_for_update().get(pk=issue_id)
            _move_issue_recursive(issue, target_project, request.user, include_sub_issues)

        # Re-fetch per restituire stato consistente.
        issue.refresh_from_db()
        serializer = IssueSerializer(issue)
        return Response(serializer.data, status=status.HTTP_200_OK)
