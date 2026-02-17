import { apiError } from "@/lib/api/response";
import type { EntitlementFailure } from "@/lib/billing/entitlements";

export function entitlementApiError(request: Request, entitlement: EntitlementFailure) {
  return apiError(
    request,
    {
      code: entitlement.code,
      message: entitlement.message,
      details: entitlement.details,
    },
    { status: entitlement.statusCode },
  );
}

