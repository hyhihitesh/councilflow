import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { runProviderEnrichment } from "@/lib/research/provider-runner";
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

const requestSchema = z.object({
  prospect_id: z.string().trim().min(1),
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

  let prospectId = "";

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      prospect_id: formData.get("prospect_id")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/dashboard?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    prospectId = parsed.data.prospect_id;
  } else {
    let body: { prospect_id?: string };
    try {
      body = (await request.json()) as { prospect_id?: string };
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
    prospectId = parsed.data.prospect_id;
  }

  if (!prospectId) {
    const message = "Missing prospect_id";
    if (formMode) {
      return NextResponse.redirect(new URL(`/dashboard?error=${toQueryParam(message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "missing_input",
        message,
      },
      { status: 400 },
    );
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, firm_id, company_name, domain")
    .eq("id", prospectId)
    .maybeSingle();

  if (!prospect) {
    const message = "Prospect not found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/dashboard?error=${toQueryParam(message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "prospect_not_found",
        message,
      },
      { status: 404 },
    );
  }

  const { data: membership } = await supabase
    .from("firm_memberships")
    .select("id")
    .eq("firm_id", prospect.firm_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    const message = "Access denied for firm enrichment";
    if (formMode) {
      return NextResponse.redirect(new URL(`/dashboard?error=${toQueryParam(message)}`, request.url));
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
    firmId: prospect.firm_id,
  });
  if (!entitlement.ok) {
    if (formMode) {
      return NextResponse.redirect(
        new URL(`/dashboard?error=${toQueryParam(entitlement.message)}`, request.url),
      );
    }
    return entitlementApiError(request, entitlement);
  }

  const result = await runProviderEnrichment({
    supabase,
    // @ts-expect-error: Deprecated provider
    provider: "firecrawl",
    firmId: prospect.firm_id,
    prospect,
    userId: user.id,
  });

  if (!result.success) {
    const message = result.error;
    if (formMode) {
      return NextResponse.redirect(new URL(`/dashboard?error=${toQueryParam(message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "enrichment_failed",
        message,
        details: { run_id: result.run_id },
      },
      { status: 500 },
    );
  }

  if (formMode) {
    const message = `Firecrawl enrichment complete (${result.signal_count} signals added)`;
    return NextResponse.redirect(
      new URL(`/dashboard?message=${toQueryParam(message)}`, request.url),
    );
  }

  return apiSuccess(request, {
    run_id: result.run_id,
    prospect_id: prospectId,
    signal_count: result.signal_count,
    status: "completed",
  });
}
