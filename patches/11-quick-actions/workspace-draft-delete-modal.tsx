/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.31b - latent permission bug.
 *
 * Stock chiama:
 *   canPerformProjectAdminActions =
 *     allowPermissions([ADMIN], EUserPermissionsLevel.PROJECT)
 * Ma i workspace draft sono workspace-level (non hanno projectId), quindi
 * la helper non puo' risolvere il level e ritorna SEMPRE false.
 * Risultato: nessun admin di workspace puo' cancellare un draft creato
 * da un altro utente. Solo il creatore puo' farlo. Questo e' contrario
 * al naming "ProjectAdminActions" e all'intent dell'autore (vedi "Only
 * admin or creator can delete the work item" nell'errore backend).
 *
 * FIX: uso EUserPermissionsLevel.WORKSPACE per il check admin (che e'
 * coerente con il fatto che i drafts vivono al livello workspace).
 * Il backend gia' applica lo stesso vincolo lato server, qui aggiusto
 * solo il check client-side che disabilitava il delete per gli admin.
 */

import { useEffect, useState } from "react";
// types
import { PROJECT_ERROR_MESSAGES, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkspaceDraftIssue } from "@plane/types";
// ui
import { AlertModalCore } from "@plane/ui";
// constants
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useUser, useUserPermissions } from "@/hooks/store/user";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  dataId?: string | null | undefined;
  data?: TWorkspaceDraftIssue;
  onSubmit?: () => Promise<void>;
};

export function WorkspaceDraftIssueDeleteIssueModal(props: Props) {
  const { dataId, data, isOpen, handleClose, onSubmit } = props;
  // states
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const { issueMap } = useIssues();
  const { allowPermissions } = useUserPermissions();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();

  // derived values
  // PATCH v1.31b: WORKSPACE level - i draft sono workspace-level. Stock
  // usava PROJECT che non si risolve mai in workspace context -> sempre
  // false -> admin non poteva cancellare draft di altri.
  const canPerformWorkspaceAdminActions = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.WORKSPACE
  );

  useEffect(() => {
    setIsDeleting(false);
  }, [isOpen]);

  if (!dataId && !data) return null;

  // derived values
  const issue = data ? data : issueMap[dataId!];
  const isIssueCreator = issue?.created_by === currentUser?.id;
  const authorized = isIssueCreator || canPerformWorkspaceAdminActions;

  const onClose = () => {
    setIsDeleting(false);
    handleClose();
  };

  const handleIssueDelete = async () => {
    setIsDeleting(true);

    if (!authorized) {
      setToast({
        title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
        type: TOAST_TYPE.ERROR,
        message:
          PROJECT_ERROR_MESSAGES.permissionError.i18n_message && t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message),
      });
      onClose();
      return;
    }
    if (onSubmit)
      await onSubmit()
        .then(() => {
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: `${t("success")}!`,
            message: t("workspace_draft_issues.toasts.deleted.success"),
          });
          onClose();
        })
        .catch((errors) => {
          const isPermissionError = errors?.error === "Only admin or creator can delete the work item";
          const currentError = isPermissionError
            ? PROJECT_ERROR_MESSAGES.permissionError
            : PROJECT_ERROR_MESSAGES.issueDeleteError;
          setToast({
            title: t(currentError.i18n_title),
            type: TOAST_TYPE.ERROR,
            message: currentError.i18n_message && t(currentError.i18n_message),
          });
        })
        .finally(() => onClose());
  };

  return (
    <AlertModalCore
      handleClose={onClose}
      handleSubmit={handleIssueDelete}
      isSubmitting={isDeleting}
      isOpen={isOpen}
      title={t("workspace_draft_issues.delete_modal.title")}
      content={<>{t("workspace_draft_issues.delete_modal.description")}</>}
      primaryButtonText={{
        loading: t("deleting"),
        default: t("delete"),
      }}
      secondaryButtonText={t("cancel")}
    />
  );
}
