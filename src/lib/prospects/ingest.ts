export type ManualProspectInput = {
  company_name?: string | null;
  domain?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_title?: string | null;
  linkedin_url?: string | null;
  source?: string | null;
};

export type NormalizedProspect = {
  company_name: string;
  domain: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_title: string | null;
  linkedin_url: string | null;
  source: string;
};

function trimOrNull(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeDomain(input: string | null | undefined) {
  const raw = trimOrNull(input);
  if (!raw) return null;

  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const normalized = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return normalized || null;
  } catch {
    return raw.toLowerCase().replace(/^www\./, "");
  }
}

export function normalizeEmail(input: string | null | undefined) {
  const raw = trimOrNull(input);
  if (!raw) return null;
  return raw.toLowerCase();
}

export function buildProspectDedupKey(input: {
  domain: string | null;
  primary_contact_email: string | null;
  company_name: string;
}) {
  if (input.domain) return `domain:${input.domain}`;
  if (input.primary_contact_email) return `email:${input.primary_contact_email}`;
  return `company:${input.company_name.toLowerCase()}`;
}

export function normalizeManualProspect(input: ManualProspectInput) {
  const companyName = trimOrNull(input.company_name);
  const domain = normalizeDomain(input.domain);
  const primaryContactEmail = normalizeEmail(input.primary_contact_email);
  const source = trimOrNull(input.source)?.toLowerCase() ?? "manual";

  if (!companyName) {
    return { error: "company_name is required" } as const;
  }

  if (!domain && !primaryContactEmail) {
    return { error: "domain or primary_contact_email is required for dedupe" } as const;
  }

  const normalized: NormalizedProspect = {
    company_name: companyName,
    domain,
    primary_contact_name: trimOrNull(input.primary_contact_name),
    primary_contact_email: primaryContactEmail,
    primary_contact_title: trimOrNull(input.primary_contact_title),
    linkedin_url: trimOrNull(input.linkedin_url),
    source,
  };

  return { data: normalized } as const;
}
