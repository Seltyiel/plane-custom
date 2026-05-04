/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34d:
 *  Header della Meetings page. Il pulsante "+ Create meeting" e' nel page
 *  body (non qui) cosi' lo state del modal resta locale alla page senza
 *  bisogno di context globali.
 */

import { observer } from "mobx-react";
import { Calendar } from "lucide-react";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";

export const MeetingsHeader = observer(function MeetingsHeader() {
  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Meetings"
                  icon={<Calendar className="size-4 text-secondary" />}
                />
              }
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
    </Header>
  );
});
