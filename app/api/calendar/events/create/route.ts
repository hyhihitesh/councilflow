import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import {
  createCalendarEvent,
  detectCalendarProvider,
  normalizeCalendarAttendees,
} from "@/lib/calendar/service";
import { CalendarSyncError } from "@/lib/calendar/types";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  prospect_id: z.string().uuid(),
  title: z.string().trim().min(3),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  description: z.string().optional(),
  attendees: z.union([z.array(z.string().email()), z.string()]).optional(),
});

function toAttendees(value: z.infer<typeof requestSchema>["attendees"]) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return normalizeCalendarAttendees(value);
  return [];
}

export async function POST(request: Request) {
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

  const payload = (await request.json()) as unknown;
  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(
      request,
      {
        code: "invalid_payload",
        message: "Invalid calendar event create payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { prospect_id: prospectId, title, starts_at: startsAt, ends_at: endsAt, description } = parsed.data;
  const attendees = toAttendees(parsed.data.attendees);

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

  const entitlement = await assertFirmEntitled({
    supabase,
    firmId,
  });
  if (!entitlement.ok) {
    return entitlementApiError(request, entitlement);
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, firm_id, pipeline_stage")
    .eq("id", prospectId)
    .eq("firm_id", firmId)
    .maybeSingle();

  if (!prospect) {
    return apiError(
      request,
      {
        code: "prospect_not_found",
        message: "Prospect not found.",
      },
      { status: 404 },
    );
  }

  const provider = detectCalendarProvider(user.app_metadata);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const providerToken = session?.provider_token ?? null;

  try {
    const created = await createCalendarEvent({
      provider,
      providerToken,
      input: {
        title,
        startsAt,
        endsAt,
        description,
        attendees,
      },
    });

    const { data: inserted, error: insertError } = await supabase
      .from("calendar_events")
      .insert({
        firm_id: firmId,
        prospect_id: prospectId,
        provider: created.provider,
        external_event_id: created.externalEventId,
        status: created.status,
        title: created.title,
        starts_at: created.startsAt,
        ends_at: created.endsAt,
        meeting_url: created.meetingUrl,
        payload: created.payload,
        created_by: user.id,
      })
      .select("id, external_event_id, status, starts_at, ends_at, meeting_url")
      .maybeSingle();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existing } = await supabase
          .from("calendar_events")
          .select("id, external_event_id, status, starts_at, ends_at, meeting_url")
          .eq("firm_id", firmId)
          .eq("prospect_id", prospectId)
          .eq("provider", created.provider)
          .eq("starts_at", created.startsAt)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return apiSuccess(request, {
          created: false,
          duplicate: true,
          event: existing,
        });
      }

      return apiError(
        request,
        {
          code: "calendar_insert_failed",
          message: insertError.message,
        },
        { status: 500 },
      );
    }

    await supabase.from("calendar_connections").upsert(
      {
        firm_id: firmId,
        user_id: user.id,
        provider: created.provider,
        external_account_id: user.email ?? null,
        scope: "calendar.events",
        status: "connected",
        last_sync_check_at: new Date().toISOString(),
        metadata: {
          source: "manual_create",
        },
      },
      { onConflict: "firm_id,user_id,provider" },
    );

    if (prospect.pipeline_stage !== "meeting") {
      const nowIso = new Date().toISOString();
      await supabase
        .from("prospects")
        .update({
          pipeline_stage: "meeting",
          last_stage_changed_at: nowIso,
          last_stage_changed_by: user.id,
        })
        .eq("id", prospectId)
        .eq("firm_id", firmId);

      await supabase.from("pipeline_stage_events").insert({
        firm_id: firmId,
        prospect_id: prospectId,
        from_stage: prospect.pipeline_stage,
        to_stage: "meeting",
        source: "drawer_action",
        actor_id: user.id,
        metadata: {
          trigger: "calendar_create",
        },
      });
    }

    return apiSuccess(request, {
      created: true,
      duplicate: false,
      event: inserted,
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
        message: error instanceof Error ? error.message : "Unknown calendar failure",
      },
      { status: 500 },
    );
  }
}
