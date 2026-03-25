import "server-only";
import { fetchWithRetry } from "./http";

export async function fetchVibeEnrichment(params: {
  company_name: string;
  domain: string | null;
}) {
  const { company_name, domain } = params;
  const apiKey = process.env.VIBE_PROSPECTING_API_KEY;

  if (!apiKey) {
    throw new Error("VIBE_PROSPECTING_API_KEY is not configured");
  }

  const response = await fetchWithRetry("https://api.vibeprospecting.com/v1/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      company_name,
      domain,
    }),
  }, { timeoutMs: 30000 });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vibe API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const signals: any[] = [];

  if (data.intent) {
    signals.push({
      type: "intent_signal",
      source_url: "vibe://intent",
      title: `Intent Detected: ${data.intent.topic || "General"}`,
      description: data.intent.description || "High intent signal detected via Vibe Prospecting.",
      relevance_score: data.intent.score || 0.8,
      metadata: data.intent,
    });
  }

  if (data.company) {
    signals.push({
      type: "firmographic_update",
      source_url: "vibe://enrichment",
      title: "Company Intelligence Update",
      description: `Enriched company data for ${data.company.name || company_name}`,
      relevance_score: 1.0,
      metadata: data.company,
    });
  }

  return {
    company: data.company,
    intent: data.intent,
    signals,
  };
}
