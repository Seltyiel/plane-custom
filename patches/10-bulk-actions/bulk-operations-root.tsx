/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.27a:
 *  Sostituisce il render dell'upgrade banner ("Upgrade to Plane One") con la
 *  vera <BulkActionBar/>. Stock CE (Community Edition) limita le bulk
 *  operations alla versione paid; in self-hosted custom le rendiamo native
 *  riusando il sistema di selezione gia' esistente (useMultipleSelectStore +
 *  selectionHelpers).
 */

import { observer } from "mobx-react";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
// PATCH v1.27a
import { BulkActionBar } from "@/components/issues/bulk-operations/bulk-action-bar";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

export const IssueBulkOperationsRoot = observer(function IssueBulkOperationsRoot(props: Props) {
  const { className, selectionHelpers } = props;
  // store hooks
  const { isSelectionActive } = useMultipleSelectStore();

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled) return null;

  return <BulkActionBar className={className} selectionHelpers={selectionHelpers} />;
});
