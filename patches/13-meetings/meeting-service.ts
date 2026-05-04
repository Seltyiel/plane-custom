/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// PATCH (plane-custom) v1.34d + v1.35a-2:
//  v1.34d: service frontend per Meeting CRUD + RSVP + attendees + issue-links.
//          TypeScript types co-locate qui (evitiamo full-replacement di
//          packages/types/src/index.ts che e' un grande hub fragile).
//  v1.35a-2: aggiunti campi recurrence al payload (recurrence_rule,
//            recurrence_until, excluded_dates) + flag is_occurrence /
//            occurrence_date sul tipo IMeeting per le occorrenze virtuali
//            espansa lato backend (v1.35a-1).

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
  // v1.35a-1: flag e date settati dal backend per occorrenze virtuali
  // generate dall'espansione di un meeting con recurrence_rule.
  is_occurrence?: boolean;
  occurrence_date?: string; // YYYY-MM-DD
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
  // v1.35a-2: campi recurrence (RFC 5545 RRULE).
  recurrence_rule?: string | null;
  recurrence_until?: string | null;
  excluded_dates?: string[];
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

  // v1.35a-4: skip a single occurrence of a recurring meeting (aggiunge
  // `occurrenceDate` a excluded_dates del master).
  async skipOccurrence(
    workspaceSlug: string,
    meetingId: string,
    occurrenceDate: string // YYYY-MM-DD
  ): Promise<IMeeting> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/meetings/${meetingId}/skip-occurrence/`,
      { occurrence_date: occurrenceDate }
    )
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
