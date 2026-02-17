import { NextResponse } from "next/server";
import { z } from "zod";

import {
  completeAgentRun,
  completeAgentStep,
  recordAgentToolCall,
  startAgentRun,
  startAgentStep,
} from "@/lib/agent/audit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { entitlementApiError } from "@/lib/billing/api-error";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import {
  buildFollowUpSuggestion,
  computeNextFollowUpAt,
} from "@/lib/followup/rules";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { evaluateOutreachCompliance } from "@/lib/outreach/compliance";
import {
  detectConnectedMailProvider,
  OutreachSendError,
  sendApprovedDraftViaMailbox,
} from "@/lib/outreach/sender";
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
  draft_id: z.string().trim().min(1),
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
  if (formMode) {
    const formData = await request.formData();
    const parsed = requestSchema.safeParse({
      draft_id: formData.get("draft_id")?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(`/outreach?error=${toQueryParam(formatZodError(parsed.error))}`, request.url),
      );
    }
    draftId = parsed.data.draft_id;
  } else {
    const payload = (await request.json()) as { draft_id?: string };
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
  }

  if (!draftId) {
    const error = "Missing draft_id";
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

  const { data: draft } = await supabase
    .from("outreach_drafts")
    .select("id, firm_id, prospect_id, status, subject, body, voice_score, sent_at")
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
    const error = "Access denied for outreach send";
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
      return NextResponse.redirect(
        new URL(`/outreach?error=${toQueryParam(entitlement.message)}`, request.url),
      );
    }
    return entitlementApiError(request, entitlement);
  }

  if (draft.status !== "approved") {
    const error = "Draft must be approved before sending";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "draft_not_approved",
        message: error,
      },
      { status: 409 },
    );
  }

  const compliance = evaluateOutreachCompliance({
    subject: draft.subject,
    body: draft.body,
    voiceScore: draft.voice_score,
  });
  if (compliance.status === "fail") {
    const error = "Draft failed compliance checks. Edit before sending.";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "compliance_failed",
        message: error,
        details: { checks: compliance.checks },
      },
      { status: 409 },
    );
  }

  if (draft.sent_at) {
    const error = "Draft already sent";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "already_sent",
        message: error,
      },
      { status: 409 },
    );
  }

  const { data: approval } = await supabase
    .from("outreach_approvals")
    .select("id")
    .eq("draft_id", draft.id)
    .eq("firm_id", draft.firm_id)
    .maybeSingle();

  if (!approval) {
    const error = "Approval record missing for this draft";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "approval_missing",
        message: error,
      },
      { status: 409 },
    );
  }

  const { data: attemptInsert, error: attemptInsertError } = await supabase
    .from("outreach_send_attempts")
    .insert({
      firm_id: draft.firm_id,
      draft_id: draft.id,
      requested_by: user.id,
      status: "sending",
      attempt_count: 1,
    })
    .select("id, status, attempt_count")
    .maybeSingle();

  let sendAttemptId = attemptInsert?.id ?? null;
  if (attemptInsertError) {
    if (attemptInsertError.code !== "23505") {
      if (formMode) {
        return NextResponse.redirect(
          new URL(`/outreach?error=${toQueryParam("Failed to create send attempt")}`, request.url),
        );
      }
      return apiError(
        request,
        {
          code: "send_attempt_init_failed",
          message: "Failed to initialize send attempt.",
        },
        { status: 500 },
      );
    }

    const { data: existingAttempt } = await supabase
      .from("outreach_send_attempts")
      .select("id, status, attempt_count")
      .eq("draft_id", draft.id)
      .eq("firm_id", draft.firm_id)
      .maybeSingle();

    if (!existingAttempt) {
      if (formMode) {
        return NextResponse.redirect(
          new URL(`/outreach?error=${toQueryParam("Failed to acquire send lock")}`, request.url),
        );
      }
      return apiError(
        request,
        {
          code: "send_lock_missing",
          message: "Failed to acquire send lock.",
        },
        { status: 500 },
      );
    }

    sendAttemptId = existingAttempt.id;

    if (existingAttempt.status === "sent") {
      const error = "Draft already sent";
      if (formMode) {
        return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
      }
      return apiError(
        request,
        {
          code: "already_sent",
          message: error,
        },
        { status: 409 },
      );
    }

    if (existingAttempt.status === "sending") {
      const error = "Draft send already in progress";
      if (formMode) {
        return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
      }
      return apiError(
        request,
        {
          code: "send_in_progress",
          message: error,
        },
        { status: 409 },
      );
    }

    const { data: retryAttempt } = await supabase
      .from("outreach_send_attempts")
      .update({
        status: "sending",
        attempt_count: Math.max(1, Number(existingAttempt.attempt_count ?? 0)) + 1,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", existingAttempt.id)
      .eq("firm_id", draft.firm_id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();

    if (!retryAttempt) {
      const error = "Draft send already in progress";
      if (formMode) {
        return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
      }
      return apiError(
        request,
        {
          code: "send_in_progress",
          message: error,
        },
        { status: 409 },
      );
    }
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, primary_contact_email")
    .eq("id", draft.prospect_id)
    .eq("firm_id", draft.firm_id)
    .maybeSingle();

  if (!prospect?.primary_contact_email) {
    const error = "Prospect contact email missing";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "missing_contact_email",
        message: error,
      },
      { status: 400 },
    );
  }

  const provider = detectConnectedMailProvider(user.app_metadata);
  if (!provider) {
    const error = "Connect Google or Microsoft OAuth before sending";
    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(error)}`, request.url));
    }
    return apiError(
      request,
      {
        code: "provider_not_connected",
        message: error,
      },
      { status: 400 },
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const providerToken = session?.provider_token ?? null;
  const fromEmail = user.email ?? "unknown@inhumans.io";
  const sentAtIso = new Date().toISOString();

  const agentRunId = await startAgentRun({
    supabase,
    firmId: draft.firm_id,
    runType: "outreach_send",
    requestedBy: user.id,
    correlationId: draft.id,
    metadata: {
      draft_id: draft.id,
      prospect_id: draft.prospect_id,
    },
  });
  const mailboxStepId = await startAgentStep({
    supabase,
    firmId: draft.firm_id,
    runId: agentRunId,
    stepName: "mailbox_send",
    inputPayload: {
      provider,
      draft_id: draft.id,
      to_domain: prospect.primary_contact_email.split("@")[1] ?? "unknown",
    },
  });

  try {
    const sendStartedAt = Date.now();
    await recordAgentToolCall({
      supabase,
      firmId: draft.firm_id,
      runId: agentRunId,
      stepId: mailboxStepId,
      toolName: `mailbox_${provider}`,
      status: "started",
      requestPayload: {
        draft_id: draft.id,
      },
    });

    const sendResult = await sendApprovedDraftViaMailbox({
      provider,
      providerToken,
      fromEmail,
      toEmail: prospect.primary_contact_email,
      subject: draft.subject,
      body: draft.body,
    });

    await recordAgentToolCall({
      supabase,
      firmId: draft.firm_id,
      runId: agentRunId,
      stepId: mailboxStepId,
      toolName: `mailbox_${provider}`,
      status: "completed",
      durationMs: Date.now() - sendStartedAt,
      responsePayload: {
        message_id: sendResult.messageId,
        simulated: sendResult.simulated,
      },
    });

    await supabase
      .from("outreach_drafts")
      .update({
        status: "sent",
        sent_at: sentAtIso,
      })
      .eq("id", draft.id)
      .eq("firm_id", draft.firm_id)
      .is("sent_at", null);

    await supabase
      .from("outreach_send_attempts")
      .update({
        status: "sent",
        provider,
        provider_message_id: sendResult.messageId,
        sent_at: sentAtIso,
      })
      .eq("id", sendAttemptId)
      .eq("firm_id", draft.firm_id);

    const nextFollowUpAt = computeNextFollowUpAt("sent", new Date(sentAtIso));
    await supabase
      .from("prospects")
      .update({
        pipeline_stage: "sent",
        last_contacted_at: sentAtIso,
        next_follow_up_at: nextFollowUpAt,
      })
      .eq("id", draft.prospect_id)
      .eq("firm_id", draft.firm_id);

    const { data: sentProspect } = await supabase
      .from("prospects")
      .select("id, company_name, primary_contact_name")
      .eq("id", draft.prospect_id)
      .eq("firm_id", draft.firm_id)
      .maybeSingle();

    if (sentProspect && nextFollowUpAt) {
      const suggestion = buildFollowUpSuggestion({
        companyName: sentProspect.company_name,
        stage: "sent",
        contactName: sentProspect.primary_contact_name,
      });

      const { error: followUpInsertError } = await supabase
        .from("follow_up_tasks")
        .insert({
          firm_id: draft.firm_id,
          prospect_id: draft.prospect_id,
          stage: "sent",
          due_at: nextFollowUpAt,
          subject: suggestion.subject,
          body: suggestion.body,
          status: "pending",
          created_by: user.id,
        });

      if (followUpInsertError && followUpInsertError.code !== "23505") {
        logResearchEvent("follow_up_task_insert_failed", {
          firm_id: draft.firm_id,
          prospect_id: draft.prospect_id,
          error: followUpInsertError.message,
        });
      }
    }

    await supabase.from("outreach_events").insert({
      firm_id: draft.firm_id,
      prospect_id: draft.prospect_id,
      draft_id: draft.id,
      action_type: "sent",
      actor_id: user.id,
      metadata: {
        provider,
        message_id: sendResult.messageId,
        simulated: sendResult.simulated,
      },
    });

    logResearchEvent("outreach_draft_sent", {
      firm_id: draft.firm_id,
      draft_id: draft.id,
      provider,
      simulated: sendResult.simulated,
    });

    await completeAgentStep({
      supabase,
      firmId: draft.firm_id,
      stepId: mailboxStepId,
      status: "completed",
      outputPayload: {
        provider,
        simulated: sendResult.simulated,
      },
    });
    await completeAgentRun({
      supabase,
      firmId: draft.firm_id,
      runId: agentRunId,
      status: "completed",
      metadata: {
        draft_id: draft.id,
        provider,
      },
    });

    if (formMode) {
      const message = sendResult.simulated
        ? "Draft marked sent (simulation mode)"
        : "Draft sent from connected mailbox";
      return NextResponse.redirect(new URL(`/outreach?message=${toQueryParam(message)}`, request.url));
    }

    return apiSuccess(request, {
      draft_id: draft.id,
      sent: true,
      simulated: sendResult.simulated,
      provider,
    });
  } catch (error) {
    const sendError =
      error instanceof OutreachSendError
        ? error
        : new OutreachSendError("unknown_send_failure", "Send failed");
    const message = sendError.message;
    logResearchEvent("outreach_draft_send_error", {
      firm_id: draft.firm_id,
      draft_id: draft.id,
      error: message,
      error_code: sendError.code,
      reauth_required: sendError.reauthRequired,
    });

    await recordAgentToolCall({
      supabase,
      firmId: draft.firm_id,
      runId: agentRunId,
      stepId: mailboxStepId,
      toolName: `mailbox_${provider}`,
      status: "failed",
      errorMessage: message,
    });
    await completeAgentStep({
      supabase,
      firmId: draft.firm_id,
      stepId: mailboxStepId,
      status: "failed",
      errorMessage: message,
    });
    await completeAgentRun({
      supabase,
      firmId: draft.firm_id,
      runId: agentRunId,
      status: "failed",
      metadata: {
        draft_id: draft.id,
        error_code: sendError.code,
      },
    });

    await supabase
      .from("outreach_send_attempts")
      .update({
        status: "failed",
        last_error_code: sendError.code,
        last_error_message: message,
      })
      .eq("id", sendAttemptId)
      .eq("firm_id", draft.firm_id);

    if (formMode) {
      return NextResponse.redirect(new URL(`/outreach?error=${toQueryParam(message)}`, request.url));
    }
    return apiError(
      request,
      {
        code: sendError.code,
        message,
        details: {
          reauth_required: sendError.reauthRequired,
        },
      },
      { status: sendError.status },
    );
  }
}
