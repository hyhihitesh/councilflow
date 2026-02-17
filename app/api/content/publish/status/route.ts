import { apiError, apiSuccess } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const draftId = url.searchParams.get("draft_id")?.trim() ?? "";

  if (!draftId) {
    return apiError(
      request,
      {
        code: "missing_draft_id",
        message: "draft_id query parameter is required.",
      },
      { status: 400 },
    );
  }

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

  const { data: draft } = await supabase
    .from("content_drafts")
    .select(
      "id, firm_id, channel, status, published_at, preview_payload, publish_adapter, published_via, provider, provider_status, provider_post_id, provider_published_at, provider_error_code, provider_error_message",
    )
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) {
    return apiError(
      request,
      {
        code: "draft_not_found",
        message: "Content draft not found.",
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
    return apiError(
      request,
      {
        code: "access_denied",
        message: "Access denied for content publish status.",
      },
      { status: 403 },
    );
  }

  const payload =
    draft.preview_payload && typeof draft.preview_payload === "object" ? draft.preview_payload : {};
  const payloadRecord = payload as Record<string, unknown>;

  return apiSuccess(request, {
    draft_id: draft.id,
    status: draft.status,
    channel: draft.channel,
    published_at: draft.published_at,
    publish_adapter: draft.publish_adapter ?? payloadRecord.publish_adapter ?? null,
    published_via: draft.published_via ?? payloadRecord.published_via ?? null,
    provider: draft.provider ?? payloadRecord.provider ?? null,
    provider_status: draft.provider_status ?? payloadRecord.provider_status ?? null,
    provider_post_id: draft.provider_post_id ?? payloadRecord.provider_post_id ?? null,
    provider_published_at: draft.provider_published_at ?? payloadRecord.provider_published_at ?? null,
    provider_error_code: draft.provider_error_code ?? payloadRecord.provider_error_code ?? null,
    provider_error_message: draft.provider_error_message ?? payloadRecord.provider_error_message ?? null,
  });
}
