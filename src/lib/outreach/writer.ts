import { logResearchEvent } from "@/lib/observability/telemetry";
import { fetchWithTimeout } from "@/lib/research/http";

type ProspectContext = {
  company_name: string;
  domain: string | null;
  primary_contact_name: string | null;
  primary_contact_title: string | null;
};

type DraftVariant = "direct" | "warm" | "content_led";
type WriterProvider = "openai" | "anthropic" | "gemini";

export type GeneratedDraft = {
  variant: DraftVariant;
  subject: string;
  body: string;
  voice_score: number;
  compliance_notes: Array<{ type: string; note: string }>;
};

const VARIANTS: DraftVariant[] = ["direct", "warm", "content_led"];

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

type ClaudeResult = {
  drafts?: Array<{
    variant?: DraftVariant;
    subject?: string;
    body?: string;
    voice_score?: number;
  }>;
};

type OpenAIResult = ClaudeResult;

function stripMarkdownCodeFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  const withoutStart = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

function parseDraftsFromModelText(text: string) {
  const normalized = stripMarkdownCodeFence(text);
  if (!normalized) return null;

  try {
    const parsed = JSON.parse(normalized) as ClaudeResult | OpenAIResult;
    return parsed.drafts ?? null;
  } catch {
    return null;
  }
}

function getWriterProvider(): WriterProvider {
  const value = (process.env.OUTREACH_WRITER_PROVIDER ?? "openai").toLowerCase();
  if (value === "gemini") return "gemini";
  return value === "anthropic" ? "anthropic" : "openai";
}

async function generateWithOpenAI(prospect: ProspectContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = Math.max(1000, Number(process.env.OUTREACH_WRITER_TIMEOUT_MS ?? "15000"));
  const primaryModel = process.env.OPENAI_WRITER_MODEL ?? "gpt-4.1-mini";
  const fallbackModel = process.env.OPENAI_WRITER_FALLBACK_MODEL ?? "gpt-4o-mini";
  const models = Array.from(new Set([primaryModel, fallbackModel].map((model) => model.trim()).filter(Boolean)));

  const prompt = `
Generate exactly 3 outreach drafts in JSON.
Target company: ${prospect.company_name}
Target domain: ${prospect.domain ?? "unknown"}
Contact name: ${prospect.primary_contact_name ?? "there"}
Contact role: ${prospect.primary_contact_title ?? "legal stakeholder"}

Rules:
1) Variants: direct, warm, content_led
2) Keep each body under 170 words
3) No legal advice, no guaranteed outcomes
4) Output valid JSON with key "drafts"
`.trim();

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
        timeoutMs,
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Writer model request failed (${response.status}) [model=${model}]: ${text.slice(0, 220)}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      const drafts = parseDraftsFromModelText(text);
      if (drafts && drafts.length > 0) return drafts;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("unknown OpenAI writer error");
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function generateWithClaude(prospect: ProspectContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = Math.max(1000, Number(process.env.OUTREACH_WRITER_TIMEOUT_MS ?? "15000"));
  const model = process.env.ANTHROPIC_WRITER_MODEL ?? "claude-3-5-sonnet-latest";

  const prompt = `
Generate exactly 3 outreach drafts in JSON.
Target company: ${prospect.company_name}
Target domain: ${prospect.domain ?? "unknown"}
Contact name: ${prospect.primary_contact_name ?? "there"}
Contact role: ${prospect.primary_contact_title ?? "legal stakeholder"}

Rules:
1) Variants: direct, warm, content_led
2) Keep each body under 170 words
3) No legal advice, no guaranteed outcomes
4) Output valid JSON with key "drafts"
`.trim();

  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Writer model request failed (${response.status}): ${text.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = payload.content?.find((item) => item.type === "text")?.text ?? "";
  return parseDraftsFromModelText(text);
}

async function generateWithGemini(prospect: ProspectContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = Math.max(1000, Number(process.env.OUTREACH_WRITER_TIMEOUT_MS ?? "15000"));
  const model = process.env.GEMINI_WRITER_MODEL ?? "gemini-2.5-flash";

  const prompt = `
Generate exactly 3 outreach drafts in JSON.
Target company: ${prospect.company_name}
Target domain: ${prospect.domain ?? "unknown"}
Contact name: ${prospect.primary_contact_name ?? "there"}
Contact role: ${prospect.primary_contact_title ?? "legal stakeholder"}

Rules:
1) Variants: direct, warm, content_led
2) Keep each body under 170 words
3) No legal advice, no guaranteed outcomes
4) Output valid JSON with key "drafts"
`.trim();

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.4
        }
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Writer model request failed (${response.status}): ${text.slice(0, 220)}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  };
  
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseDraftsFromModelText(text);
}

export async function generateOutreachDrafts(prospect: ProspectContext) {
  logResearchEvent("outreach_writer_generate_start", {
    company_name: prospect.company_name,
    domain: prospect.domain,
  });

  try {
    const provider = getWriterProvider();
    let providerDrafts;
    if (provider === "gemini") {
      providerDrafts = await generateWithGemini(prospect);
    } else if (provider === "anthropic") {
      providerDrafts = await generateWithClaude(prospect);
    } else {
      providerDrafts = await generateWithOpenAI(prospect);
    }

    if (providerDrafts && providerDrafts.length > 0) {
      const byVariant = new Map(
        providerDrafts
          .filter((item) => item.variant && VARIANTS.includes(item.variant))
          .map((item) => [item.variant as DraftVariant, item]),
      );

      const generated = VARIANTS.map((variant) => {
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
        provider,
      });
      return generated;
    }
  } catch (error) {
    logResearchEvent("outreach_writer_generate_model_error", {
      company_name: prospect.company_name,
      provider: getWriterProvider(),
      error: error instanceof Error ? error.message : "unknown error",
    });
  }

  const local = VARIANTS.map((variant) => localDraftTemplate(prospect, variant));
  logResearchEvent("outreach_writer_generate_success_local", {
    company_name: prospect.company_name,
  });
  return local;
}
