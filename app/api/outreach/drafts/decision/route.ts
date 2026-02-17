import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { type PipelineStage } from "@/lib/followup/rules";
import { createClient } from "@/lib/supabase/server";

function toQueryParam(value: string) {
  return encodeURIComponent(value);
}

function isFormRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  );
}

type DraftAction = "approve" | "skip" | "edit";

const requestSchema = z.object({
  draft_id: z.string().trim().min(1),
  action: z.enum(["approve", "skip", "edit"]),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const formMode = isFormRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (formMode) {
      return NextResponse.redirect(new URL("/auth/sign-in?error=Please%20sign%20in%20again", request.url));
    }
    return apiError(
      request,
      {
        code: "not_authenticated",
        message: "Please sign in again.",
      },
      { status: 401 },
    );
  }

  let draftId = "";
  let action: DraftAction | "" = "";
  let subject = "";
  let body = "";

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      draft_id: formData.get("draft_id")?.toString(),
      action: formData.get("action")?.toString(),
      subject: formData.get("subject")?.toString(),
      body: formData.get("body")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/outreach?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    draftId = parsed.data.draft_id;
    action = parsed.data.action;
    subject = parsed.data.subject ?? "";
    body = parsed.data.body ?? "";
  } else {
    const payload = (await request.json()) as {
      draft_id?: string;
      action?: string;
      subject?: string;
      body?: string;
    };
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError(
        request,
        {
          code: "invalid_payload",
          message: formatZodError(parsed.error),
        },
        { status: 400 },
      );
    }
    draftId = parsed.data.draft_id;
    action = parsed.data.action;
    subject = parsed.data.subject ?? "";
    body = parsed.data.body ?? "";
  }

  if (!draftId || !["approve", "skip", "edit"].includes(action)) {
    const error = "Missing or invalid decision payload";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "invalid_payload",
        message: error,
      },
      { status: 400 },
    );
  }

  const { data: draft } = await supabase
    .from("outreach_drafts")
    .select("id, firm_id, prospect_id, status")
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) {
    const error = "Draft not found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "draft_not_found",
        message: error,
      },
      { status: 404 },
    );
  }

  const { data: membership } = await supabase
    .from("firm_memberships")
    .select("id")
    .eq("firm_id", draft.firm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    const error = "Access denied for outreach decision";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "access_denied",
        message: error,
      },
      { status: 403 },
    );
  }

  const entitlement = await assertFirmEntitled({
    supabase,
    firmId: draft.firm_id,
  });
  if (!entitlement.ok) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(entitlement.message)}`, request.url));
    }
    return entitlementApiError(request, entitlement);
  }

  const updatePayload: Record<string, unknown> = {};
  let eventAction: "approved" | "skipped" | "edited" = "edited";

  if (action === "approve") {
    updatePayload.status = "approved";
    updatePayload.approved_by = user.id;
    updatePayload.approved_at = new Date().toISOString();
    eventAction = "approved";
  } else if (action === "skip") {
    updatePayload.status = "skipped";
    eventAction = "skipped";
  } else {
    if (subject.trim().length >= 5) {
      updatePayload.subject = subject.trim();
    }
    if (body.trim().length >= 30) {
      updatePayload.body = body.trim();
    }
    updatePayload.status = "draft";
    eventAction = "edited";
  }

  const { error: updateError } = await supabase
    .from("outreach_drafts")
    .update(updatePayload)
    .eq("id", draftId)
    .eq("firm_id", draft.firm_id);

  if (updateError) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(updateError.message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "draft_update_failed",
        message: "Failed to update draft decision.",
      },
      { status: 500 },
    );
  }

  if (action === "approve") {
    await supabase.from("outreach_approvals").upsert(
      {
        draft_id: draftId,
        firm_id: draft.firm_id,
        prospect_id: draft.prospect_id,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "draft_id" },
    );

    await supabase
      .from("prospects")
      .update({
        pipeline_stage: "approved" satisfies PipelineStage,
      })
      .eq("id", draft.prospect_id)
      .eq("firm_id", draft.firm_id);
  } else {
    await supabase
      .from("outreach_approvals")
      .delete()
      .eq("draft_id", draftId)
      .eq("firm_id", draft.firm_id);
  }

  await supabase.from("outreach_events").insert({
    firm_id: draft.firm_id,
    prospect_id: draft.prospect_id,
    draft_id: draftId,
    action_type: eventAction,
    actor_id: user.id,
    metadata: {
      previous_status: draft.status,
      action,
    },
  });

  logResearchEvent("outreach_draft_decision", {
    firm_id: draft.firm_id,
    draft_id: draftId,
    action: eventAction,
  });

  if (formMode) {
    const message = `Draft ${eventAction}`;
    return NextResponse.redirect(new URL(`/outreach?message=${toQueryParam(message)}`, request.url));
  }

  return apiSuccess(request, {
    draft_id: draftId,
    action: eventAction,
  });
}
