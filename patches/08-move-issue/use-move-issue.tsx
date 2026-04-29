/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.24b:
 *  Hook per move issue tra progetti. Orchestra:
 *    1. Chiamata API tramite IssueMoveService.
 *    2. Cleanup ottimistico della cache (rootStore.issue.issues.removeIssue)
 *       cosi' il task sparisce dalla view corrente.
 *    3. Toast success con action item per navigare al task nel nuovo project.
 *    4. Toast error con messaggio dell'API.
 *
 *  Uso tipico:
 *    const { moveIssue, isMoving } = useMoveIssue();
 *    await moveIssue(issueId, { target_project_id, include_sub_issues });
 */

import { useContext, useState } from "react";
import { useParams, useRouter } from "next/navigation";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
// services
import { IssueMoveService } from "@/services/issue-move.service";
import type { TMoveIssuePayload } from "@/services/issue-move.service";
// store
import { StoreContext } from "@/lib/store-context";

const issueMoveService = new IssueMoveService();

export const useMoveIssue = () => {
  // router
  const { workspaceSlug } = useParams();
  const router = useRouter();
  // store: usiamo direttamente StoreContext per non dipendere da useIssues<TYPE>
  const context = useContext(StoreContext);
  // state
  const [isMoving, setIsMoving] = useState(false);

  const moveIssue = async (issueId: string, payload: TMoveIssuePayload): Promise<TIssue | undefined> => {
    if (!workspaceSlug || !context) return;
    setIsMoving(true);
    try {
      const updated = await issueMoveService.moveIssue(workspaceSlug.toString(), issueId, payload);

      // Rimuovi dalla cache globale cosi' il task sparisce dalla view
      // corrente. Quando l'utente navighera' al target project, lo store
      // del project lo riprendera' fresco dal backend.
      try {
        context.issue.issues.removeIssue(issueId);
      } catch (cleanupErr) {
        // Cleanup best-effort: non blocchiamo per errori di store.
        // eslint-disable-next-line no-console
        console.warn("[move-issue] cache cleanup failed:", cleanupErr);
      }

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Work item moved",
        message: updated?.sequence_id ? `New identifier: ${updated.sequence_id}` : "Successfully moved.",
        actionItems: updated?.project_id ? (
          <button
            type="button"
            onClick={() =>
              router.push(`/${workspaceSlug}/projects/${updated.project_id}/issues/${updated.id}`)
            }
            className="rounded-sm bg-accent-primary px-2 py-1 text-11 font-medium text-on-color"
          >
            View
          </button>
        ) : undefined,
      });

      return updated;
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed to move work item",
        message: err?.error || err?.message || "Unknown error",
      });
      throw e;
    } finally {
      setIsMoving(false);
    }
  };

  return { moveIssue, isMoving };
};
