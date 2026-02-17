import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { publishLinkedInPost } from "@/lib/content/publish/linkedin";
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

type DecisionAction = "save" | "approve" | "publish" | "copy_linkedin";

const requestSchema = z.object({
  draft_id: z.string().trim().min(1),
  action: z.enum(["save", "approve", "publish", "copy_linkedin"]),
  title: z.string().optional(),
  body: z.string().optional(),
  publish_adapter: z.enum(["manual_copy", "linkedin_api"]).optional(),
});

function resolvePublishAdapter(value: string | undefined) {
  const requested = (value ?? "").trim().toLowerCase();
  if (requested === "linkedin_api") return "linkedin_api";
  if (requested === "manual_copy") return "manual_copy";

  const configured = (process.env.LINKEDIN_PUBLISH_ADAPTER ?? "manual_copy").trim().toLowerCase();
  return configured === "linkedin_api" ? "linkedin_api" : "manual_copy";
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

  let draftId = "";
  let action: DecisionAction | "" = "";
  let title = "";
  let body = "";
  let publishAdapter = "manual_copy";

  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      draft_id: formData.get("draft_id")?.toString(),
      action: formData.get("action")?.toString(),
      title: formData.get("title")?.toString(),
      body: formData.get("body")?.toString(),
      publish_adapter: formData.get("publish_adapter")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/content-studio?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    draftId = parsed.data.draft_id;
    action = parsed.data.action;
    title = parsed.data.title ?? "";
    body = parsed.data.body ?? "";
    publishAdapter = resolvePublishAdapter(parsed.data.publish_adapter);
  } else {
    const payload = (await request.json()) as {
      draft_id?: string;
      action?: string;
      title?: string;
      body?: string;
      publish_adapter?: string;
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
    title = parsed.data.title ?? "";
    body = parsed.data.body ?? "";
    publishAdapter = resolvePublishAdapter(parsed.data.publish_adapter);
  }

  if (!draftId || !["save", "approve", "publish", "copy_linkedin"].includes(action)) {
    const message = "Invalid content decision payload";
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
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

  const { data: draft } = await supabase
    .from("content_drafts")
    .select(
      "id, firm_id, channel, status, title, body, preview_payload, publish_adapter, published_via, provider, provider_status, provider_post_id, provider_published_at, provider_error_code, provider_error_message",
    )
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) {
    const message = "Content draft not found";
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "draft_not_found",
        message,
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
    const message = "Access denied for content decision";
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
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
    firmId: draft.firm_id,
  });
  if (!entitlement.ok) {
    if (formMode) {
      return NextResponse.redirect(
        new URL(`/content-studio?error=${toQueryParam(entitlement.message)}`, request.url),
      );
    }

    return entitlementApiError(request, entitlement);
  }

  const updatePayload: Record<string, unknown> = {};
  let publishResultDetails: {
    provider_status: string | null;
    provider_post_id: string | null;
    provider_error_code: string | null;
    provider_error_message: string | null;
  } | null = null;

  if (action === "save") {
    if (title.trim().length >= 8) updatePayload.title = title.trim();
    if (body.trim().length >= 60) updatePayload.body = body.trim();
    updatePayload.status = "draft";
  }

  if (action === "approve") {
    updatePayload.status = "approved";
    updatePayload.approved_by = user.id;
    updatePayload.approved_at = new Date().toISOString();
  }

  if (action === "publish") {
    if (!(["approved", "published"] as string[]).includes(draft.status)) {
      const message = "Draft must be approved before publish";
      if (formMode) {
        return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
      }

      return apiError(
        request,
        {
          code: "draft_not_approved",
          message,
        },
        { status: 409 },
      );
    }

    const existingPreviewPayload =
      draft.preview_payload && typeof draft.preview_payload === "object" ? draft.preview_payload : {};
    const existingProviderPostId = typeof draft.provider_post_id === "string" && draft.provider_post_id.trim()
      ? draft.provider_post_id
      : typeof (existingPreviewPayload as Record<string, unknown>).provider_post_id === "string"
        ? ((existingPreviewPayload as Record<string, unknown>).provider_post_id as string)
        : null;

    const publishStartedAt = new Date().toISOString();
    let providerPostId = existingProviderPostId;
    let providerStatus = "skipped";
    const providerErrorCode: string | null = null;
    const providerErrorMessage: string | null = null;

    if (publishAdapter === "linkedin_api" && draft.channel === "linkedin") {
      if (!providerPostId) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const providerToken = session?.provider_token ?? null;

        const publishText = `${title.trim() || draft.title || ""}\n\n${body.trim() || draft.body || ""}`.trim();
        const publishResult = await publishLinkedInPost({
          text: publishText || "LinkedIn update",
          accessToken: providerToken,
        });

        if (!publishResult.ok) {
          const message = publishResult.message;
          if (formMode) {
            return NextResponse.redirect(
              new URL(`/content-studio?error=${toQueryParam(message)}`, request.url),
            );
          }
          return apiError(
            request,
            {
              code: publishResult.code,
              message,
              details: {
                provider: "linkedin",
                status: publishResult.status ?? null,
                endpoint: publishResult.endpoint,
              },
            },
            { status: 502 },
          );
        }

        providerPostId = publishResult.postId;
        providerStatus = "published";
      } else {
        providerStatus = "already_published";
      }
    } else if (publishAdapter === "manual_copy") {
      providerStatus = "manual_copy";
    }

    updatePayload.status = "published";
    updatePayload.published_by = user.id;
    updatePayload.published_at = new Date().toISOString();
    updatePayload.publish_adapter = publishAdapter;
    updatePayload.published_via = publishAdapter === "linkedin_api" ? "provider_adapter" : "manual_copy";
    updatePayload.provider = publishAdapter === "linkedin_api" ? "linkedin" : null;
    updatePayload.provider_post_id = providerPostId;
    updatePayload.provider_status = providerStatus;
    updatePayload.provider_published_at = providerStatus === "published" ? publishStartedAt : null;
    updatePayload.provider_error_code = providerErrorCode;
    updatePayload.provider_error_message = providerErrorMessage;
    publishResultDetails = {
      provider_status: providerStatus,
      provider_post_id: providerPostId,
      provider_error_code: providerErrorCode,
      provider_error_message: providerErrorMessage,
    };
    updatePayload.preview_payload = {
      ...existingPreviewPayload,
      publish_adapter: publishAdapter,
      publish_channel: draft.channel,
      published_via: publishAdapter === "linkedin_api" ? "provider_adapter" : "manual_copy",
      provider: publishAdapter === "linkedin_api" ? "linkedin" : null,
      provider_post_id: providerPostId,
      provider_status: providerStatus,
      provider_published_at: providerStatus === "published" ? publishStartedAt : null,
      provider_error_code: providerErrorCode,
      provider_error_message: providerErrorMessage,
    };
  }

  if (action === "copy_linkedin") {
    if (draft.channel !== "linkedin") {
      const message = "Copy action is available only for LinkedIn drafts";
      if (formMode) {
        return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(message)}`, request.url));
      }
      return apiError(
        request,
        {
          code: "invalid_channel_for_copy",
          message,
        },
        { status: 409 },
      );
    }

    updatePayload.preview_payload = {
      ...(draft.preview_payload && typeof draft.preview_payload === "object" ? draft.preview_payload : {}),
      copied_for_linkedin_at: new Date().toISOString(),
      copied_by: user.id,
    };
  }

  const { error: updateError } = await supabase
    .from("content_drafts")
    .update(updatePayload)
    .eq("id", draftId)
    .eq("firm_id", draft.firm_id);

  if (updateError) {
    if (formMode) {
      return NextResponse.redirect(new URL(`/content-studio?error=${toQueryParam(updateError.message)}`, request.url));
    }

    return apiError(
      request,
      {
        code: "draft_update_failed",
        message: updateError.message,
      },
      { status: 500 },
    );
  }

  if (formMode) {
    const actionMessage =
      action === "copy_linkedin"
        ? "LinkedIn draft copy tracked"
        : action === "publish"
          ? "Draft published"
          : `Draft ${action}d`;
    return NextResponse.redirect(
      new URL(`/content-studio?message=${toQueryParam(actionMessage)}`, request.url),
    );
  }

  return apiSuccess(request, {
    draft_id: draftId,
    action,
    ...(publishResultDetails
      ? {
          provider_status: publishResultDetails.provider_status,
          provider_post_id: publishResultDetails.provider_post_id,
          provider_error_code: publishResultDetails.provider_error_code,
          provider_error_message: publishResultDetails.provider_error_message,
        }
      : {}),
  });
}
