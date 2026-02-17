import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { resolveFirmContext } from "@/lib/auth/firm-context";
import { formatZodError } from "@/lib/api/validation";
import { executeResearchRun } from "@/lib/research/run-executor";
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

type RequestBody = {
  retry_run_id?: string;
  prospect_id?: string;
  limit?: number;
};

const requestSchema = z.object({
  retry_run_id: z.string().trim().optional(),
  prospect_id: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const formMode = isFormRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (formMode) {
      return NextResponse.redirect(
        new URL("/auth/sign-in?error=Please%20sign%20in%20again", request.url),
      );
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

  let retryRunId = "";
  let prospectId = "";
  let limit = 10;

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      retry_run_id: formData.get("retry_run_id")?.toString(),
      prospect_id: formData.get("prospect_id")?.toString(),
      limit: formData.get("limit")?.toString() ?? "10",
    });

    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/dashboard?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }

    retryRunId = parsed.data.retry_run_id ?? "";
    prospectId = parsed.data.prospect_id ?? "";
    limit = parsed.data.limit ?? 10;
  } else {
    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return apiError(
        request,
        {
          code: "invalid_payload",
          message: "Invalid JSON payload.",
        },
        { status: 400 },
      );
    }
    const parsed = requestSchema.safeParse(body);
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

    retryRunId = parsed.data.retry_run_id ?? "";
    prospectId = parsed.data.prospect_id ?? "";
    limit = parsed.data.limit ?? 10;
  }

  const firmContext = await resolveFirmContext({
    supabase,
    userId: user.id,
  });

  if (!firmContext.ok) {
    return apiError(
      request,
      {
        code: firmContext.code,
        message: firmContext.message,
      },
      { status: firmContext.code === "firm_membership_query_failed" ? 500 : 403 },
    );
  }

  const entitlement = await assertFirmEntitled({
    supabase,
    firmId: firmContext.firmId,
  });
  if (!entitlement.ok) {
    return entitlementApiError(request, entitlement);
  }

  const result = await executeResearchRun({
    supabase,
    firmId: firmContext.firmId,
    requestedBy: user.id,
    retryRunId,
    prospectId,
    limit,
    requireMemberUserId: user.id,
    triggerType: retryRunId ? "retry" : "manual",
    maxRetryCount: 3,
  });

  if (!result.ok) {
    if (formMode) {
      return NextResponse.redirect(
        new URL(`/dashboard?error=${toQueryParam(result.error)}`, request.url),
      );
    }
    return apiError(
      request,
      {
        code: "research_run_failed",
        message: result.error,
      },
      { status: result.statusCode },
    );
  }

  if (formMode) {
    const message = `Research run ${result.status}: ${result.succeededProspects}/${result.totalProspects} prospects succeeded`;
    return NextResponse.redirect(
      new URL(`/dashboard?message=${toQueryParam(message)}`, request.url),
    );
  }

  return apiSuccess(request, {
    run_id: result.runId,
    status: result.status,
    summary: result.summary,
    total_prospects: result.totalProspects,
    succeeded_prospects: result.succeededProspects,
  });
}
