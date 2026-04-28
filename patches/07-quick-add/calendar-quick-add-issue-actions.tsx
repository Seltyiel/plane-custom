/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.23b:
 *  Sblocca il menu hover "+" sulle celle del Calendar in workspace context.
 *
 *  Stock riga 82: `if (!projectId) return null;` - in workspace views
 *  l'URL non porta projectId -> il menu hover non viene reso, e quindi
 *  l'utente non puo' creare un task cliccando su una cella del calendar.
 *
 *  Patch:
 *  - Rimosso il return null. Il QuickAddIssueRoot child gia' gestisce il
 *    fallback workspaceHiddenProjectId (patch v1.23).
 *  - Il modal "Add existing issue" (che richiede un projectId per filtrare
 *    su issue di QUEL project) resta nascosto in workspace context: il
 *    wrapper `{workspaceSlug && projectId && (...)}` gia' lo gate-a, e il
 *    menu item "Add existing" viene nascosto se !projectId.
 *  - In workspace context vedi solo "Add new" -> apre la form inline con
 *    target_date pre-popolato e project_id = workspace project.
 */

import { useState } from "react";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";

import { useTranslation } from "@plane/i18n";
// plane imports
import { PlusIcon } from "@plane/propel/icons";
import { setPromiseToast } from "@plane/propel/toast";
import type { ISearchIssueResponse, TIssue } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { QuickAddIssueRoot } from "../quick-add";

type TCalendarQuickAddIssueActions = {
  prePopulatedData?: Partial<TIssue>;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  addIssuesToView?: (issueIds: string[]) => Promise<any>;
  onOpen?: () => void;
  isEpic?: boolean;
};

export const CalendarQuickAddIssueActions = observer(function CalendarQuickAddIssueActions(
  props: TCalendarQuickAddIssueActions
) {
  const { prePopulatedData, quickAddCallback, addIssuesToView, onOpen, isEpic = false } = props;
  const { t } = useTranslation();
  // router
  const { workspaceSlug, projectId, moduleId } = useParams();
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExistingIssueModalOpen, setIsExistingIssueModalOpen] = useState(false);
  const { updateIssue } = useIssueDetail();
  // derived values
  const ExistingIssuesListModalPayload = addIssuesToView
    ? moduleId
      ? { module: moduleId.toString(), target_date: "none" }
      : { cycle: true, target_date: "none" }
    : { target_date: "none" };

  const handleAddIssuesToView = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId) return;

    const issueIds = data.map((i) => i.id);
    const addExistingIssuesPromise = Promise.all(
      data.map((issue) => updateIssue(workspaceSlug.toString(), projectId.toString(), issue.id, prePopulatedData ?? {}))
    ).then(() => addIssuesToView?.(issueIds));

    setPromiseToast(addExistingIssuesPromise, {
      loading: t("issue.adding", { count: issueIds.length }),
      success: {
        title: t("toast.success"),
        message: () => t("entity.add.success", { entity: t("issue.label", { count: 2 }) }),
      },
      error: {
        title: t("toast.error"),
        message: (err) => err?.message || t("common.errors.default.message"),
      },
    });
  };

  const handleNewIssue = () => {
    setIsOpen(true);
    if (onOpen) onOpen();
  };
  const handleExistingIssue = () => {
    setIsExistingIssueModalOpen(true);
  };

  // PATCH v1.23b: rimosso `if (!projectId) return null` cosi' il menu
  // hover compare anche in workspace context. Il QuickAddIssueRoot child
  // gia' risolve workspaceHiddenProjectId (v1.23).

  return (
    <>
      {workspaceSlug && projectId && (
        <ExistingIssuesListModal
          workspaceSlug={workspaceSlug.toString()}
          projectId={projectId.toString()}
          isOpen={isExistingIssueModalOpen}
          handleClose={() => setIsExistingIssueModalOpen(false)}
          searchParams={ExistingIssuesListModalPayload}
          handleOnSubmit={handleAddIssuesToView}
          shouldHideIssue={(issue) => {
            if (issue.start_date && prePopulatedData?.target_date) {
              const issueStartDate = new Date(issue.start_date);
              const targetDate = new Date(prePopulatedData.target_date);
              const diffInDays = differenceInCalendarDays(targetDate, issueStartDate);
              if (diffInDays < 0) return true;
            }
            return false;
          }}
        />
      )}
      <QuickAddIssueRoot
        isQuickAddOpen={isOpen}
        setIsQuickAddOpen={(isOpen) => setIsOpen(isOpen)}
        layout={EIssueLayoutTypes.CALENDAR}
        prePopulatedData={prePopulatedData}
        quickAddCallback={quickAddCallback}
        customQuickAddButton={
          <div
            className={cn(
              "overflow-hidden rounded-sm bg-layer-transparent hover:bg-layer-transparent-hover md:opacity-0 md:group-hover:opacity-100",
              {
                block: isMenuOpen,
              }
            )}
          >
            <CustomMenu
              placement="bottom-start"
              menuButtonOnClick={() => setIsMenuOpen(true)}
              onMenuClose={() => setIsMenuOpen(false)}
              className="w-full"
              customButtonClassName="w-full"
              customButton={
                <div className="flex w-full items-center gap-x-[6px] rounded-md px-2 py-1.5 text-tertiary hover:text-tertiary">
                  <PlusIcon className="h-3.5 w-3.5 flex-shrink-0 stroke-2" />
                  <span className="flex-shrink-0 text-13 font-medium">
                    {isEpic ? t("epic.add.label") : t("issue.add.label")}
                  </span>
                </div>
              }
            >
              <CustomMenu.MenuItem onClick={handleNewIssue}>
                {isEpic ? t("epic.add.label") : t("issue.add.label")}
              </CustomMenu.MenuItem>
              {/* PATCH v1.23b: "Add existing" richiede projectId per filtrare
                  la lista degli issue. In workspace context lo nascondiamo. */}
              {!isEpic && projectId && (
                <CustomMenu.MenuItem onClick={handleExistingIssue}>{t("issue.add.existing")}</CustomMenu.MenuItem>
              )}
            </CustomMenu>
          </div>
        }
        isEpic={isEpic}
      />
    </>
  );
});
