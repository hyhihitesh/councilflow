import { fetchWithTimeout } from "@/lib/research/http";

type PolarServer = "sandbox" | "production";

function parseJsonSafe(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractErrorMessage(raw: string) {
  const parsed = parseJsonSafe(raw);
  const message =
    (typeof parsed?.error === "string" && parsed.error) ||
    (typeof parsed?.message === "string" && parsed.message) ||
    (typeof parsed?.detail === "string" && parsed.detail);
  if (message) return message;
  return raw.slice(0, 220) || "Unknown Polar API error";
}

export function getPolarServer(): PolarServer {
  return (process.env.POLAR_SERVER ?? "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

export function getPolarApiBaseUrl(server: PolarServer) {
  return server === "production" ? "https://api.polar.sh/v1" : "https://sandbox-api.polar.sh/v1";
}

function getPolarAccessToken() {
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("POLAR_ACCESS_TOKEN is not configured.");
  return token;
}

function getBillingTimeoutMs() {
  const timeoutMs = Number(process.env.BILLING_PROVIDER_TIMEOUT_MS ?? "12000");
  if (!Number.isFinite(timeoutMs)) return 12000;
  return Math.max(1000, Math.min(30000, timeoutMs));
}

export async function createPolarCheckoutSession(input: {
  productId: string;
  externalCustomerId: string;
  customerEmail?: string | null;
  customerName?: string | null;
  successUrl: string;
  returnUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const server = getPolarServer();
  const baseUrl = getPolarApiBaseUrl(server);
  const accessToken = getPolarAccessToken();

  const response = await fetchWithTimeout(
    `${baseUrl}/checkouts/`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        products: [input.productId],
        external_customer_id: input.externalCustomerId,
        customer_email: input.customerEmail ?? undefined,
        customer_name: input.customerName ?? undefined,
        success_url: input.successUrl,
        return_url: input.returnUrl,
        metadata: input.metadata ?? {},
      }),
    },
    getBillingTimeoutMs(),
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Polar checkout session failed: ${extractErrorMessage(raw)}`);
  }

  const payload = parseJsonSafe(raw);
  const url = typeof payload?.url === "string" ? payload.url : null;
  if (!url) throw new Error("Polar checkout URL missing in response.");
  return { url };
}

export async function createPolarCustomerSession(input: {
  customerId?: string | null;
  externalCustomerId?: string | null;
}) {
  const server = getPolarServer();
  const baseUrl = getPolarApiBaseUrl(server);
  const accessToken = getPolarAccessToken();

  const body =
    input.customerId && input.customerId.trim()
      ? { customer_id: input.customerId.trim() }
      : input.externalCustomerId && input.externalCustomerId.trim()
        ? { external_customer_id: input.externalCustomerId.trim() }
        : null;

  if (!body) {
    throw new Error("Missing customer reference for Polar customer session.");
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/customer-sessions/`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    getBillingTimeoutMs(),
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Polar customer session failed: ${extractErrorMessage(raw)}`);
  }

  const payload = parseJsonSafe(raw);
  const portalUrl = typeof payload?.customer_portal_url === "string" ? payload.customer_portal_url : null;
  if (!portalUrl) throw new Error("Polar customer portal URL missing in response.");
  return { customerPortalUrl: portalUrl };
}
