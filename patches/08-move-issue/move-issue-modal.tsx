/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.24c:
 *  Modal "Move work item to project". Mostra:
 *    - project picker (escluso il current; il workspace fittizio rimane
 *      visibile perche' utile per spostarci task accidentalmente nei
 *      progetti reali quando il caller lo richiede)
 *    - toggle "Include sub-issues" (default ON, count se calcolabile)
 *    - preview testuale dei campi che verranno resettati lato backend
 *    - pulsanti Cancel / Move
 *  Al submit: chiama useMoveIssue().moveIssue.
 */

import { Fragment, useState, useMemo } from "react";
import { observer } from "mobx-react";
import { Dialog, Transition } from "@headlessui/react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { TIssue } from "@plane/types";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useMoveIssue } from "@/hooks/use-move-issue";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  issue: TIssue;
};

export const MoveIssueModal = observer(function MoveIssueModal(props: Props) {
  const { isOpen, onClose, issue } = props;
  // store
  // PATCH v1.25a: workspaceHiddenProjectId per includerlo come opzione target.
  const { joinedProjectIds, getProjectById, workspaceHiddenProjectId } = useProject();
  // state
  const [targetProjectId, setTargetProjectId] = useState<string | undefined>(undefined);
  const [includeSubIssues, setIncludeSubIssues] = useState(true);
  // hook
  const { moveIssue, isMoving } = useMoveIssue();
  // derived
  const sourceProject = issue.project_id ? getProjectById(issue.project_id) : undefined;
  const sourceProjectName = sourceProject?.name ?? "current project";
  // PATCH v1.25a: include il workspace project (fittizio, is_hidden=true)
  // come opzione target. Stock joinedProjectIds lo filtra (v1.22b) quindi
  // dobbiamo concatenarlo manualmente. Sempre escluso il current project.
  const allowedProjectIds = useMemo(() => {
    const ids = (joinedProjectIds ?? []).filter((id) => id !== issue.project_id);
    if (workspaceHiddenProjectId && workspaceHiddenProjectId !== issue.project_id) {
      ids.push(workspaceHiddenProjectId);
    }
    return ids;
  }, [joinedProjectIds, issue.project_id, workspaceHiddenProjectId]);
  // Conta sub-issue se disponibili nei dati issue
  const subIssueCount: number | undefined =
    typeof issue?.sub_issues_count === "number" ? issue.sub_issues_count : undefined;

  const handleClose = () => {
    if (isMoving) return;
    setTargetProjectId(undefined);
    setIncludeSubIssues(true);
    onClose();
  };

  const handleSubmit = async () => {
    if (!targetProjectId || !issue.id) return;
    try {
      await moveIssue(issue.id, {
        target_project_id: targetProjectId,
        include_sub_issues: includeSubIssues,
      });
      handleClose();
    } catch {
      // gia' gestito dal toast del hook
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={handleClose}>
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

        <div className="fixed inset-0 z-20 overflow-y-auto">
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
                      Move work item
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
                  Moving from <span className="font-medium text-secondary">{sourceProjectName}</span>. The work item
                  will get a new identifier in the target project.
                </p>

                {/* Target project picker */}
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

                {/* Include sub-issues toggle */}
                {subIssueCount !== undefined && subIssueCount > 0 && (
                  <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-sm border border-subtle px-3 py-2 hover:bg-layer-1">
                    <input
                      type="checkbox"
                      checked={includeSubIssues}
                      onChange={(e) => setIncludeSubIssues(e.target.checked)}
                      disabled={isMoving}
                      className="size-4"
                    />
                    <span className="text-13 text-primary">
                      Include {subIssueCount} sub-issue{subIssueCount === 1 ? "" : "s"}
                    </span>
                  </label>
                )}

                {/* Preview di cosa verra' resettato */}
                <div className="mb-4 rounded-sm border border-warning-strong/40 bg-warning-subtle/30 p-3">
                  <p className="mb-1 text-12 font-semibold text-warning-strong">Will be reset on the moved item:</p>
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
