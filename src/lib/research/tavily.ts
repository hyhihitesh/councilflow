import { fetchWithTimeout } from "@/lib/research/http";

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
};

type TavilySearchResponse = {
  answer?: string;
  results?: TavilySearchResult[];
};

export type ProspectForTavily = {
  company_name: string;
  domain: string | null;
  primary_contact_title: string | null;
};

export type TavilySignal = {
  signal_type: string;
  signal_source: "tavily";
  signal_strength: number;
  summary: string;
  payload: Record<string, unknown>;
  occurred_at: string | null;
};

function clampSignalStrength(value: number) {
  if (Number.isNaN(value)) return 50;
  return Math.max(10, Math.min(95, Math.round(value)));
}

function signalTypeFromText(text: string) {
  const content = text.toLowerCase();
  if (content.includes("funding") || content.includes("raised")) return "funding_event";
  if (content.includes("hiring") || content.includes("job opening")) return "hiring_signal";
  if (content.includes("expansion") || content.includes("new office")) return "expansion_signal";
  if (content.includes("litigation") || content.includes("lawsuit")) return "legal_risk_signal";
  if (content.includes("acquisition") || content.includes("merger")) return "mna_signal";
  return "market_activity";
}

function toDateOrNull(value: string | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

export function buildTavilyQuery(prospect: ProspectForTavily) {
  const parts = [
    `${prospect.company_name} company news`,
    "expansion OR funding OR hiring OR legal",
    "last 90 days",
  ];

  if (prospect.domain) parts.push(`domain:${prospect.domain}`);
  if (prospect.primary_contact_title) {
    parts.push(`leadership role: ${prospect.primary_contact_title}`);
  }

  return parts.join(" ");
}

export function mapTavilyResultsToSignals(results: TavilySearchResult[]) {
  const seen = new Set<string>();
  const signals: TavilySignal[] = [];

  for (const result of results) {
    const title = result.title?.trim() ?? "";
    const content = result.content?.trim() ?? "";
    const url = result.url?.trim() ?? "";

    if (!title && !content) continue;

    const dedupeKey = url || `${title}:${content.slice(0, 80)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const summary = [title, content].filter(Boolean).join(" - ").slice(0, 700);
    const signalStrength = clampSignalStrength((result.score ?? 0.5) * 100);

    signals.push({
      signal_type: signalTypeFromText(`${title} ${content}`),
      signal_source: "tavily",
      signal_strength: signalStrength,
      summary,
      payload: {
        url: url || null,
        title: title || null,
        score: result.score ?? null,
      },
      occurred_at: toDateOrNull(result.published_date),
    });
  }

  return signals;
}

export async function fetchTavilyCompanySignals(
  prospect: ProspectForTavily,
  maxResults = 5,
) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TAVILY_API_KEY");
  }

  const query = buildTavilyQuery(prospect);

  const timeoutMs = Math.max(1000, Number(process.env.RESEARCH_PROVIDER_TIMEOUT_MS ?? "12000"));

  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
      search_depth: "advanced",
    }),
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as TavilySearchResponse;
  const signals = mapTavilyResultsToSignals(payload.results ?? []);

  return {
    query,
    answer: payload.answer ?? null,
    result_count: payload.results?.length ?? 0,
    signals,
    raw: payload,
  };
}
