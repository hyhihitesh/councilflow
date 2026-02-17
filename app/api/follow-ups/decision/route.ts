import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { computeNextFollowUpAt } from "@/lib/followup/rules";
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

type DecisionAction = "complete" | "skip";

const requestSchema = z.object({
  task_id: z.string().trim().min(1),
  action: z.enum(["complete", "skip"]),
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

  let taskId = "";
  let action: DecisionAction | "" = "";

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      task_id: formData.get("task_id")?.toString(),
      action: formData.get("action")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/pipeline?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    taskId = parsed.data.task_id;
    action = parsed.data.action;
  } else {
    const payload = (await request.json()) as {
      task_id?: string;
      action?: string;
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
    taskId = parsed.data.task_id;
    action = parsed.data.action;
  }

  if (!taskId || !["complete", "skip"].includes(action)) {
    const message = "Invalid follow-up decision payload";
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "invalid_payload",
        message,
      },
      { status: 400 },
    );
  }

  const { data: task } = await supabase
    .from("follow_up_tasks")
    .select("id, firm_id, prospect_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) {
    const message = "Follow-up task not found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "task_not_found",
        message,
      },
      { status: 404 },
    );
  }

  const { data: membership } = await supabase
    .from("firm_memberships")
    .select("id")
    .eq("firm_id", task.firm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    const message = "Access denied for follow-up decision";
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "access_denied",
        message,
      },
      { status: 403 },
    );
  }

  const entitlement = await assertFirmEntitled({
    supabase,
    firmId: task.firm_id,
  });
  if (!entitlement.ok) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(entitlement.message)}`, request.url));
    }

    return entitlementApiError(request, entitlement);
  }

  const status = action === "complete" ? "completed" : "skipped";

  const { error: updateError } = await supabase
    .from("follow_up_tasks")
    .update({
      status,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("firm_id", task.firm_id)
    .eq("status", "pending");

  if (updateError) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/pipeline?error=${toQueryParam(updateError.message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "task_update_failed",
        message: updateError.message,
      },
      { status: 500 },
    );
  }

  if (action === "complete") {
    const nowIso = new Date().toISOString();
    await supabase
      .from("prospects")
      .update({
        pipeline_stage: "replied",
        last_contacted_at: nowIso,
        next_follow_up_at: computeNextFollowUpAt("replied", new Date(nowIso)),
      })
      .eq("id", task.prospect_id)
      .eq("firm_id", task.firm_id)
      .eq("pipeline_stage", "sent");
  }

  if (formMode) {
    return NextResponse.redirect(
      new URL(`/pipeline?message=${toQueryParam(`Follow-up ${status}`)}`, request.url),
    );
  }

  return apiSuccess(request, {
    task_id: taskId,
    status,
  });
}
