import { apiError, apiSuccess } from "@/lib/api/response";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(
      request,
      {
        code: "not_authenticated",
        message: "Please sign in again.",
      },
      { status: 401 },
    );
  }

  const { data: memberships } = await supabase
    .from("firm_memberships")
    .select("firm_id")
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    return apiError(
      request,
      {
        code: "membership_not_found",
        message: "No firm membership found for this account.",
      },
      { status: 404 },
    );
  }

  const firmId = memberships[0].firm_id;
  const accessState = await getFirmAccessState({ supabase, firmId });

  if (!accessState.ok) {
    return apiError(
      request,
      {
        code: accessState.code,
        message: accessState.message,
      },
      { status: accessState.statusCode },
    );
  }

  return apiSuccess(request, {
    firm_id: firmId,
    mode: accessState.mode,
    access_state: accessState.accessState,
    status: accessState.status,
    emergency_bypass: accessState.emergencyBypass,
    trial_ends_at: accessState.trialEndsAt,
    grace_ends_at: accessState.graceEndsAt,
    current_period_end: accessState.currentPeriodEnd,
  });
}

