/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.23:
 *  Sblocca il quick-add nei contesti dove l'URL non porta projectId
 *  (workspace views, Your Work, ecc).
 *
 *  Stock: il root early-return con `if (!projectId) return null;` letto da
 *  useParams(). In workspace views o /profile/<userId>/... `projectId` e'
 *  undefined -> il pulsante quick-add non rende nulla.
 *
 *  Patch: resolvedProjectId tenta nell'ordine:
 *    1) URL params.projectId       (project context)
 *    2) prePopulatedData?.project_id (caller specifica project esplicito)
 *    3) workspaceHiddenProjectId   (workspace fittizio v1.22a, gia' nel store)
 *    4) lazy fetch via useWorkspaceProject() se non ancora nel store
 *    5) nessuna -> early return null
 *
 *  Lazy fetch idempotente: useWorkspaceProject() e' SWR-based, dedup per
 *  workspaceSlug, costo trascurabile. Lo chiamiamo sempre (rules of hooks)
 *  ma il backend GET /workspace-project/ ritorna istantaneo se gia' cached.
 */

import type { FC } from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { UseFormRegister } from "react-hook-form";
import { useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import { setPromiseToast } from "@plane/propel/toast";
import type { IProject, TIssue, EIssueLayoutTypes } from "@plane/types";
import { cn, createIssuePayload } from "@plane/utils";
// plane web imports
import { QuickAddIssueFormRoot } from "@/plane-web/components/issues/quick-add";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";
// local imports
import { CreateIssueToastActionItems } from "../../create-issue-toast-action-items";

export type TQuickAddIssueForm = {
  ref: React.RefObject<HTMLFormElement>;
  isOpen: boolean;
  projectDetail: IProject;
  hasError: boolean;
  register: UseFormRegister<TIssue>;
  onSubmit: () => void;
  isEpic: boolean;
};

export type TQuickAddIssueButton = {
  isEpic?: boolean;
  onClick: () => void;
};

type TQuickAddIssueRoot = {
  isQuickAddOpen?: boolean;
  layout: EIssueLayoutTypes;
  prePopulatedData?: Partial<TIssue>;
  QuickAddButton?: FC<TQuickAddIssueButton>;
  customQuickAddButton?: React.ReactNode;
  containerClassName?: string;
  setIsQuickAddOpen?: (isOpen: boolean) => void;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  isEpic?: boolean;
};

const defaultValues: Partial<TIssue> = {
  name: "",
};

export const QuickAddIssueRoot = observer(function QuickAddIssueRoot(props: TQuickAddIssueRoot) {
  const {
    isQuickAddOpen,
    layout,
    prePopulatedData,
    QuickAddButton,
    customQuickAddButton,
    containerClassName = "",
    setIsQuickAddOpen,
    quickAddCallback,
    isEpic = false,
  } = props;
  // i18n
  const { t } = useTranslation();
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  // PATCH v1.23: workspace project fallback. Se l'URL non ha projectId
  // (workspace views, Your Work) usiamo il workspace project fittizio.
  const { workspaceHiddenProjectId } = useProject();
  // PATCH v1.23: lazy fetch via SWR del workspace project. Idempotente,
  // dedup automatico per slug, costa nulla se gia' cached.
  useWorkspaceProject();
  // states
  const [isOpen, setIsOpen] = useState(isQuickAddOpen ?? false);
  // form info
  const {
    reset,
    handleSubmit,
    setFocus,
    register,
    formState: { errors, isSubmitting },
  } = useForm<TIssue>({ defaultValues });

  useEffect(() => {
    if (isQuickAddOpen !== undefined) {
      setIsOpen(isQuickAddOpen);
    }
  }, [isQuickAddOpen]);

  useEffect(() => {
    if (!isOpen) reset({ ...defaultValues });
  }, [isOpen, reset]);

  const handleIsOpen = (isOpen: boolean) => {
    if (isQuickAddOpen !== undefined && setIsQuickAddOpen) {
      setIsQuickAddOpen(isOpen);
    } else {
      setIsOpen(isOpen);
    }
  };

  // PATCH v1.23: resolve projectId con priorita' URL -> prePopulated -> workspace fittizio.
  const resolvedProjectId =
    projectId?.toString() || prePopulatedData?.project_id || workspaceHiddenProjectId || undefined;

  const onSubmitHandler = async (formData: TIssue) => {
    if (isSubmitting || !workspaceSlug || !resolvedProjectId) return;

    reset({ ...defaultValues });

    const payload = createIssuePayload(resolvedProjectId, {
      ...(prePopulatedData ?? {}),
      ...formData,
    });

    if (quickAddCallback) {
      const quickAddPromise = quickAddCallback(resolvedProjectId, { ...payload });
      setPromiseToast<any>(quickAddPromise, {
        loading: isEpic ? t("epic.adding") : t("issue.adding"),
        success: {
          title: t("common.success"),
          message: () => `${isEpic ? t("epic.create.success") : t("issue.create.success")}`,
          actionItems: (data) => (
            // TODO: Translate here
            <CreateIssueToastActionItems
              workspaceSlug={workspaceSlug.toString()}
              projectId={resolvedProjectId}
              issueId={data.id}
              isEpic={isEpic}
            />
          ),
        },
        error: {
          title: t("common.error.label"),
          message: (err) => err?.message || t("common.error.message"),
        },
      });

      await quickAddPromise;
    }
  };

  // PATCH v1.23: gate sul resolved id. Se nessuna fonte ha un project,
  // il pulsante quick-add non viene reso (caso edge: workspace nuovo
  // senza progetti reali e workspace project ancora non lazy-creato).
  if (!resolvedProjectId) return null;

  return (
    <div
      className={cn(
        containerClassName,
        errors && errors?.name && errors?.name?.message ? `border-danger-strong bg-danger-subtle` : ``
      )}
    >
      {isOpen ? (
        <QuickAddIssueFormRoot
          isOpen={isOpen}
          layout={layout}
          prePopulatedData={prePopulatedData}
          projectId={resolvedProjectId}
          hasError={errors && errors?.name && errors?.name?.message ? true : false}
          setFocus={setFocus}
          register={register}
          onSubmit={handleSubmit(onSubmitHandler)}
          onClose={() => handleIsOpen(false)}
          isEpic={isEpic}
        />
      ) : (
        <>
          {QuickAddButton && <QuickAddButton isEpic={isEpic} onClick={() => handleIsOpen(true)} />}
          {customQuickAddButton && <>{customQuickAddButton}</>}
          {!QuickAddButton && !customQuickAddButton && (
            <button
              className="flex w-full cursor-pointer items-center gap-2 bg-layer-transparent px-2 py-3 hover:bg-layer-transparent-hover"
              onClick={() => handleIsOpen(true)}
            >
              <PlusIcon className="h-3.5 w-3.5 stroke-2" />
              <span className="text-13 font-medium">{t(`${isEpic ? "epic.new" : "issue.new"}`)}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
});
