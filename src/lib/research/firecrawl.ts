import { fetchWithTimeout } from "@/lib/research/http";

export type ProspectForFirecrawl = {
  company_name: string;
  domain: string | null;
};

export type FirecrawlSignal = {
  signal_type: string;
  signal_source: "firecrawl";
  signal_strength: number;
  summary: string;
  payload: Record<string, unknown>;
  occurred_at: string | null;
};

type FirecrawlResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  };
};

function toCompanyUrl(domain: string) {
  const normalized = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return `https://${normalized}`;
}

function clamp(value: number) {
  return Math.max(10, Math.min(95, Math.round(value)));
}

function classifySignalType(text: string) {
  const value = text.toLowerCase();
  if (value.includes("funding") || value.includes("series a") || value.includes("series b")) {
    return "funding_event";
  }
  if (value.includes("hiring") || value.includes("careers") || value.includes("join our team")) {
    return "hiring_signal";
  }
  if (value.includes("security") || value.includes("compliance") || value.includes("privacy")) {
    return "compliance_signal";
  }
  if (value.includes("acquisition") || value.includes("merger")) {
    return "mna_signal";
  }
  if (value.includes("expansion") || value.includes("new office")) {
    return "expansion_signal";
  }
  return "website_change_signal";
}

export function extractSignalsFromMarkdown(markdown: string, sourceUrl: string) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 30);

  const unique = new Set<string>();
  const signals: FirecrawlSignal[] = [];

  for (const line of lines) {
    const lowered = line.toLowerCase();
    const hasKeyword =
      lowered.includes("funding") ||
      lowered.includes("hiring") ||
      lowered.includes("compliance") ||
      lowered.includes("security") ||
      lowered.includes("privacy") ||
      lowered.includes("acquisition") ||
      lowered.includes("expansion") ||
      lowered.includes("partnership");

    if (!hasKeyword) continue;

    const summary = line.slice(0, 700);
    const key = summary.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);

    const keywordHits = [
      "funding",
      "hiring",
      "compliance",
      "security",
      "privacy",
      "acquisition",
      "expansion",
      "partnership",
    ].filter((keyword) => lowered.includes(keyword)).length;

    signals.push({
      signal_type: classifySignalType(summary),
      signal_source: "firecrawl",
      signal_strength: clamp(45 + keywordHits * 10),
      summary,
      payload: {
        source_url: sourceUrl,
      },
      occurred_at: null,
    });
  }

  return signals.slice(0, 8);
}

export async function fetchFirecrawlCompanySignals(prospect: ProspectForFirecrawl) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FIRECRAWL_API_KEY");
  }

  if (!prospect.domain) {
    throw new Error("Prospect domain is required for Firecrawl enrichment");
  }

  const companyUrl = toCompanyUrl(prospect.domain);

  const timeoutMs = Math.max(1000, Number(process.env.RESEARCH_PROVIDER_TIMEOUT_MS ?? "12000"));

  const response = await fetchWithTimeout("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: companyUrl,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl request failed (${response.status}): ${text.slice(0, 220)}`);
  }

  const payload = (await response.json()) as FirecrawlResponse;
  const markdown = payload.data?.markdown ?? payload.data?.content ?? "";
  const signals = extractSignalsFromMarkdown(markdown, companyUrl);

  return {
    source_url: companyUrl,
    signal_count: signals.length,
    signals,
    raw: payload,
  };
}
