import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { detectCalendarProvider, getCalendarEvent } from "@/lib/calendar/service";
import { CalendarSyncError } from "@/lib/calendar/types";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  prospect_id: z.string().uuid(),
  refresh: z.enum(["0", "1"]).optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(
      request,
      {
        code: "not_authenticated",
        message: "Please sign in again.",
      },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    prospect_id: url.searchParams.get("prospect_id"),
    refresh: url.searchParams.get("refresh") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      request,
      {
        code: "invalid_query",
        message: "Invalid calendar event query.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { prospect_id: prospectId, refresh } = parsed.data;

  const { data: memberships } = await supabase
    .from("firm_memberships")
    .select("firm_id")
    .eq("user_id", user.id)
    .limit(1);

  const firmId = memberships?.[0]?.firm_id;
  if (!firmId) {
    return apiError(
      request,
      {
        code: "cross_tenant_forbidden",
        message: "Firm membership not found.",
      },
      { status: 403 },
    );
  }

  const { data: linked } = await supabase
    .from("calendar_events")
    .select("id, provider, external_event_id, status, title, starts_at, ends_at, meeting_url, payload, synced_at")
    .eq("firm_id", firmId)
    .eq("prospect_id", prospectId)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!linked) {
    return apiSuccess(request, {
      linked: false,
      event: null,
    });
  }

  if (refresh === "1") {
    const provider = detectCalendarProvider(user.app_metadata);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const providerToken = session?.provider_token ?? null;

    try {
      const refreshed = await getCalendarEvent({
        provider,
        providerToken,
        externalEventId: linked.external_event_id,
      });

      await supabase
        .from("calendar_events")
        .update({
          status: refreshed.status,
          title: refreshed.title,
          starts_at: refreshed.startsAt,
          ends_at: refreshed.endsAt,
          meeting_url: refreshed.meetingUrl,
          payload: refreshed.payload,
          synced_at: new Date().toISOString(),
        })
        .eq("id", linked.id)
        .eq("firm_id", firmId);

      return apiSuccess(request, {
        linked: true,
        refreshed: true,
        event: {
          ...linked,
          status: refreshed.status,
          title: refreshed.title,
          starts_at: refreshed.startsAt,
          ends_at: refreshed.endsAt,
          meeting_url: refreshed.meetingUrl,
          payload: refreshed.payload,
        },
      });
    } catch (error) {
      if (error instanceof CalendarSyncError) {
        return apiError(
          request,
          {
            code: error.code,
            message: error.message,
            details: {
              reauth_required: error.reauthRequired,
            },
          },
          { status: error.status },
        );
      }

      return apiError(
        request,
        {
          code: "calendar_unknown_failure",
          message: error instanceof Error ? error.message : "Failed to refresh calendar event",
        },
        { status: 500 },
      );
    }
  }

  return apiSuccess(request, {
    linked: true,
    refreshed: false,
    event: linked,
  });
}
