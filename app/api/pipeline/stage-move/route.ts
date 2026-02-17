import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import {
  createCalendarEvent,
  detectCalendarProvider,
} from "@/lib/calendar/service";
import { CalendarSyncError } from "@/lib/calendar/types";
import type { PipelineStage } from "@/lib/followup/rules";
import { validatePipelineStageMove } from "@/lib/pipeline/stage-transition";
import { createClient } from "@/lib/supabase/server";

const stageSchema = z.enum(["researched", "approved", "sent", "replied", "meeting", "won", "lost"]);

const requestSchema = z.object({
  prospect_id: z.string().uuid(),
  to_stage: stageSchema,
  source: z.enum(["drag_drop", "drawer_action"]),
  meeting: z
    .object({
      title: z.string().trim().min(3),
      starts_at: z.string().datetime(),
      ends_at: z.string().datetime(),
      description: z.string().optional(),
      attendees: z.array(z.string().email()).optional(),
    })
    .optional(),
});

function shouldAutoCreateMeeting() {
  const raw = (process.env.CALENDAR_MEETING_AUTO_CREATE ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
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
        message: "Invalid stage move payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { prospect_id: prospectId, to_stage: toStage, source, meeting } = parsed.data;

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

  const fromStage = prospect.pipeline_stage as PipelineStage;
  const transition = validatePipelineStageMove({
    fromStage,
    toStage,
  });

  if (!transition.ok) {
    return apiError(
      request,
      {
        code: transition.code,
        message: transition.message,
      },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  const { data: updatedProspect, error: updateError } = await supabase
    .from("prospects")
    .update({
      pipeline_stage: toStage,
      last_stage_changed_at: nowIso,
      last_stage_changed_by: user.id,
    })
    .eq("id", prospectId)
    .eq("firm_id", firmId)
    .select("id, pipeline_stage, last_stage_changed_at")
    .maybeSingle();

  if (updateError || !updatedProspect) {
    return apiError(
      request,
      {
        code: "stage_update_failed",
        message: updateError?.message ?? "Failed to update stage.",
      },
      { status: 500 },
    );
  }

  await supabase.from("pipeline_stage_events").insert({
    firm_id: firmId,
    prospect_id: prospectId,
    from_stage: fromStage,
    to_stage: toStage,
    source,
    actor_id: user.id,
    metadata: {
      auto_calendar_attempted: Boolean(meeting),
    },
  });

  let autoCalendar: {
    created: boolean;
    error_code?: string;
    error_message?: string;
    event_id?: string;
  } = {
    created: false,
  };

  if (toStage === "meeting" && shouldAutoCreateMeeting() && meeting) {
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
          title: meeting.title,
          startsAt: meeting.starts_at,
          endsAt: meeting.ends_at,
          description: meeting.description,
          attendees: meeting.attendees,
        },
      });

      const { error: insertCalendarError } = await supabase.from("calendar_events").insert({
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
      });

      if (!insertCalendarError) {
        await supabase.from("calendar_connections").upsert(
          {
            firm_id: firmId,
            user_id: user.id,
            provider: created.provider,
            external_account_id: user.email ?? null,
            scope: "calendar.events",
            status: "connected",
            last_sync_check_at: nowIso,
            metadata: {
              source: "stage_move_auto",
            },
          },
          { onConflict: "firm_id,user_id,provider" },
        );

        autoCalendar = {
          created: true,
          event_id: created.externalEventId,
        };
      } else {
        autoCalendar = {
          created: false,
          error_code: "calendar_insert_failed",
          error_message: insertCalendarError.message,
        };
      }
    } catch (error) {
      if (error instanceof CalendarSyncError) {
        autoCalendar = {
          created: false,
          error_code: error.code,
          error_message: error.message,
        };
      } else {
        autoCalendar = {
          created: false,
          error_code: "calendar_unknown_failure",
          error_message: error instanceof Error ? error.message : "Unknown calendar error",
        };
      }
    }
  }

  return apiSuccess(request, {
    prospect_id: prospectId,
    from_stage: fromStage,
    to_stage: toStage,
    updated_at: updatedProspect.last_stage_changed_at,
    auto_calendar: autoCalendar,
  });
}
