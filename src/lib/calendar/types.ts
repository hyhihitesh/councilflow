export type CalendarProvider = "google" | "outlook";

export type CalendarEventCreateInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  attendees?: string[];
  timeZone?: string;
};

export type CalendarEventReadResult = {
  provider: CalendarProvider;
  externalEventId: string;
  status: "confirmed" | "tentative" | "cancelled" | "unknown";
  title: string | null;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  payload: Record<string, unknown>;
};

export type CalendarEventLinkRecord = {
  id: string;
  prospect_id: string;
  provider: CalendarProvider;
  external_event_id: string;
  status: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  meeting_url: string | null;
  payload: Record<string, unknown>;
  synced_at: string;
};

export type CalendarServiceCreateResult = {
  provider: CalendarProvider;
  externalEventId: string;
  status: "confirmed" | "tentative" | "cancelled" | "unknown";
  title: string | null;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  payload: Record<string, unknown>;
};

export type CalendarServiceGetResult = CalendarServiceCreateResult;

export type CalendarErrorCode =
  | "oauth_reauth_required"
  | "calendar_provider_unavailable"
  | "calendar_request_invalid"
  | "calendar_provider_rate_limited"
  | "calendar_provider_transient_failure"
  | "calendar_unknown_failure";

export class CalendarSyncError extends Error {
  code: CalendarErrorCode;
  status: number;
  reauthRequired: boolean;

  constructor(
    code: CalendarErrorCode,
    message: string,
    options?: {
      status?: number;
      reauthRequired?: boolean;
    },
  ) {
    super(message);
    this.name = "CalendarSyncError";
    this.code = code;
    this.status = options?.status ?? 500;
    this.reauthRequired = options?.reauthRequired ?? false;
  }
}
