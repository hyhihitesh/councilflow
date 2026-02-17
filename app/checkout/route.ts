import { NextResponse } from "next/server";

import { resolveFirmContext } from "@/lib/auth/firm-context";
import { getBillingPlanProductId, resolveBillingPlan } from "@/lib/billing/plans";
import { createPolarCheckoutSession } from "@/lib/billing/polar-client";
import { createClient } from "@/lib/supabase/server";

function toQueryParam(value: string) {
  return encodeURIComponent(value);
}

function getAppBaseUrl(request: Request) {
  const configured = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

function getCustomerName(user: { user_metadata?: Record<string, unknown> | null }) {
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return null;
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
      error: "Only firm owners can start checkout for the workspace.",
    });
  }

  const plan = resolveBillingPlan(new URL(request.url).searchParams.get("plan"));
  if (!plan) {
    return redirectToDashboard({
      error: "Invalid plan. Use starter, pro, or premium.",
    });
  }

  const productId = getBillingPlanProductId(plan);
  if (!productId) {
    return redirectToDashboard({
      error: `Plan ${plan} is not configured. Set POLAR_PRODUCT_${plan.toUpperCase()}.`,
    });
  }

  const externalCustomerId = `firm_${firmContext.firmId}`;
  const { error: upsertError } = await supabase.from("billing_customers").upsert(
    {
      firm_id: firmContext.firmId,
      user_id: user.id,
      external_customer_id: externalCustomerId,
    },
    { onConflict: "firm_id" },
  );

  if (upsertError) {
    return redirectToDashboard({
      error: `Unable to prepare billing customer: ${upsertError.message}`,
    });
  }

  const baseUrl = getAppBaseUrl(request);

  try {
    const checkout = await createPolarCheckoutSession({
      productId,
      externalCustomerId,
      customerEmail: user.email,
      customerName: getCustomerName(user),
      successUrl: `${baseUrl}/dashboard?message=${toQueryParam("Checkout complete. Billing sync in progress.")}`,
      returnUrl: `${baseUrl}/dashboard`,
      metadata: {
        firm_id: firmContext.firmId,
        user_id: user.id,
        plan,
      },
    });

    return NextResponse.redirect(checkout.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session.";
    return redirectToDashboard({ error: message });
  }
}
