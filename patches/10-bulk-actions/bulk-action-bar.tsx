/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.27a:
 *  Bottom bar fixed che appare quando ci sono task selezionati. Riusa il
 *  sistema multi-select STOCK (useMultipleSelectStore + selectionHelpers),
 *  cosi' non duplichiamo lo stato di selezione.
 *
 *  Mostra: count + Archive + Delete + Clear. (state/priority/assignee in
 *  v1.27b.)
 *
 *  Backend: gli endpoint bulkArchiveIssues e bulkDeleteIssues stock sono
 *  scoped per project (URL /projects/<projectId>/bulk-...). Per workspace
 *  views gli ID selezionati possono spaziare fra piu' project: raggruppiamo
 *  e chiamiamo in parallelo.
 *
 *  Il file CE stock (IssueBulkOperationsRoot) rendeva un upgrade banner
 *  "Upgrade to Plane One"; lo sostituiamo con questa vera barra.
 */

import { useState, Fragment, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Archive, Trash2, X } from "lucide-react";
import { Dialog, Transition } from "@headlessui/react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// services
import { IssueService } from "@/services/issue/issue.service";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
// types
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

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
    issue: { getIssueById, removeIssue: removeIssueFromCache },
  } = useIssueDetail();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
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

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled) return null;
  if (!slug) return null;

  const count = selectedEntityIds.length;

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
      <div className={cn("sticky bottom-0 left-0 z-[2] grid place-items-center px-3.5 py-3", className)}>
        <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2 shadow-lg">
          <span className="text-13 font-medium text-primary">
            {count} selected
          </span>
          <span className="h-4 w-px bg-subtle" />
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
