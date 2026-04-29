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

      // PATCH v1.24b hotfix3: ORDINE CRITICO.
      // removeIssueFromList(id) internamente fa:
      //   const issue = rootIssueStore.issues.getIssueById(id);
      //   updateIssueList(undefined, issue, DELETE);
      // Cioe' RICAVA l'issue dall'issueMap globale prima di toglierlo dai
      // grouped lists. Se rimuoviamo prima dall'issueMap globale, il
      // lookup ritorna undefined e updateIssueList non fa nulla -> riga
      // fantasma che resta finche' non si fa refresh.
      // Fix: PRIMA rimuovo dai grouped lists (mentre l'issue e' ancora in
      // cache), POI dall'issueMap globale.
      const candidateStores = [
        context.issue.workspaceIssues,
        context.issue.profileIssues,
        context.issue.projectIssues,
        context.issue.cycleIssues,
        context.issue.moduleIssues,
        context.issue.projectViewIssues,
        context.issue.archivedIssues,
        context.issue.projectEpics,
      ];
      candidateStores.forEach((store) => {
        try {
          (store as { removeIssueFromList?: (id: string) => void })?.removeIssueFromList?.(issueId);
        } catch {
          /* best-effort */
        }
      });

      // Ora rimuovi dalla cache globale.
      try {
        context.issue.issues.removeIssue(issueId);
      } catch (cleanupErr) {
        // eslint-disable-next-line no-console
        console.warn("[move-issue] cache cleanup failed:", cleanupErr);
      }

      // PATCH v1.24b hotfix2: chiudi il peek-overview se aperto sul task
      // appena spostato. Senza questo, il pannello peek resta aperto su un
      // issueId che non esiste piu' nella cache -> rendering vuoto.
      try {
        const issueDetail = context.issue.issueDetail as
          | { peekIssue?: { issueId?: string }; setPeekIssue?: (val: undefined) => void }
          | undefined;
        if (issueDetail?.peekIssue?.issueId === issueId) {
          issueDetail.setPeekIssue?.(undefined);
        }
      } catch {
        /* best-effort */
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
