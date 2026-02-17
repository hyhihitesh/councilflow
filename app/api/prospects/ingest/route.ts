import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { resolveFirmContext } from "@/lib/auth/firm-context";
import { formatZodError } from "@/lib/api/validation";
import {
  buildProspectDedupKey,
  type ManualProspectInput,
  normalizeManualProspect,
} from "@/lib/prospects/ingest";
import { createClient } from "@/lib/supabase/server";

type IngestSummary = {
  processed: number;
  created: number;
  merged: number;
  skipped_duplicates: number;
  invalid: number;
  errors: string[];
};

const ingestJsonSchema = z.object({
  prospects: z.array(z.record(z.unknown())).min(1),
});

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

function toManualInputFromFormData(formData: FormData): ManualProspectInput[] {
  return [
    {
      company_name: formData.get("company_name")?.toString(),
      domain: formData.get("domain")?.toString(),
      primary_contact_name: formData.get("primary_contact_name")?.toString(),
      primary_contact_email: formData.get("primary_contact_email")?.toString(),
      primary_contact_title: formData.get("primary_contact_title")?.toString(),
      linkedin_url: formData.get("linkedin_url")?.toString(),
      source: "manual",
    },
  ];
}

async function findExistingProspect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  firmId: string,
  domain: string | null,
  email: string | null,
) {
  if (domain) {
    const byDomain = await supabase
      .from("prospects")
      .select(
        "id, company_name, domain, primary_contact_name, primary_contact_email, primary_contact_title, linkedin_url",
      )
      .eq("firm_id", firmId)
      .eq("domain", domain)
      .maybeSingle();

    if (byDomain.data) return byDomain.data;
  }

  if (email) {
    const byEmail = await supabase
      .from("prospects")
      .select(
        "id, company_name, domain, primary_contact_name, primary_contact_email, primary_contact_title, linkedin_url",
      )
      .eq("firm_id", firmId)
      .eq("primary_contact_email", email)
      .maybeSingle();

    if (byEmail.data) return byEmail.data;
  }

  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const isForm = isFormRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isForm) {
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

  let inputs: ManualProspectInput[] = [];

  if (isForm) {
    const formData = await request.formData();
    inputs = toManualInputFromFormData(formData);
  } else {
    let body: { prospects?: unknown[] };
    try {
      body = (await request.json()) as { prospects?: unknown[] };
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
    const parsed = ingestJsonSchema.safeParse(body);
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
    inputs = parsed.data.prospects as ManualProspectInput[];
  }

  if (inputs.length === 0) {
    const message = "Missing prospects payload";
    if (isForm) {
      return NextResponse.redirect(new URL(`/dashboard?error=${toQueryParam(message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "missing_payload",
        message,
      },
      { status: 400 },
    );
  }

  const firmContext = await resolveFirmContext({
    supabase,
    userId: user.id,
  });
  if (!firmContext.ok) {
    if (isForm) {
      return NextResponse.redirect(
        new URL(`/dashboard?error=${toQueryParam(firmContext.message)}`, request.url),
      );
    }
    return apiError(
      request,
      {
        code: firmContext.code,
        message: firmContext.message,
      },
      { status: firmContext.code === "firm_membership_query_failed" ? 500 : 403 },
    );
  }
  const firmId = firmContext.firmId;

  const entitlement = await assertFirmEntitled({
    supabase,
    firmId,
  });
  if (!entitlement.ok) {
    if (isForm) {
      return NextResponse.redirect(
        new URL(`/dashboard?error=${toQueryParam(entitlement.message)}`, request.url),
      );
    }
    return entitlementApiError(request, entitlement);
  }

  const summary: IngestSummary = {
    processed: inputs.length,
    created: 0,
    merged: 0,
    skipped_duplicates: 0,
    invalid: 0,
    errors: [],
  };

  const seenKeys = new Set<string>();

  for (const input of inputs) {
    const normalizedResult = normalizeManualProspect(input);
    if ("error" in normalizedResult) {
      summary.invalid += 1;
      summary.errors.push(normalizedResult.error ?? "Invalid prospect payload");
      continue;
    }

    const normalized = normalizedResult.data;
    const dedupeKey = buildProspectDedupKey(normalized);

    if (seenKeys.has(dedupeKey)) {
      summary.skipped_duplicates += 1;
      continue;
    }
    seenKeys.add(dedupeKey);

    const existing = await findExistingProspect(
      supabase,
      firmId,
      normalized.domain,
      normalized.primary_contact_email,
    );

    if (existing) {
      const updatePayload: Record<string, string> = {};

      if (!existing.primary_contact_name && normalized.primary_contact_name) {
        updatePayload.primary_contact_name = normalized.primary_contact_name;
      }
      if (!existing.primary_contact_title && normalized.primary_contact_title) {
        updatePayload.primary_contact_title = normalized.primary_contact_title;
      }
      if (!existing.linkedin_url && normalized.linkedin_url) {
        updatePayload.linkedin_url = normalized.linkedin_url;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from("prospects")
          .update(updatePayload)
          .eq("id", existing.id)
          .eq("firm_id", firmId);

        if (updateError) {
          summary.errors.push(updateError.message);
          continue;
        }
      }

      summary.merged += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("prospects").insert({
      firm_id: firmId,
      source: normalized.source,
      company_name: normalized.company_name,
      domain: normalized.domain,
      primary_contact_name: normalized.primary_contact_name,
      primary_contact_email: normalized.primary_contact_email,
      primary_contact_title: normalized.primary_contact_title,
      linkedin_url: normalized.linkedin_url,
      created_by: user.id,
      status: "new",
    });

    if (insertError) {
      if (insertError.code === "23505") {
        summary.merged += 1;
      } else {
        summary.errors.push(insertError.message);
      }
      continue;
    }

    summary.created += 1;
  }

  if (isForm) {
    const message = `Ingestion complete: ${summary.created} created, ${summary.merged} merged, ${summary.invalid} invalid`;
    return NextResponse.redirect(
      new URL(`/dashboard?message=${toQueryParam(message)}`, request.url),
    );
  }

  return apiSuccess(request, summary);
}
