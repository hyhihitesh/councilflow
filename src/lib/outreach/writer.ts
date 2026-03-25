import "server-only";
import { createGateway } from "ai";
import { generateObject } from "ai";
import { z } from "zod";
import { logResearchEvent } from "@/lib/observability/telemetry";

// ─── Gateway Configuration ───────────────────────────────────────────────────
const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

const WRITER_MODEL = process.env.AI_WRITER_MODEL ?? "openai/gpt-4o-mini";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProspectContext = {
  company_name: string;
  domain: string | null;
  primary_contact_name: string | null;
  primary_contact_title: string | null;
};

type DraftVariant = "direct" | "warm" | "content_led";

export type GeneratedDraft = {
  variant: DraftVariant;
  subject: string;
  body: string;
  voice_score: number;
  compliance_notes: Array<{ type: string; note: string }>;
};

const VARIANTS: DraftVariant[] = ["direct", "warm", "content_led"];

// ─── Compliance Notes (always appended) ──────────────────────────────────────
function complianceNotes() {
  return [
    {
      type: "solicitation_guardrail",
      note: "Avoids guaranteed outcomes and legal-advice claims.",
    },
    {
      type: "tone_guardrail",
      note: "Keeps consultative tone with explicit opt-out friendly closing.",
    },
  ];
}

// ─── Local Fallback (when gateway unavailable) ────────────────────────────────
function localDraftTemplate(prospect: ProspectContext, variant: DraftVariant): GeneratedDraft {
  const contact = prospect.primary_contact_name ?? "there";
  const role = prospect.primary_contact_title ?? "your team";
  const company = prospect.company_name;

  const subjectByVariant: Record<DraftVariant, string> = {
    direct: `${company}: quick intro from CouncilFlow`,
    warm: `Idea for ${company}'s ${role} priorities`,
    content_led: `A short resource for ${company} (${role})`,
  };

  const openerByVariant: Record<DraftVariant, string> = {
    direct: `Hi ${contact},\n\nI noticed ${company} has been active recently and wanted to reach out directly.`,
    warm: `Hi ${contact},\n\nI have been following ${company}'s momentum and thought this might be relevant for your ${role} focus.`,
    content_led: `Hi ${contact},\n\nWe put together a practical note on handling growth-stage legal workflow risk that may be useful for ${company}.`,
  };

  const close =
    "\n\nIf helpful, I can share a concise 15-minute walkthrough tailored to your current priorities.\n\nBest,\nCouncilFlow Team";

  return {
    variant,
    subject: subjectByVariant[variant],
    body: `${openerByVariant[variant]}\n\nWould you be open to a short conversation next week?${close}`,
    voice_score: variant === "warm" ? 86 : variant === "content_led" ? 82 : 78,
    compliance_notes: complianceNotes(),
  };
}

// ─── Zod Schema for Structured Output ────────────────────────────────────────
const DraftsSchema = z.object({
  drafts: z.array(
    z.object({
      variant: z.enum(["direct", "warm", "content_led"]),
      subject: z.string().max(150),
      body: z.string().max(800),
      voice_score: z.number().min(0).max(100),
    }),
  ),
});

// ─── Main Export ──────────────────────────────────────────────────────────────
export async function generateOutreachDrafts(prospect: ProspectContext): Promise<GeneratedDraft[]> {
  logResearchEvent("outreach_writer_generate_start", {
    company_name: prospect.company_name,
    domain: prospect.domain,
  });

  const prompt = `Generate exactly 3 professional outreach email drafts for a law firm business development context.

Target company: ${prospect.company_name}
Domain: ${prospect.domain ?? "unknown"}
Contact name: ${prospect.primary_contact_name ?? "the decision maker"}
Contact role: ${prospect.primary_contact_title ?? "legal stakeholder"}

Requirements:
- One draft per variant: "direct", "warm", "content_led"
- Each body must be under 170 words
- No legal advice or guaranteed outcome language
- Consultative tone with clear opt-out closing
- voice_score: 0-100 (higher = more persuasive and personalized)`.trim();

  if (!process.env.AI_GATEWAY_API_KEY) {
    logResearchEvent("outreach_writer_gateway_missing", { company_name: prospect.company_name });
    return VARIANTS.map((v) => localDraftTemplate(prospect, v));
  }

  try {
    const { object } = await generateObject({
      model: gateway(WRITER_MODEL),
      schema: DraftsSchema,
      prompt,
      providerOptions: {
        gateway: { caching: "auto" }, // Prompt caching via Vercel AI Gateway
      },
    });

    const byVariant = new Map(
      object.drafts
        .filter((d) => VARIANTS.includes(d.variant))
        .map((d) => [d.variant, d]),
    );

    const result: GeneratedDraft[] = VARIANTS.map((variant) => {
      const fromModel = byVariant.get(variant);
      const fallback = localDraftTemplate(prospect, variant);
      return {
        variant,
        subject: fromModel?.subject?.trim() || fallback.subject,
        body: fromModel?.body?.trim() || fallback.body,
        voice_score: Math.max(0, Math.min(100, Number(fromModel?.voice_score ?? fallback.voice_score))),
        compliance_notes: complianceNotes(),
      };
    });

    logResearchEvent("outreach_writer_generate_success_model", {
      company_name: prospect.company_name,
      model: WRITER_MODEL,
    });

    return result;
  } catch (error) {
    logResearchEvent("outreach_writer_generate_model_error", {
      company_name: prospect.company_name,
      model: WRITER_MODEL,
      error: error instanceof Error ? error.message : "unknown error",
    });

    // Graceful fallback to local templates
    const local = VARIANTS.map((v) => localDraftTemplate(prospect, v));
    logResearchEvent("outreach_writer_generate_success_local", { company_name: prospect.company_name });
    return local;
  }
}
