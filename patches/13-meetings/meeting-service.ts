/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// PATCH (plane-custom) v1.34d:
//  Service frontend per Meeting CRUD + RSVP + attendees + issue-links.
//  TypeScript types co-locate qui (evitiamo full-replacement di
//  packages/types/src/index.ts che e' un grande hub fragile).

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

// ===== TYPES =====

export type TMeetingAttendeeStatus = "invited" | "accepted" | "tentative" | "declined";

export interface IMeetingAttendee {
  id: string;
  meeting: string;
  user: string | null;
  external_email: string | null;
  display_name: string | null;
  status: TMeetingAttendeeStatus;
  rsvp_comment: string | null;
  responded_at: string | null;
  reminder_minutes_before: number | null;
  invitation_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
  reminder_inapp_sent_at: string | null;
  user_display_name: string;
  user_email: string;
  user_avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface IMeetingIssueLink {
  id: string;
  meeting: string;
  issue: string;
  issue_name: string | null;
  issue_sequence_id: number | null;
  project_identifier: string | null;
  project_id: string | null;
  created_at: string;
}

export interface IMeeting {
  id: string;
  workspace: string;
  project: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  reminder_minutes_before: number;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  excluded_dates: string[] | null;
  parent_meeting: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  attendees: IMeetingAttendee[];
  issue_links: IMeetingIssueLink[];
  creator_display_name: string | null;
  is_cancelled: boolean;
  // audit-only flag (admin con feature flag meetings_admin_audit_mode=true)
  is_audit_only?: boolean;
}

export interface IMeetingCreatePayload {
  title: string;
  description?: string;
  location?: string;
  start_at: string; // ISO-8601
  end_at: string; // ISO-8601
  all_day?: boolean;
  timezone?: string;
  reminder_minutes_before?: number;
  project?: string | null;
}

export type IMeetingUpdatePayload = Partial<IMeetingCreatePayload>;

export interface IMeetingListFilters {
  from?: string;
  to?: string;
  project_id?: string;
}

export interface IMeetingRsvpPayload {
  status: TMeetingAttendeeStatus;
  comment?: string;
}

export interface IMeetingAddAttendeePayload {
  user_id?: string;
  external_email?: string;
  display_name?: string;
}

export interface IMeetingAddIssueLinkPayload {
  issue_id: string;
}

// ===== SERVICE =====

export class MeetingService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, filters?: IMeetingListFilters): Promise<IMeeting[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/meetings/`, { params: filters || {} })
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async retrieve(workspaceSlug: string, meetingId: string): Promise<IMeeting> {
    return this.get(`/api/workspaces/${workspaceSlug}/meetings/${meetingId}/`)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async create(workspaceSlug: string, payload: IMeetingCreatePayload): Promise<IMeeting> {
    return this.post(`/api/workspaces/${workspaceSlug}/meetings/`, payload)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async update(
    workspaceSlug: string,
    meetingId: string,
    payload: IMeetingUpdatePayload
  ): Promise<IMeeting> {
    return this.patch(`/api/workspaces/${workspaceSlug}/meetings/${meetingId}/`, payload)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async cancel(workspaceSlug: string, meetingId: string, reason?: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/meetings/${meetingId}/`, {
      data: reason ? { reason } : {},
    })
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async rsvp(
    workspaceSlug: string,
    meetingId: string,
    payload: IMeetingRsvpPayload
  ): Promise<IMeetingAttendee> {
    return this.post(`/api/workspaces/${workspaceSlug}/meetings/${meetingId}/rsvp/`, payload)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async addAttendee(
    workspaceSlug: string,
    meetingId: string,
    payload: IMeetingAddAttendeePayload
  ): Promise<IMeetingAttendee> {
    return this.post(`/api/workspaces/${workspaceSlug}/meetings/${meetingId}/attendees/`, payload)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async removeAttendee(
    workspaceSlug: string,
    meetingId: string,
    attendeeId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/meetings/${meetingId}/attendees/${attendeeId}/`
    )
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async addIssueLink(
    workspaceSlug: string,
    meetingId: string,
    payload: IMeetingAddIssueLinkPayload
  ): Promise<IMeetingIssueLink> {
    return this.post(`/api/workspaces/${workspaceSlug}/meetings/${meetingId}/issue-links/`, payload)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async removeIssueLink(
    workspaceSlug: string,
    meetingId: string,
    linkId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/meetings/${meetingId}/issue-links/${linkId}/`
    )
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async issueMeetings(workspaceSlug: string, issueId: string): Promise<IMeeting[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issues/${issueId}/meetings/`)
      .then((r) => r.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }
}
