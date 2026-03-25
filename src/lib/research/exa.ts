import "server-only";
import { fetchWithRetry } from "./http";

export type ExaSignal = {
  type: string;
  source_url: string;
  title: string;
  description: string;
  relevance_score: number;
  metadata?: Record<string, any>;
};

export type ProspectForExa = {
  company_name: string;
  domain: string | null;
  primary_contact_title: string | null;
};

function classifySignalType(content: string): string {
  content = content.toLowerCase();
  if (content.includes("bankruptcy") || content.includes("insolvent") || content.includes("chapter 11")) return "bankruptcy_signal";
  if (content.includes("layoff") || content.includes("redundancy") || content.includes("job cuts") || content.includes("downsizing")) return "layoff_signal";
  if (content.includes("funding") || content.includes("raised") || content.includes("series") || content.includes("investment")) return "funding_event";
  if (content.includes("hiring") || content.includes("jobs") || content.includes("career")) return "hiring_signal";
  if (content.includes("expansion") || content.includes("new office") || content.includes("launched")) return "expansion_signal";
  if (content.includes("litigation") || content.includes("lawsuit") || content.includes("legal action") || content.includes("court")) return "legal_risk_signal";
  if (content.includes("acquisition") || content.includes("merger") || content.includes("bought") || content.includes("m&a")) return "mna_signal";
  if (content.includes("partnership") || content.includes("collaboration") || content.includes("joint venture")) return "partnership_signal";
  return "market_activity";
}

export async function fetchExaSearchSignals(prospect: ProspectForExa) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is not configured");

  const query = `Latest company news, funding, hiring, or product updates for ${prospect.company_name} ${
    prospect.domain ? `(${prospect.domain})` : ""
  }`;

  const response = await fetchWithRetry("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      useAutoprompt: true,
      numResults: 5,
      startPublishedDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  }, { timeoutMs: 30000 });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Exa API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const signals: ExaSignal[] = (data.results || []).map((result: any) => ({
    type: classifySignalType(result.title + " " + (result.snippet || "")),
    source_url: result.url,
    title: result.title,
    description: result.text || result.snippet || "",
    relevance_score: result.score || 0.5,
    metadata: {
      published_date: result.publishedDate,
      author: result.author,
    },
  }));

  return {
    query,
    results: data.results,
    signals,
  };
}

export async function fetchExaWebsiteSignals(params: { domain: string | null }) {
  const { domain } = params;
  if (!domain) return { signals: [], source_url: null };

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is not configured");

  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const response = await fetchWithRetry("https://api.exa.ai/contents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      urls: [url],
      text: true,
    }),
  }, { timeoutMs: 30000 });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Exa Contents Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const results = data.results || [];
  
  const signals: ExaSignal[] = results.map((res: any) => ({
    type: "website_content",
    source_url: res.url,
    title: res.title || "Website Content",
    description: (res.text || "").slice(0, 1000),
    relevance_score: 1.0,
    metadata: {
      author: res.author,
    },
  }));

  return {
    source_url: url,
    signals,
  };
}
