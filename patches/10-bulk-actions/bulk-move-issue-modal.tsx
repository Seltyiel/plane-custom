/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.27b:
 *  Modal "Move N work items to project". Variante bulk del MoveIssueModal
 *  v1.24c. Chiama IssueMoveService.moveIssue (endpoint v1.24a) in loop su
 *  tutti gli ID selezionati.
 *
 *  Differenze dal singolo:
 *    - prende issueIds: string[] invece di issue: TIssue
 *    - non ha sub-issue toggle (default include sub-issue per ogni issue)
 *    - dopo successo richiama callback onAfterMove (per clearSelection nel
 *      caller)
 *    - errori di un task non bloccano gli altri (Promise.allSettled)
 */

import { Fragment, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Dialog, Transition } from "@headlessui/react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import { IssueMoveService } from "@/services/issue-move.service";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
// dropdowns
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// router
import { useParams } from "next/navigation";

const issueMoveService = new IssueMoveService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  issueIds: string[];
  onAfterMove?: () => void;
};

export const BulkMoveIssueModal = observer(function BulkMoveIssueModal(props: Props) {
  const { isOpen, onClose, issueIds, onAfterMove } = props;
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();

  const { joinedProjectIds, workspaceHiddenProjectId } = useProject();
  const {
    issue: { getIssueById, removeIssue: removeIssueFromCache },
  } = useIssueDetail();

  const [targetProjectId, setTargetProjectId] = useState<string | undefined>(undefined);
  const [includeSubIssues, setIncludeSubIssues] = useState(true);
  const [isMoving, setIsMoving] = useState(false);

  // Project di partenza (set di project_id distinti dei task selezionati).
  const sourceProjectIds = useMemo(() => {
    const set = new Set<string>();
    issueIds.forEach((id) => {
      const iss = getIssueById(id);
      if (iss?.project_id) set.add(iss.project_id);
    });
    return Array.from(set);
  }, [issueIds, getIssueById]);

  // Allowed target = tutti i project meno quelli di partenza.
  // Includi workspace project se non e' tra i source.
  const allowedProjectIds = useMemo(() => {
    const ids = (joinedProjectIds ?? []).filter((id) => !sourceProjectIds.includes(id));
    if (workspaceHiddenProjectId && !sourceProjectIds.includes(workspaceHiddenProjectId)) {
      ids.push(workspaceHiddenProjectId);
    }
    return ids;
  }, [joinedProjectIds, sourceProjectIds, workspaceHiddenProjectId]);

  const handleClose = () => {
    if (isMoving) return;
    setTargetProjectId(undefined);
    setIncludeSubIssues(true);
    onClose();
  };

  const handleSubmit = async () => {
    if (!targetProjectId || !slug || issueIds.length === 0) return;
    setIsMoving(true);
    try {
      const results = await Promise.allSettled(
        issueIds.map((id) =>
          issueMoveService.moveIssue(slug, id, {
            target_project_id: targetProjectId,
            include_sub_issues: includeSubIssues,
          })
        )
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      const rejected = results.length - fulfilled;

      // Cleanup cache per quelli che hanno avuto successo
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          try {
            removeIssueFromCache(issueIds[i]);
          } catch {
            /* best-effort */
          }
        }
      });

      if (rejected === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Moved",
          message: `${fulfilled} work item${fulfilled === 1 ? "" : "s"} moved.`,
        });
      } else if (fulfilled === 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Move failed",
          message: `All ${rejected} work item${rejected === 1 ? "" : "s"} failed to move.`,
        });
      } else {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Partial move",
          message: `${fulfilled} moved, ${rejected} failed.`,
        });
      }

      if (onAfterMove) onAfterMove();
      handleClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Move failed",
        message: "Unknown error",
      });
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-surface-1 p-5 text-left shadow-xl transition-all">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="size-4 text-secondary" />
                    <Dialog.Title as="h3" className="text-15 font-semibold text-primary">
                      Move {issueIds.length} work item{issueIds.length === 1 ? "" : "s"}
                    </Dialog.Title>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isMoving}
                    className="rounded-sm p-1 text-tertiary hover:text-secondary disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <p className="mb-4 text-13 text-tertiary">
                  All selected items will get a new identifier in the target project. Each will be moved
                  independently — partial failures are reported.
                </p>

                <div className="mb-3">
                  <label className="mb-1 block text-12 font-medium text-secondary">Target project</label>
                  <ProjectDropdown
                    multiple={false}
                    value={targetProjectId ?? null}
                    onChange={(value: string) => setTargetProjectId(value)}
                    buttonVariant="border-with-text"
                    placeholder="Select target project"
                    renderCondition={(projectId) => allowedProjectIds.includes(projectId)}
                  />
                </div>

                <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-sm border border-subtle px-3 py-2 hover:bg-layer-1">
                  <input
                    type="checkbox"
                    checked={includeSubIssues}
                    onChange={(e) => setIncludeSubIssues(e.target.checked)}
                    disabled={isMoving}
                    className="size-4"
                  />
                  <span className="text-13 text-primary">Include sub-issues</span>
                </label>

                <div className="mb-4 rounded-sm border border-warning-strong/40 bg-warning-subtle/30 p-3">
                  <p className="mb-1 text-12 font-semibold text-warning-strong">Will be reset on each moved item:</p>
                  <ul className="list-disc pl-5 text-12 text-tertiary">
                    <li>Labels (project-scoped)</li>
                    <li>Cycle and modules</li>
                    <li>State (smart-mapped to target by name + group, or default)</li>
                    <li>Assignees not member of target project</li>
                    <li>Parent if it lives in another project</li>
                  </ul>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="neutral-primary" size="md" onClick={handleClose} disabled={isMoving}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleSubmit}
                    disabled={!targetProjectId || isMoving}
                    prependIcon={isMoving ? <Loader2 className="size-3 animate-spin" /> : <ArrowRightLeft className="size-3" />}
                  >
                    {isMoving ? "Moving..." : "Move"}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
});
