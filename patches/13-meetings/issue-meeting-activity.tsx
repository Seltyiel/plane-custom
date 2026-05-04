/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.34h-4:
 *  Render dell'activity entry per i meeting linkati al task.
 *  Pattern: replica IssueLinkActivity stock (IssueActivityBlockComponent +
 *  testo verb-aware). Verb supportati:
 *   - "created"  -> "L scheduled meeting *titolo*"
 *   - "deleted"  -> "L unlinked meeting *titolo*"
 *   - "cancelled"-> "L cancelled meeting *titolo*"
 *
 *  Click sul nome -> apre MeetingDetailModal del meeting in questione
 *  (riusa il modal v1.34d).
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Calendar } from "lucide-react";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions";
import { MeetingDetailModal } from "@/components/meetings/detail-modal";

type Props = {
  activityId: string;
  ends: "top" | "bottom" | undefined;
};

export const IssueMeetingActivity = observer(function IssueMeetingActivity(props: Props) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  // new_value = title del meeting, new_identifier = meeting.id
  const meetingTitle = activity.new_value || "(meeting)";
  const meetingId = activity.new_identifier || null;

  let verbText: string;
  switch (activity.verb) {
    case "created":
      verbText = "scheduled meeting";
      break;
    case "deleted":
      verbText = "unlinked meeting";
      break;
    case "cancelled":
      verbText = "cancelled meeting";
      break;
    default:
      verbText = `${activity.verb} meeting`;
  }

  return (
    <>
      <IssueActivityBlockComponent
        icon={<Calendar size={14} className="text-secondary" aria-hidden="true" />}
        activityId={activityId}
        ends={ends}
      >
        <>
          <span>{verbText} </span>
          {meetingId ? (
            <button
              type="button"
              onClick={() => setOpenMeetingId(meetingId)}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {meetingTitle}
            </button>
          ) : (
            <span className="font-medium text-primary">{meetingTitle}</span>
          )}
          .
        </>
      </IssueActivityBlockComponent>
      {openMeetingId && (
        <MeetingDetailModal
          meetingId={openMeetingId}
          isOpen={!!openMeetingId}
          onClose={() => setOpenMeetingId(null)}
        />
      )}
    </>
  );
});
