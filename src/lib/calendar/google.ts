import { fetchWithTimeout } from "@/lib/research/http";

import {
  CalendarSyncError,
  type CalendarEventCreateInput,
  type CalendarServiceCreateResult,
  type CalendarServiceGetResult,
} from "@/lib/calendar/types";

function getCalendarTimeoutMs() {
  return Math.max(1000, Number(process.env.GOOGLE_CALENDAR_TIMEOUT_MS ?? "12000"));
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_DEFAULT_ID ?? "primary";
}

function toGoogleDateTime(value: string) {
  return {
    dateTime: value,
    timeZone: "UTC",
  };
}

async function parseProviderErrorBody(response: Response) {
  const raw = await response.text();
  if (!raw) return "";

  try {
    const json = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
    };

    if (json.error?.message) return json.error.message;
    if (json.message) return json.message;
  } catch {
    return raw.slice(0, 240);
  }

  return raw.slice(0, 240);
}

function mapGoogleCalendarError(status: number, detail: string) {
  const suffix = detail ? `: ${detail.slice(0, 180)}` : "";

  if (status === 401 || status === 403) {
    return new CalendarSyncError(
      "oauth_reauth_required",
      "Google Calendar authorization expired or revoked. Reconnect Google and try again.",
      { status: 401, reauthRequired: true },
    );
  }

  if (status === 429) {
    return new CalendarSyncError(
      "calendar_provider_rate_limited",
      `Google Calendar rate limit reached${suffix}`,
      { status: 429 },
    );
  }

  if (status >= 500) {
    return new CalendarSyncError(
      "calendar_provider_transient_failure",
      `Google Calendar temporary failure${suffix}`,
      { status: 502 },
    );
  }

  return new CalendarSyncError(
    "calendar_request_invalid",
    `Google Calendar rejected request${suffix}`,
    { status: 400 },
  );
}

function normalizeGoogleEvent(payload: {
  id?: string;
  status?: string;
  summary?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ uri?: string; entryPointType?: string }>;
  };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}) {
  const meetUri =
    payload.hangoutLink ??
    payload.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ??
    null;

  const startsAt = payload.start?.dateTime ?? payload.start?.date ?? new Date().toISOString();
  const endsAt = payload.end?.dateTime ?? payload.end?.date ?? startsAt;
  const rawStatus = (payload.status ?? "unknown").toLowerCase();

  const status: "confirmed" | "tentative" | "cancelled" | "unknown" =
    rawStatus === "confirmed" || rawStatus === "tentative" || rawStatus === "cancelled"
      ? rawStatus
      : "unknown";

  return {
    provider: "google" as const,
    externalEventId: payload.id ?? `google-${Date.now()}`,
    status,
    title: payload.summary ?? null,
    startsAt,
    endsAt,
    meetingUrl: meetUri,
    payload: {
      google_status: payload.status ?? null,
      hangout_link: payload.hangoutLink ?? null,
    },
  };
}

export async function createGoogleCalendarEvent(params: {
  providerToken: string;
  input: CalendarEventCreateInput;
}): Promise<CalendarServiceCreateResult> {
  const { providerToken, input } = params;

  const response = await fetchWithTimeout(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(getCalendarId())}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${providerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? "",
        start: toGoogleDateTime(input.startsAt),
        end: toGoogleDateTime(input.endsAt),
        attendees: (input.attendees ?? []).map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
    getCalendarTimeoutMs(),
  );

  if (!response.ok) {
    const detail = await parseProviderErrorBody(response);
    throw mapGoogleCalendarError(response.status, detail);
  }

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    summary?: string;
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: Array<{ uri?: string; entryPointType?: string }>;
    };
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };

  return normalizeGoogleEvent(payload);
}

export async function getGoogleCalendarEvent(params: {
  providerToken: string;
  externalEventId: string;
}): Promise<CalendarServiceGetResult> {
  const { providerToken, externalEventId } = params;

  const response = await fetchWithTimeout(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(getCalendarId())}/events/${encodeURIComponent(externalEventId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${providerToken}`,
      },
    },
    getCalendarTimeoutMs(),
  );

  if (!response.ok) {
    const detail = await parseProviderErrorBody(response);
    throw mapGoogleCalendarError(response.status, detail);
  }

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    summary?: string;
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: Array<{ uri?: string; entryPointType?: string }>;
    };
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };

  return normalizeGoogleEvent(payload);
}
