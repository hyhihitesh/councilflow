import { createGateway, streamText, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateOutreachDrafts } from "@/lib/outreach/writer";
import { executeResearchRun } from "@/lib/research/run-executor";

export const maxDuration = 60;

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

const AGENT_MODEL = process.env.AI_AGENT_MODEL ?? "openai/gpt-4o";

// ---------------------------------------------------------------------------
// Rate limiting — uses Upstash if env vars are set, no-op otherwise (safe for dev)
// ---------------------------------------------------------------------------
type RateLimiter = { limit: (key: string) => Promise<{ success: boolean }> };
let ratelimiter: RateLimiter | null = null;

async function getRateLimiter(): Promise<RateLimiter> {
  if (ratelimiter) return ratelimiter;
  let limiter: RateLimiter;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis } = await import("@upstash/redis");
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "1 m"), // 20 AI calls per user per minute
      analytics: true,
    });
  } else {
    // No-op fallback for dev/environments without Upstash
    limiter = { limit: async () => ({ success: true }) };
  }
  ratelimiter = limiter;
  return limiter;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Rate limit: 20 AI requests per user per minute
  const rl = await getRateLimiter();
  const { success: withinLimit } = await rl.limit(user.id);
  if (!withinLimit) {
    return new Response("Too many requests — please wait a moment.", { status: 429 });
  }

  const { data: membership } = await supabase
    .from("firm_memberships")
    .select("firm_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const firmId = membership?.firm_id ?? null;

  // Keep last 20 turns to prevent context overflow on long sessions
  const { messages }: { messages: UIMessage[] } = await req.json();
  const trimmedMessages = messages.slice(-20);

  const result = streamText({
    model: gateway(AGENT_MODEL),
    providerOptions: {
      gateway: { caching: "auto" }, // AI Gateway prompt caching (60-80% cost reduction)
    },
    system: `You are CouncilFlow's AI assistant — an intelligent business development agent for law firms.

You have access to this firm's data and can take actions on their behalf. Always be concise, professional, and actionable.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

When users ask questions, use the available tools to get real data. When asked to take actions (draft outreach, move pipeline stages, trigger research), execute them directly and confirm completion.

Tone: Professional, confident, concise. Think like a senior legal business development consultant.`,
    messages: await convertToModelMessages(trimmedMessages),
    onFinish({ usage, finishReason }) {
      // Log token usage for cost monitoring — field names vary by SDK version
      const u = usage as unknown as Record<string, number | undefined>;
      const inp = u.inputTokens ?? u.promptTokens ?? 0;
      const out = u.outputTokens ?? u.completionTokens ?? 0;
      console.log(`[agent] tokens: ${inp}→${out} finish=${finishReason}`);
    },
    tools: {
      listProspects: {
        description: "List the firm's prospects from the database. Can filter by status or search by company name.",
        inputSchema: z.object({
          status: z
            .enum(["new", "enriched", "qualified", "contacted", "negotiation", "won", "lost", "archived"])
            .optional()
            .describe("Filter by prospect status"),
          search: z.string().optional().describe("Search by company name"),
          limit: z.number().min(1).max(20).default(10).describe("Number of results"),
        }),
        execute: async ({ status, search, limit }: { status?: string; search?: string; limit: number }) => {
          if (!firmId) return { error: "No firm membership found" };
          let query = supabase
            .from("prospects")
            .select("id, company_name, domain, status, fit_score, primary_contact_name, primary_contact_title")
            .eq("firm_id", firmId)
            .order("updated_at", { ascending: false })
            .limit(limit);
          if (status) query = query.eq("status", status);
          if (search) query = query.ilike("company_name", `%${search}%`);
          const { data, error } = await query;
          if (error) return { error: error.message };
          return { prospects: data ?? [], count: data?.length ?? 0 };
        },
      },

      getMetrics: {
        description: "Get aggregated dashboard metrics for the firm.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!firmId) return { error: "No firm membership found" };
          const [prospectsRes, outreachRes, membersRes] = await Promise.all([
            supabase.from("prospects").select("status", { count: "exact" }).eq("firm_id", firmId).neq("status", "archived"),
            supabase.from("outreach_drafts").select("status", { count: "exact" }).eq("firm_id", firmId),
            supabase.from("firm_memberships").select("id", { count: "exact" }).eq("firm_id", firmId),
          ]);
          return {
            total_prospects: prospectsRes.count ?? 0,
            total_outreach: outreachRes.count ?? 0,
            total_members: membersRes.count ?? 0,
          };
        },
      },

      runResearch: {
        description: "Trigger Exa + Vibe research enrichment for a specific prospect.",
        inputSchema: z.object({
          prospect_id: z.string().describe("The UUID of the prospect to research"),
          company_name: z.string().describe("Company name for confirmation"),
        }),
        execute: async ({ prospect_id, company_name }: { prospect_id: string; company_name: string }) => {
          if (!firmId) return { error: "No firm membership found" };
          try {
            // Direct import — avoids HTTP self-call, faster and more reliable
            const result = await executeResearchRun({
              supabase,
              firmId,
              requestedBy: user.id,
              prospectId: prospect_id,
              retryRunId: "",
              limit: 1,
              requireMemberUserId: user.id,
              triggerType: "manual",
              maxRetryCount: 2,
            });
            return {
              success: result.ok,
              company_name,
              message: result.ok
                ? `Research completed for ${company_name} — ${result.succeededProspects}/${result.totalProspects} succeeded`
                : `Research failed: ${result.ok ? "" : (result as { error?: string }).error ?? "unknown"}`,
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : `Failed to trigger research for ${company_name}` };
          }
        },
      },

      draftOutreach: {
        description: "Generate 3 personalized outreach email drafts (direct, warm, content_led) for a prospect.",
        inputSchema: z.object({
          company_name: z.string(),
          domain: z.string().nullable().optional(),
          primary_contact_name: z.string().nullable().optional(),
          primary_contact_title: z.string().nullable().optional(),
          prospect_id: z.string().optional().describe("If provided, saves the drafts to the database"),
        }),
        execute: async ({
          company_name,
          domain,
          primary_contact_name,
          primary_contact_title,
          prospect_id,
        }: {
          company_name: string;
          domain?: string | null;
          primary_contact_name?: string | null;
          primary_contact_title?: string | null;
          prospect_id?: string;
        }) => {
          if (!firmId) return { error: "No firm membership found" };
          try {
            const drafts = await generateOutreachDrafts({
              company_name,
              domain: domain ?? null,
              primary_contact_name: primary_contact_name ?? null,
              primary_contact_title: primary_contact_title ?? null,
            });
            if (prospect_id && drafts.length > 0) {
              await supabase.from("outreach_drafts").insert(
                drafts.map((d) => ({
                  firm_id: firmId,
                  prospect_id,
                  variant: d.variant,
                  subject: d.subject,
                  body: d.body,
                  status: "draft",
                  ai_voice_score: d.voice_score,
                  created_by: user.id,
                })),
              );
            }
            return {
              company_name,
              saved_to_db: !!prospect_id,
              drafts: drafts.map((d) => ({
                variant: d.variant,
                subject: d.subject,
                preview: d.body.slice(0, 120) + "...",
                voice_score: d.voice_score,
              })),
            };
          } catch (error) {
            return { error: error instanceof Error ? error.message : "Draft generation failed" };
          }
        },
      },

      movePipelineStage: {
        description: "Move a prospect to a different pipeline stage.",
        inputSchema: z.object({
          prospect_id: z.string(),
          company_name: z.string(),
          new_stage: z.enum(["new", "enriched", "qualified", "contacted", "negotiation", "won", "lost"]),
        }),
        execute: async ({ prospect_id, company_name, new_stage }: { prospect_id: string; company_name: string; new_stage: string }) => {
          if (!firmId) return { error: "No firm membership found" };
          const { error } = await supabase
            .from("prospects")
            .update({ status: new_stage, updated_at: new Date().toISOString() })
            .eq("id", prospect_id)
            .eq("firm_id", firmId);
          if (error) return { error: error.message };
          return { success: true, company_name, new_stage, message: `${company_name} moved to "${new_stage}"` };
        },
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
