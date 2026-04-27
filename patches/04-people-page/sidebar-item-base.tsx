/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.19:
 *  Aggiunta "people" alla lista staticItems.
 *
 *  Senza questa patch SidebarItemBase ritornava null per la voce People:
 *    - "people" non era nella lista staticItems hardcodata
 *    - isWorkspaceItemPinned("people") ritorna false perche' e' una chiave
 *      nuova che nessun utente ha mai pinnato (le preferences sidebar sono
 *      persistite server-side per utente)
 *  -> il gate `if (!isPinned && !staticItems.includes(item.key)) return null`
 *     filtrava via la voce.
 *
 *  Aggiungendo "people" a staticItems la voce e' sempre visibile per chi ha
 *  i permessi (ADMIN e MEMBER, come definito in constants-workspace.ts).
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
// plane imports
import type { IWorkspaceSidebarNavigationItem } from "@plane/constants";
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { joinUrlPath } from "@plane/utils";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane web imports
import { getSidebarNavigationItemIcon } from "@/plane-web/components/workspace/sidebar/helper";

type Props = {
  item: IWorkspaceSidebarNavigationItem;
  additionalRender?: (itemKey: string, workspaceSlug: string) => ReactNode;
  additionalStaticItems?: string[];
};

export const SidebarItemBase = observer(function SidebarItemBase({
  item,
  additionalRender,
  additionalStaticItems,
}: Props) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { workspaceSlug } = useParams();
  const { allowPermissions } = useUserPermissions();
  const { isWorkspaceItemPinned } = useWorkspaceNavigationPreferences();
  const { data } = useUser();

  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();

  const handleLinkClick = () => {
    if (window.innerWidth < 768) toggleSidebar();
    if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
  };

  const staticItems = [
    "home",
    "pi_chat",
    "projects",
    "your_work",
    "stickies",
    "drafts",
    // plane-custom v1.19: People page sempre visibile (per chi ha i permessi)
    "people",
    ...(additionalStaticItems || []),
  ];
  const slug = workspaceSlug?.toString() || "";

  if (!allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, slug)) return null;

  const isPinned = isWorkspaceItemPinned(item.key);
  if (!isPinned && !staticItems.includes(item.key)) return null;

  const itemHref =
    item.key === "your_work" && data?.id ? joinUrlPath(slug, item.href, data?.id) : joinUrlPath(slug, item.href);
  const icon = getSidebarNavigationItemIcon(item.key);

  return (
    <Link href={itemHref} onClick={handleLinkClick}>
      <SidebarNavItem isActive={item.highlight(pathname, itemHref)}>
        <div className="flex items-center gap-1.5 py-[1px]">
          {icon}
          <p className="text-13 leading-5 font-medium">{t(item.labelTranslationKey)}</p>
        </div>
        {additionalRender?.(item.key, slug)}
      </SidebarNavItem>
    </Link>
  );
});
