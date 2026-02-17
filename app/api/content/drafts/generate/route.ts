import { NextResponse } from "next/server";
import { z } from "zod";

import { completeAgentRun, startAgentRun } from "@/lib/agent/audit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { type ContentChannel, generateContentDraft } from "@/lib/content/studio";
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

function isContentChannel(value: string): value is ContentChannel {
  return value === "linkedin" || value === "newsletter";
}

const requestSchema = z.object({
  channel: z.enum(["linkedin", "newsletter"]),
  topic: z.string().optional(),
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

  let channelRaw = "";
  let topic = "";

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      channel: formData.get("channel")?.toString().trim().toLowerCase(),
      topic: formData.get("topic")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/content-studio?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    channelRaw = parsed.data.channel;
    topic = parsed.data.topic ?? "";
  } else {
    const payload = (await request.json()) as {
      channel?: string;
      topic?: string;
    };
    const parsed = requestSchema.safeParse({
      channel: payload.channel?.trim().toLowerCase(),
      topic: payload.topic,
    });
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
    channelRaw = parsed.data.channel;
    topic = parsed.data.topic ?? "";
  }

  if (!isContentChannel(channelRaw)) {
    const message = "Invalid content channel";
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "invalid_channel",
        message,
      },
      { status: 400 },
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
    const message = "No firm membership found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "firm_membership_missing",
        message,
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
      return NextResponse.redirect(
        new URL(`/content-studio?error=${toQueryParam(entitlement.message)}`, request.url),
      );
    }

    return entitlementApiError(request, entitlement);
  }

  const { data: latest } = await supabase
    .from("content_drafts")
    .select("version")
    .eq("firm_id", firmId)
    .eq("channel", channelRaw)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const generated = generateContentDraft({
    channel: channelRaw,
    topic,
  });

  const agentRunId = await startAgentRun({
    supabase,
    firmId,
    runType: "content_generate",
    requestedBy: user.id,
    metadata: {
      channel: channelRaw,
      topic: topic.trim() || null,
    },
  });

  const { data: inserted, error: insertError } = await supabase
    .from("content_drafts")
    .insert({
      firm_id: firmId,
      channel: channelRaw,
      status: "draft",
      title: generated.title,
      body: generated.body,
      topic: topic.trim() || null,
      preview_payload: generated.preview_payload,
      generated_by: "content_studio_v1",
      version: (latest?.version ?? 0) + 1,
      created_by: user.id,
    })
    .select("id, channel, status, version")
    .maybeSingle();

  if (insertError) {
    await completeAgentRun({
      supabase,
      firmId,
      runId: agentRunId,
      status: "failed",
      metadata: {
        error: insertError.message,
      },
    });
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(insertError.message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "content_insert_failed",
        message: insertError.message,
      },
      { status: 500 },
    );
  }

  await completeAgentRun({
    supabase,
    firmId,
    runId: agentRunId,
    status: "completed",
    metadata: {
      draft_id: inserted?.id ?? null,
      channel: channelRaw,
      version: inserted?.version ?? null,
    },
  });

  if (formMode) {
    return NextResponse.redirect(
      new URL(`/content-studio?message=${toQueryParam(`Draft generated (${channelRaw})`)}`, request.url),
    );
  }

  return apiSuccess(request, {
    draft: inserted,
  });
}
