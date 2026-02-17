import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/response";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import {
  buildFollowUpSuggestion,
  computeNextFollowUpAt,
  isFollowUpEligible,
  type PipelineStage,
} from "@/lib/followup/rules";
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

  const { data: memberships } = await supabase
    .from("firm_memberships")
    .select("firm_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const firmId = memberships?.[0]?.firm_id;
  if (!firmId) {
    const error = "No firm membership found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(error)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "firm_membership_missing",
        message: error,
      },
      { status: 403 },
    );
  }

  const entitlement = await assertFirmEntitled({
    supabase,
    firmId,
  });
  if (!entitlement.ok) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(entitlement.message)}`, request.url));
    }

    return entitlementApiError(request, entitlement);
  }

  const nowIso = new Date().toISOString();
  const { data: prospects, error: prospectsError } = await supabase
    .from("prospects")
    .select("id, company_name, primary_contact_name, pipeline_stage, next_follow_up_at")
    .eq("firm_id", firmId)
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", nowIso)
    .order("next_follow_up_at", { ascending: true })
    .limit(50);

  if (prospectsError) {
    const error = prospectsError.message;
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(error)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "prospect_query_failed",
        message: error,
      },
      { status: 500 },
    );
  }

  let created = 0;
  let skipped = 0;

  for (const prospect of prospects ?? []) {
    const stage = prospect.pipeline_stage as PipelineStage;
    if (!isFollowUpEligible(stage)) {
      skipped += 1;
      continue;
    }

    const suggestion = buildFollowUpSuggestion({
      companyName: prospect.company_name,
      stage,
      contactName: prospect.primary_contact_name,
    });

    const { error: insertError } = await supabase.from("follow_up_tasks").insert({
      firm_id: firmId,
      prospect_id: prospect.id,
      stage,
      due_at: prospect.next_follow_up_at,
      status: "pending",
      subject: suggestion.subject,
      body: suggestion.body,
      created_by: user.id,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        skipped += 1;
      } else {
        const error = insertError.message;
        if (formMode) {
          return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(error)}`, request.url));
        }
        return apiError(
          request,
          {
            code: "follow_up_task_insert_failed",
            message: error,
          },
          { status: 500 },
        );
      }
      continue;
    }

    const nextFollowUpAt = computeNextFollowUpAt(stage, new Date(prospect.next_follow_up_at));
    await supabase
      .from("prospects")
      .update({ next_follow_up_at: nextFollowUpAt })
      .eq("id", prospect.id)
      .eq("firm_id", firmId);

    created += 1;
  }

  if (formMode) {
    const message = `Generated ${created} follow-up tasks`;
    return NextResponse.redirect(
      new URL(`/pipeline?message=${toQueryParam(message)}`, request.url),
    );
  }

  return apiSuccess(request, {
    created,
    skipped,
  });
}
