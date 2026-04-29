/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.27a hotfix:
 *  Stock CE ritornava `false` hardcoded perche' bulk operations e' una
 *  feature paid (Plane One). Lo riabilitiamo a `true` cosi' il checkbox
 *  multi-select compare ovunque (List, Spreadsheet, Gantt).
 */

export const useBulkOperationStatus = () => true;
