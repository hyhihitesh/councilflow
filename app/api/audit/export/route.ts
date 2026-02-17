import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { recordsToCsv } from "@/lib/audit/export";
import { resolveFirmContext } from "@/lib/auth/firm-context";
import { createClient } from "@/lib/supabase/server";

type ExportFormat = "json" | "csv";

function parseFormat(value: string | null): ExportFormat {
  if (value?.toLowerCase() === "csv") return "csv";
  return "json";
}

function parseDays(value: string | null) {
  const parsed = Number(value ?? "30");
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(365, Math.floor(parsed)));
}

const querySchema = z.object({
  format: z.enum(["json", "csv"]).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  firm_id: z.string().trim().optional(),
});

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const queryParsed = querySchema.safeParse({
    format: url.searchParams.get("format")?.toLowerCase() ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
    firm_id: url.searchParams.get("firm_id") ?? undefined,
  });
  if (!queryParsed.success) {
    return apiError(
      request,
      {
        code: "invalid_query",
        message: formatZodError(queryParsed.error),
      },
      { status: 400 },
    );
  }

  const format = parseFormat(queryParsed.data.format ?? null);
  const days = parseDays(String(queryParsed.data.days ?? 30));
  const preferredFirmId = queryParsed.data.firm_id ?? null;

  const firmContext = await resolveFirmContext({
    supabase,
    userId: user.id,
    preferredFirmId,
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

  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
  const sinceIso = sinceDate.toISOString();

  const [
    agentRunsResult,
    agentStepsResult,
    agentToolCallsResult,
    outreachEventsResult,
    followUpTasksResult,
    contentDraftsResult,
  ] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id, run_type, status, requested_by, started_at, completed_at, created_at")
      .eq("firm_id", firmContext.firmId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("agent_steps")
      .select("id, run_id, step_name, status, error_message, started_at, completed_at, created_at")
      .eq("firm_id", firmContext.firmId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("agent_tool_calls")
      .select("id, run_id, step_id, tool_name, status, duration_ms, error_message, created_at")
      .eq("firm_id", firmContext.firmId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("outreach_events")
      .select("id, action_type, prospect_id, actor_id, created_at")
      .eq("firm_id", firmContext.firmId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("follow_up_tasks")
      .select("id, prospect_id, stage, status, due_at, completed_at, created_at")
      .eq("firm_id", firmContext.firmId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("content_drafts")
      .select("id, channel, status, version, approved_at, published_at, created_at")
      .eq("firm_id", firmContext.firmId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  const queryErrors = [
    agentRunsResult.error,
    agentStepsResult.error,
    agentToolCallsResult.error,
    outreachEventsResult.error,
    followUpTasksResult.error,
    contentDraftsResult.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    return apiError(
      request,
      {
        code: "audit_query_failed",
        message: queryErrors[0]?.message ?? "Failed to load audit data.",
      },
      { status: 500 },
    );
  }

  const exportedAt = new Date().toISOString();

  const records: Array<Record<string, unknown>> = [
    ...(agentRunsResult.data ?? []).map((row) => ({ source: "agent_runs", ...row })),
    ...(agentStepsResult.data ?? []).map((row) => ({ source: "agent_steps", ...row })),
    ...(agentToolCallsResult.data ?? []).map((row) => ({ source: "agent_tool_calls", ...row })),
    ...(outreachEventsResult.data ?? []).map((row) => ({ source: "outreach_events", ...row })),
    ...(followUpTasksResult.data ?? []).map((row) => ({ source: "follow_up_tasks", ...row })),
    ...(contentDraftsResult.data ?? []).map((row) => ({ source: "content_drafts", ...row })),
  ].sort((a, b) => {
    const aTs = Date.parse(String(a.created_at ?? ""));
    const bTs = Date.parse(String(b.created_at ?? ""));
    return bTs - aTs;
  });

  if (format === "csv") {
    const csv = recordsToCsv(records);
    const response = new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=\"inhumans-io-audit-${firmContext.firmId}-${days}d.csv\"`,
      },
    });
    return response;
  }

  return apiSuccess(request, {
    exported_at: exportedAt,
    firm_id: firmContext.firmId,
    period_days: days,
    record_count: records.length,
    records,
  });
}
