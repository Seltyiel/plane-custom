/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  IIssueFilterOptions,
  ILayoutDisplayFiltersOptions,
  TIssueActivityComment,
  TWorkItemFilterProperty,
} from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import type { TIssueFilterPriorityObject } from "./common";
import { ISSUE_DISPLAY_PROPERTIES_KEYS, SUB_ISSUES_DISPLAY_PROPERTIES_KEYS } from "./common";

import type { TIssueLayout } from "./layout";

export type TIssueFilterKeys = "priority" | "state" | "labels";

export enum EServerGroupByToFilterOptions {
  "state_id" = "state",
  "priority" = "priority",
  "labels__id" = "labels",
  "state__group" = "state_group",
  "assignees__id" = "assignees",
  "cycle_id" = "cycle",
  "issue_module__module_id" = "module",
  "target_date" = "target_date",
  "project_id" = "project",
  "created_by" = "created_by",
}

export enum EIssueFilterType {
  FILTERS = "rich_filters",
  DISPLAY_FILTERS = "display_filters",
  DISPLAY_PROPERTIES = "display_properties",
  KANBAN_FILTERS = "kanban_filters",
}

export type TSupportedFilterTypeForUpdate =
  | EIssueFilterType.DISPLAY_FILTERS
  | EIssueFilterType.DISPLAY_PROPERTIES
  | EIssueFilterType.KANBAN_FILTERS;

export const ISSUE_DISPLAY_FILTERS_BY_LAYOUT: {
  [key in TIssueLayout]: Record<"filters", TIssueFilterKeys[]>;
} = {
  list: {
    filters: ["priority", "state", "labels"],
  },
  kanban: {
    filters: ["priority", "state", "labels"],
  },
  calendar: {
    filters: ["priority", "state", "labels"],
  },
  spreadsheet: {
    filters: ["priority", "state", "labels"],
  },
  gantt: {
    filters: ["priority", "state", "labels"],
  },
};

export const ISSUE_PRIORITY_FILTERS: TIssueFilterPriorityObject[] = [
  {
    key: "urgent",
    titleTranslationKey: "issue.priority.urgent",
    className: "bg-layer-2 text-priority-urgent border-strong",
    icon: "error",
  },
  {
    key: "high",
    titleTranslationKey: "issue.priority.high",
    className: "bg-layer-2 text-priority-high border-strong",
    icon: "signal_cellular_alt",
  },
  {
    key: "medium",
    titleTranslationKey: "issue.priority.medium",
    className: "bg-layer-2 text-priority-medium border-strong",
    icon: "signal_cellular_alt_2_bar",
  },
  {
    key: "low",
    titleTranslationKey: "issue.priority.low",
    className: "bg-layer-2 text-priority-low border-strong",
    icon: "signal_cellular_alt_1_bar",
  },
  {
    key: "none",
    titleTranslationKey: "common.none",
    className: "bg-layer-2 text-priority-none border-strong",
    icon: "block",
  },
];

export type TFiltersLayoutOptions = {
  [layoutType: string]: ILayoutDisplayFiltersOptions;
};

export type TFilterPropertiesByPageType = {
  filters: TWorkItemFilterProperty[];
  layoutOptions: TFiltersLayoutOptions;
};

export type TIssueFiltersToDisplayByPageType = {
  [pageType: string]: TFilterPropertiesByPageType;
};

