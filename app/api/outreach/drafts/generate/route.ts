import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { generateOutreachDrafts } from "@/lib/outreach/writer";
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
  regenerate: z.union([z.boolean(), z.literal("1"), z.literal("0"), z.undefined()]).optional(),
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

  let prospectId = "";
  let regenerate = false;

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      prospect_id: formData.get("prospect_id")?.toString(),
      regenerate: formData.get("regenerate")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/outreach?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    prospectId = parsed.data.prospect_id;
    regenerate = parsed.data.regenerate === true || parsed.data.regenerate === "1";
  } else {
    const body = (await request.json()) as {
      prospect_id?: string;
      regenerate?: boolean;
    };
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
    regenerate = parsed.data.regenerate === true || parsed.data.regenerate === "1";
  }

  if (!prospectId) {
    const error = "Missing prospect_id";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "missing_input",
        message: error,
      },
      { status: 400 },
    );
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, firm_id, company_name, domain, primary_contact_name, primary_contact_title")
    .eq("id", prospectId)
    .maybeSingle();

  if (!prospect) {
    const error = "Prospect not found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "prospect_not_found",
        message: error,
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
    const error = "Access denied for outreach draft generation";
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
    firmId: prospect.firm_id,
  });
  if (!entitlement.ok) {
    if (formMode) {
      return NextResponse.redirect(
        new URL(`/outreach?error=${toQueryParam(entitlement.message)}`, request.url),
      );
    }
    return entitlementApiError(request, entitlement);
  }

  const { data: latestVersionRow } = await supabase
    .from("outreach_drafts")
    .select("version")
    .eq("firm_id", prospect.firm_id)
    .eq("prospect_id", prospectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = regenerate ? (latestVersionRow?.version ?? 0) + 1 : Math.max(1, latestVersionRow?.version ?? 1);

  const drafts = await generateOutreachDrafts({
    company_name: prospect.company_name,
    domain: prospect.domain,
    primary_contact_name: prospect.primary_contact_name,
    primary_contact_title: prospect.primary_contact_title,
  });

  const rows = drafts.map((draft) => ({
    firm_id: prospect.firm_id,
    prospect_id: prospectId,
    variant: draft.variant,
    subject: draft.subject,
    body: draft.body,
    voice_score: draft.voice_score,
    compliance_notes: draft.compliance_notes,
    generated_by: "writer_v1",
    version: nextVersion,
    created_by: user.id,
    status: "draft",
  }));

  const { data: insertedDrafts, error: insertError } = await supabase
    .from("outreach_drafts")
    .insert(rows)
    .select("id");

  if (insertError) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(insertError.message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "draft_insert_failed",
        message: "Failed to save generated drafts.",
      },
      { status: 500 },
    );
  }

  const eventType = regenerate ? "regenerated" : "generated";
  await supabase.from("outreach_events").insert(
    (insertedDrafts ?? []).map((draft) => ({
      firm_id: prospect.firm_id,
      prospect_id: prospectId,
      draft_id: draft.id,
      action_type: eventType,
      actor_id: user.id,
      metadata: {
        version: nextVersion,
      },
    })),
  );

  logResearchEvent("outreach_drafts_generated", {
    firm_id: prospect.firm_id,
    prospect_id: prospectId,
    regenerate,
    version: nextVersion,
    draft_count: insertedDrafts?.length ?? 0,
  });

  if (formMode) {
    const message = `Generated ${insertedDrafts?.length ?? 0} outreach drafts`;
    return NextResponse.redirect(new URL(`/outreach?message=${toQueryParam(message)}`, request.url));
  }

  return apiSuccess(request, {
    prospect_id: prospectId,
    generated_count: insertedDrafts?.length ?? 0,
    version: nextVersion,
  });
}
