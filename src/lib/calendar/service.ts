import { createGoogleCalendarEvent, getGoogleCalendarEvent } from "@/lib/calendar/google";
import {
  CalendarSyncError,
  type CalendarEventCreateInput,
  type CalendarProvider,
  type CalendarServiceCreateResult,
  type CalendarServiceGetResult,
} from "@/lib/calendar/types";

type ServiceContext = {
  provider: CalendarProvider;
  providerToken: string | null;
};

function isCalendarSyncEnabled() {
  const raw = (process.env.CALENDAR_SYNC_ENABLED ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

function resolveProvider(inputProvider?: string | null): CalendarProvider {
  const configured = (process.env.CALENDAR_SYNC_PROVIDER ?? "google").trim().toLowerCase();
  const value = (inputProvider ?? configured).trim().toLowerCase();

  if (value === "outlook") return "outlook";
  return "google";
}

function ensureProviderToken(context: ServiceContext) {
  const providerToken = context.providerToken;
  if (!providerToken) {
    throw new CalendarSyncError(
      "oauth_reauth_required",
      "No calendar provider access token found. Reconnect Google and try again.",
      { status: 401, reauthRequired: true },
    );
  }

  return providerToken;
}

export async function createCalendarEvent(params: {
  provider?: string | null;
  providerToken: string | null;
  input: CalendarEventCreateInput;
}): Promise<CalendarServiceCreateResult> {
  if (!isCalendarSyncEnabled()) {
    throw new CalendarSyncError(
      "calendar_provider_unavailable",
      "Calendar sync is disabled in this environment.",
      { status: 503 },
    );
  }

  const provider = resolveProvider(params.provider);
  const context: ServiceContext = {
    provider,
    providerToken: params.providerToken,
  };

  const providerToken = ensureProviderToken(context);

  if (provider === "outlook") {
    throw new CalendarSyncError(
      "calendar_provider_unavailable",
      "Outlook calendar sync is not enabled in this release.",
      { status: 501 },
    );
  }

  return createGoogleCalendarEvent({
    providerToken,
    input: params.input,
  });
}

export async function getCalendarEvent(params: {
  provider?: string | null;
  providerToken: string | null;
  externalEventId: string;
}): Promise<CalendarServiceGetResult> {
  if (!isCalendarSyncEnabled()) {
    throw new CalendarSyncError(
      "calendar_provider_unavailable",
      "Calendar sync is disabled in this environment.",
      { status: 503 },
    );
  }

  const provider = resolveProvider(params.provider);
  const context: ServiceContext = {
    provider,
    providerToken: params.providerToken,
  };

  const providerToken = ensureProviderToken(context);

  if (provider === "outlook") {
    throw new CalendarSyncError(
      "calendar_provider_unavailable",
      "Outlook calendar sync is not enabled in this release.",
      { status: 501 },
    );
  }

  return getGoogleCalendarEvent({
    providerToken,
    externalEventId: params.externalEventId,
  });
}

export function detectCalendarProvider(appMetadata: unknown): CalendarProvider | null {
  const value =
    appMetadata && typeof appMetadata === "object"
      ? (appMetadata as { providers?: unknown }).providers
      : null;

  const providers = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.toLowerCase())
    : [];

  if (providers.includes("google")) return "google";
  if (providers.includes("azure")) return "outlook";
  return null;
}

export function normalizeCalendarAttendees(input: string | null | undefined) {
  if (!input) return [];

  return input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 20);
}