export const ISSUE_DISPLAY_FILTERS_BY_PAGE: TIssueFiltersToDisplayByPageType = {
  profile_issues: {
    // PATCH v1.17 - FULL FILTER PARITY con `issues` (project scope).
    // Profile scope (Your Work) filtra gia' per assignee=currentUser; quindi
    // filtro assignee_id e group_by "assignees" sono ridondanti e esclusi.
    // Tutto il resto e' clonato da `issues`.
    //
    // NOTA su group_by "cycle" / "module":
    //   getCycleColumns/getModuleColumns in layouts-utils.tsx dipendono da
    //   store.projectRoot.project.currentProjectDetails -> a scope workspace
    //   ritornano undefined e la view resta vuota. Per evitare UX rotta li
    //   teniamo fuori finche' non saranno supportati workspace-wide
    //   (pianificato v1.20 insieme a workspace-level states).
    //
    // NOTA su state_id filter: a scope workspace gli UUID di stato sono
    //   project-scoped; la parity e' esposta ma avra' senso pieno dopo v1.20.
    filters: [
      "priority",
      "state_group",
      "state_id",
      "cycle_id",
      "module_id",
      "mention_id",
      "created_by_id",
      "subscriber_id",
      "label_id",
      "start_date",
      "target_date",
    ],
    layoutOptions: {
      list: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          // PATCH v1.17 - parity con issues.list.group_by, meno "assignees"
          // (profile e' gia' self-filtered) e meno "cycle"/"module" (vedi nota
          // in testa al blocco profile_issues).
          group_by: [
            "state",
            "state_detail.group",
            "priority",
            "project",
            "labels",
            "created_by",
            null,
          ],
          // PATCH v1.17 - aggiunto "target_date" per parita' con issues.list.
          order_by: [
            "sort_order",
            "-created_at",
            "-updated_at",
            "start_date",
            "-priority",
            "target_date",
          ],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["show_empty_groups", "sub_issue"],
        },
      },
      kanban: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          // PATCH v1.17 - parity con issues.kanban.group_by / sub_group_by,
          // meno "assignees" e "cycle"/"module" (vedi nota).
          group_by: [
            "state",
            "state_detail.group",
            "priority",
            "project",
            "labels",
            "created_by",
          ],
          sub_group_by: [
            "state",
            "state_detail.group",
            "priority",
            "project",
            "labels",
            "created_by",
            null,
          ],
          order_by: [
            "sort_order",
            "-created_at",
            "-updated_at",
            "start_date",
            "-priority",
            "target_date",
          ],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          // PATCH v1.17 - aggiunto "sub_issue" per parita'.
          values: ["show_empty_groups", "sub_issue"],
        },
      },
      calendar: {
        display_properties: ["key", "issue_type"],
        display_filters: {
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
      spreadsheet: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
      gantt_chart: {
        display_properties: ["key", "issue_type"],
        display_filters: {
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
    },
  },
  archived_issues: {
    filters: [
      "priority",
      "state_group",
      "state_id",
      "cycle_id",
      "module_id",
      "assignee_id",
      "created_by_id",
      "label_id",
      "start_date",
      "target_date",
    ],
    layoutOptions: {
      list: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          group_by: ["state", "cycle", "module", "priority", "labels", "assignees", "created_by", null],
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["show_empty_groups"],
        },
      },
    },
  },
  my_issues: {
    // PATCH v1.17 - FULL FILTER PARITY con `issues` (project scope).
    // Stock my_issues esponeva solo 9 filtri e no group_by/order_by utili
    // sui layout list/kanban/spreadsheet. Ciro vuole esattamente gli stessi
    // filtri e le stesse opzioni di display che vede in project views.
    //
    // Filters:
    //   + state_id      (parity; UUID project-scoped finche' v1.20 non
    //                    introduce workspace-level states)
    //   + mention_id    (parity)
    //   + cycle_id      (parity, gia' aggiunto in passata precedente)
    //   + module_id     (parity)
    //   = subscriber_id, project_id restano (utili workspace-wide)
    //
    // Group_by (list/kanban):
    //   + state           (workspace-level supportato da getStateColumns via
    //                      layouts-utils v1.07 -> workspaceStates)
    //   + assignees       (workspace-level supportato, v1.07)
    //   + created_by      (workspace-level supportato, v1.07)
    //
    // Group_by NON aggiunto per ora: "cycle", "module".
    //   getCycleColumns/getModuleColumns in layouts-utils.tsx dipendono da
    //   store.projectRoot.project.currentProjectDetails -> a scope workspace
    //   ritornano undefined e la lista resta vuota. Verranno abilitati quando
    //   introdurremo workspace-level cycles/modules (tracker future).
    //
    // Order_by list/kanban: aggiunto "target_date" per parity con issues.
    //
    // Kanban extra_options: aggiunto "sub_issue" per parity.
    filters: [
      "priority",
      "state_group",
      "state_id",
      "cycle_id",
      "module_id",
      "assignee_id",
      "mention_id",
      "created_by_id",
      "subscriber_id",
      "label_id",
      "project_id",
      "start_date",
      "target_date",
    ],
    layoutOptions: {
      spreadsheet: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          // PATCH v1.17 - stock era []; parity con `issues.spreadsheet.order_by`.
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
      list: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          // PATCH v1.17 - parity con issues.list.group_by (meno cycle/module).
          group_by: [
            "state",
            "state_detail.group",
            "priority",
            "project",
            "labels",
            "assignees",
            "created_by",
            null,
          ],
          order_by: [
            "sort_order",
            "-created_at",
            "-updated_at",
            "start_date",
            "-priority",
            "target_date",
          ],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["show_empty_groups", "sub_issue"],
        },
      },
      kanban: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          // PATCH v1.17 - parity con issues.kanban.group_by / sub_group_by.
          group_by: [
            "state",
            "state_detail.group",
            "priority",
            "project",
            "labels",
            "assignees",
            "created_by",
          ],
          sub_group_by: [
            "state",
            "state_detail.group",
            "priority",
            "project",
            "labels",
            "assignees",
            "created_by",
            null,
          ],
          order_by: [
            "sort_order",
            "-created_at",
            "-updated_at",
            "start_date",
            "-priority",
            "target_date",
          ],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          // PATCH v1.17 - aggiunto "sub_issue" per parita' con issues.kanban.
          values: ["show_empty_groups", "sub_issue"],
        },
      },
      calendar: {
        display_properties: ["key", "issue_type"],
        display_filters: {
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
      gantt_chart: {
        display_properties: ["key", "issue_type"],
        display_filters: {
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
    },
  },
  issues: {
    filters: [
      "priority",
      "state_group",
      "state_id",
      "cycle_id",
      "module_id",
      "assignee_id",
      "mention_id",
      "created_by_id",
      "label_id",
      "start_date",
      "target_date",
    ],
    layoutOptions: {
      list: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          group_by: ["state", "priority", "cycle", "module", "labels", "assignees", "created_by", null],
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority", "target_date"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["show_empty_groups", "sub_issue"],
        },
      },
      kanban: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          group_by: ["state", "priority", "cycle", "module", "labels", "assignees", "created_by"],
          sub_group_by: ["state", "priority", "cycle", "module", "labels", "assignees", "created_by", null],
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority", "target_date"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["show_empty_groups", "sub_issue"],
        },
      },
      calendar: {
        display_properties: ["key", "issue_type"],
        display_filters: {
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
      spreadsheet: {
        display_properties: ISSUE_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
      gantt_chart: {
        display_properties: ["key", "issue_type"],
        display_filters: {
          order_by: ["sort_order", "-created_at", "-updated_at", "start_date", "-priority"],
          type: ["active", "backlog"],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
    },
  },
  sub_work_items: {
    filters: ["priority", "state_id", "assignee_id", "start_date", "target_date"],
    layoutOptions: {
      list: {
        display_properties: SUB_ISSUES_DISPLAY_PROPERTIES_KEYS,
        display_filters: {
          order_by: ["-created_at", "-updated_at", "start_date", "-priority"],
          group_by: ["state", "priority", "assignees", null],
        },
        extra_options: {
          access: true,
          values: ["sub_issue"],
        },
      },
    },
  },
};

export const ISSUE_STORE_TO_FILTERS_MAP: Partial<Record<EIssuesStoreType, TFilterPropertiesByPageType>> = {
  [EIssuesStoreType.PROJECT]: ISSUE_DISPLAY_FILTERS_BY_PAGE.issues,
};

export const SUB_WORK_ITEM_AVAILABLE_FILTERS_FOR_WORK_ITEM_PAGE: (keyof IIssueFilterOptions)[] = [
  "priority",
  "state",
  "issue_type",
  "assignees",
  "start_date",
  "target_date",
];

export enum EActivityFilterType {
  ACTIVITY = "ACTIVITY",
  COMMENT = "COMMENT",
  STATE = "STATE",
  ASSIGNEE = "ASSIGNEE",
  DEFAULT = "DEFAULT",
}

export type TActivityFilters = EActivityFilterType;

export type TActivityFilterOptionsKey = Exclude<TActivityFilters, EActivityFilterType.DEFAULT>;

export const ACTIVITY_FILTER_TYPE_OPTIONS: Record<TActivityFilterOptionsKey, { labelTranslationKey: string }> = {
  [EActivityFilterType.ACTIVITY]: {
    labelTranslationKey: "common.updates",
  },
  [EActivityFilterType.COMMENT]: {
    labelTranslationKey: "common.comments",
  },
  [EActivityFilterType.STATE]: {
    labelTranslationKey: "common.state",
  },
  [EActivityFilterType.ASSIGNEE]: {
    labelTranslationKey: "common.assignee",
  },
};

export type TActivityFilterOption = {
  key: TActivityFilters;
  labelTranslationKey: string;
  isSelected: boolean;
  onClick: () => void;
};

export const defaultActivityFilters: TActivityFilters[] = [
  EActivityFilterType.ACTIVITY,
  EActivityFilterType.COMMENT,
  EActivityFilterType.STATE,
  EActivityFilterType.ASSIGNEE,
];

export const filterActivityOnSelectedFilters = (
  activity: TIssueActivityComment[],
  filters: TActivityFilters[]
): TIssueActivityComment[] =>
  activity.filter((activity) => {
    if (activity.activity_type === EActivityFilterType.DEFAULT) return true;
    return filters.includes(activity.activity_type as TActivityFilters);
  });

export const ENABLE_ISSUE_DEPENDENCIES = false;

export const BASE_ACTIVITY_FILTER_TYPES = [
  EActivityFilterType.ACTIVITY,
  EActivityFilterType.STATE,
  EActivityFilterType.ASSIGNEE,
  EActivityFilterType.DEFAULT,
];
