import { NextResponse } from "next/server";

import { resolveFirmContext } from "@/lib/auth/firm-context";
import { createPolarCustomerSession } from "@/lib/billing/polar-client";
import { createClient } from "@/lib/supabase/server";

function toQueryParam(value: string) {
  return encodeURIComponent(value);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const redirectToDashboard = (params: { error?: string; message?: string }) => {
    const query = params.error
      ? `error=${toQueryParam(params.error)}`
      : `message=${toQueryParam(params.message ?? "Done.")}`;
    return NextResponse.redirect(new URL(`/dashboard?${query}`, request.url));
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=Please%20sign%20in%20again", request.url),
    );
  }

  const firmContext = await resolveFirmContext({
    supabase,
    userId: user.id,
  });

  if (!firmContext.ok) {
    return redirectToDashboard({ error: firmContext.message });
  }

  if (firmContext.role !== "owner") {
    return redirectToDashboard({
      error: "Only firm owners can access billing portal.",
    });
  }

  const { data: customer, error: customerError } = await supabase
    .from("billing_customers")
    .select("polar_customer_id, external_customer_id")
    .eq("firm_id", firmContext.firmId)
    .maybeSingle();

  if (customerError) {
    return redirectToDashboard({
      error: `Unable to load billing customer: ${customerError.message}`,
    });
  }

  const fallbackExternalId = `firm_${firmContext.firmId}`;
  const externalCustomerId =
    typeof customer?.external_customer_id === "string" && customer.external_customer_id.trim()
      ? customer.external_customer_id.trim()
      : fallbackExternalId;
  const polarCustomerId =
    typeof customer?.polar_customer_id === "string" && customer.polar_customer_id.trim()
      ? customer.polar_customer_id.trim()
      : null;

  try {
    const session = await createPolarCustomerSession({
      customerId: polarCustomerId,
      externalCustomerId,
    });
    return NextResponse.redirect(session.customerPortalUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create customer portal session.";
    return redirectToDashboard({ error: message });
  }
}
