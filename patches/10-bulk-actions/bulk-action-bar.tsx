/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.27a + v1.27b:
 *  Bottom bar fixed quando ci sono task selezionati. Riusa il sistema
 *  multi-select stock (useMultipleSelectStore + selectionHelpers).
 *
 *  Azioni:
 *    - State (v1.27b): solo se tutti i selezionati sono dello stesso
 *      project (state e' project-scoped). Disabled altrimenti.
 *    - Priority (v1.27b): enum globale, sempre attivo.
 *    - Assignee (v1.27b): member picker workspace-wide.
 *    - Move to project (v1.27b): apre BulkMoveIssueModal che chiama in
 *      loop l'endpoint v1.24 (POST /issues/<id>/move/).
 *    - Archive (v1.27a): bulkArchiveIssues stock.
 *    - Delete (v1.27a): bulkDeleteIssues stock.
 *
 *  Backend:
 *    - state/priority/assignee -> IssueService.bulkOperations(slug,
 *      projectId, {issue_ids, properties}). Group by project_id.
 *    - archive -> bulkArchiveIssues. Group by project_id.
 *    - delete -> bulkDeleteIssues. Group by project_id.
 *    - move -> IssueMoveService.moveIssue (v1.24) in loop.
 */

import { useState, Fragment, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Archive, ArrowRightLeft, Trash2, X } from "lucide-react";
import { Dialog, Transition } from "@headlessui/react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssuePriorities } from "@plane/types";
import { cn } from "@plane/utils";
// services
import { IssueService } from "@/services/issue/issue.service";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
// types
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
// dropdowns
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// PATCH v1.27b
import { BulkMoveIssueModal } from "./bulk-move-issue-modal";

const issueService = new IssueService();

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

export const BulkActionBar = observer(function BulkActionBar(props: Props) {
  const { className, selectionHelpers } = props;
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { isSelectionActive, selectedEntityIds, clearSelection } = useMultipleSelectStore();
  const {
    issue: { getIssueById, removeIssue: removeIssueFromCache, updateIssue: updateIssueInCache },
  } = useIssueDetail();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  // Raggruppa gli ID selezionati per project_id (necessario per gli endpoint
  // bulk stock che richiedono projectId nell'URL).
  const groupedByProject = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    selectedEntityIds.forEach((entityId) => {
      const issue = getIssueById(entityId);
      const projectId = issue?.project_id;
      if (!projectId) return;
      if (!grouped[projectId]) grouped[projectId] = [];
      grouped[projectId].push(entityId);
    });
    return grouped;
  }, [selectedEntityIds, getIssueById]);

  // PATCH v1.27b: Determina se tutti i selezionati sono dello stesso project.
  // Se sì, recupera il project_id (per StateDropdown). Altrimenti undefined.
  const projectIds = Object.keys(groupedByProject);
  const sameProjectId = projectIds.length === 1 ? projectIds[0] : undefined;

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled) return null;
  if (!slug) return null;

  const count = selectedEntityIds.length;

  // PATCH v1.27b hotfix: bulk update properties.
  // L'endpoint stock /bulk-operation-issues/ NON esiste in CE (e' paid in
  // Plane One -> 404 "Page not found"). Fallback: loop con patchIssue
  // (endpoint stock /projects/<projectId>/issues/<id>/) per ogni task.
  // Promise.allSettled cosi' un fallimento non blocca gli altri.
  const handleBulkUpdate = async (
    properties: Record<string, unknown>,
    successMsg: string
  ): Promise<void> => {
    setIsWorking(true);
    try {
      const tasks = selectedEntityIds.map(async (issueId) => {
        const issue = getIssueById(issueId);
        if (!issue?.project_id) return;
        return issueService.patchIssue(slug, issue.project_id, issueId, properties);
      });
      const results = await Promise.allSettled(tasks);
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      const rejected = results.length - fulfilled;

      // Aggiorna cache ottimisticamente solo per quelli andati a buon fine.
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          try {
            updateIssueInCache(selectedEntityIds[i], properties);
          } catch {
            /* best-effort */
          }
        }
      });

      if (rejected === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Updated",
          message: `${fulfilled} work item${fulfilled === 1 ? "" : "s"} ${successMsg}.`,
        });
      } else if (fulfilled === 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Update failed",
          message: `All ${rejected} update${rejected === 1 ? "" : "s"} failed.`,
        });
      } else {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Partial update",
          message: `${fulfilled} updated, ${rejected} failed.`,
        });
      }
    } catch (e) {
      const err = e as { error?: string; message?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Update failed",
        message: err?.error || err?.message || "Unknown error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleStateChange = (newStateId: string) =>
    handleBulkUpdate({ state_id: newStateId }, "moved to new state");

  const handlePriorityChange = (newPriority: TIssuePriorities) =>
    handleBulkUpdate({ priority: newPriority }, "priority updated");

  const handleAssigneesChange = (newAssigneeIds: string[]) =>
    handleBulkUpdate({ assignee_ids: newAssigneeIds }, "assignees updated");

  const handleArchive = async () => {
    setIsWorking(true);
    try {
      await Promise.all(
        Object.entries(groupedByProject).map(([projectId, issueIds]) =>
          issueService.bulkArchiveIssues(slug, projectId, { issue_ids: issueIds })
        )
      );
      selectedEntityIds.forEach((id) => {
        try {
          removeIssueFromCache(id);
        } catch {
          /* best-effort */
        }
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Archived",
        message: `${count} work item${count === 1 ? "" : "s"} archived.`,
      });
      clearSelection();
      setConfirmArchive(false);
    } catch (e) {
      const err = e as { error?: string; message?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Archive failed",
        message: err?.error || err?.message || "Unknown error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = async () => {
    setIsWorking(true);
    try {
      await Promise.all(
        Object.entries(groupedByProject).map(([projectId, issueIds]) =>
          issueService.bulkDeleteIssues(slug, projectId, { issue_ids: issueIds })
        )
      );
      selectedEntityIds.forEach((id) => {
        try {
          removeIssueFromCache(id);
        } catch {
          /* best-effort */
        }
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Deleted",
        message: `${count} work item${count === 1 ? "" : "s"} deleted.`,
      });
      clearSelection();
      setConfirmDelete(false);
    } catch (e) {
      const err = e as { error?: string; message?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Delete failed",
        message: err?.error || err?.message || "Unknown error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <>
      {/* PATCH v1.27a hotfix: z-[2] era troppo basso, i dropdown (Set state/
          priority/assignees) erano coperti dalle righe della lista. Alzato a
          z-[40] cosi' resta sopra a tutto il contenuto della view. */}
      <div className={cn("sticky bottom-0 left-0 z-[40] grid place-items-center px-3.5 py-3", className)}>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2 shadow-lg">
          <span className="text-13 font-medium text-primary">
            {count} selected
          </span>
          <span className="h-4 w-px bg-subtle" />

          {/* PATCH v1.27b: State dropdown (solo se same project) */}
          {sameProjectId ? (
            <StateDropdown
              projectId={sameProjectId}
              value={null}
              onChange={handleStateChange}
              buttonVariant="border-with-text"
              placeholder="Set state"
              disabled={isWorking}
            />
          ) : (
            <Tooltip tooltipContent="Select work items from the same project to change state">
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-sm border border-subtle px-2.5 py-1.5 text-12 text-placeholder"
              >
                Set state
              </button>
            </Tooltip>
          )}

          {/* PATCH v1.27b: Priority dropdown (sempre attivo) */}
          <PriorityDropdown
            value={null}
            onChange={handlePriorityChange}
            buttonVariant="border-with-text"
            placeholder="Set priority"
            disabled={isWorking}
          />

          {/* PATCH v1.27b: Assignee dropdown */}
          <MemberDropdown
            value={[]}
            onChange={handleAssigneesChange}
            multiple
            projectId={sameProjectId}
            buttonVariant="border-with-text"
            placeholder="Set assignees"
            disabled={isWorking}
          />

          <span className="h-4 w-px bg-subtle" />

          {/* PATCH v1.27b: Move to project */}
          <Button
            variant="neutral-primary"
            size="sm"
            prependIcon={<ArrowRightLeft className="size-3.5" />}
            onClick={() => setShowMoveModal(true)}
            disabled={isWorking}
          >
            Move
          </Button>

          <Button
            variant="neutral-primary"
            size="sm"
            prependIcon={<Archive className="size-3.5" />}
            onClick={() => setConfirmArchive(true)}
            disabled={isWorking}
          >
            Archive
          </Button>
          <Button
            variant="danger-text"
            size="sm"
            prependIcon={<Trash2 className="size-3.5" />}
            onClick={() => setConfirmDelete(true)}
            disabled={isWorking}
          >
            Delete
          </Button>

          <span className="h-4 w-px bg-subtle" />
          <button
            type="button"
            onClick={() => clearSelection()}
            disabled={isWorking}
            className="rounded-sm p-1 text-tertiary hover:bg-layer-2 hover:text-secondary disabled:opacity-50"
            aria-label="Clear selection"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* PATCH v1.27b: Bulk move modal */}
      <BulkMoveIssueModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        issueIds={selectedEntityIds}
        onAfterMove={() => clearSelection()}
      />

      {/* Delete confirmation */}
      <Transition.Root show={confirmDelete} as={Fragment}>
        <Dialog as="div" className="relative z-40" onClose={() => !isWorking && setConfirmDelete(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-sm rounded-md bg-surface-1 p-5 shadow-xl">
                <Dialog.Title className="mb-2 text-15 font-semibold text-primary">Delete work items?</Dialog.Title>
                <p className="mb-4 text-13 text-tertiary">
                  This will permanently delete {count} work item{count === 1 ? "" : "s"}. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="neutral-primary" size="md" onClick={() => setConfirmDelete(false)} disabled={isWorking}>
                    Cancel
                  </Button>
                  <Button variant="danger-primary" size="md" onClick={handleDelete} disabled={isWorking}>
                    {isWorking ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Archive confirmation */}
      <Transition.Root show={confirmArchive} as={Fragment}>
        <Dialog as="div" className="relative z-40" onClose={() => !isWorking && setConfirmArchive(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-sm rounded-md bg-surface-1 p-5 shadow-xl">
                <Dialog.Title className="mb-2 text-15 font-semibold text-primary">Archive work items?</Dialog.Title>
                <p className="mb-4 text-13 text-tertiary">
                  This will archive {count} work item{count === 1 ? "" : "s"}. You can restore them later from Archives.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="neutral-primary" size="md" onClick={() => setConfirmArchive(false)} disabled={isWorking}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="md" onClick={handleArchive} disabled={isWorking}>
                    {isWorking ? "Archiving..." : "Archive"}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
});
