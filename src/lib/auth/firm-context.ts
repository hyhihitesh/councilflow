type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export async function resolveFirmContext(params: {
  supabase: SupabaseLike;
  userId: string;
  preferredFirmId?: string | null;
}) {
  const { supabase, userId, preferredFirmId = null } = params;

  const { data: memberships, error } = await supabase
    .from("firm_memberships")
    .select("firm_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      ok: false as const,
      code: "firm_membership_query_failed",
      message: "Failed to load firm memberships.",
    };
  }

  if (!memberships || memberships.length === 0) {
    return {
      ok: false as const,
      code: "firm_membership_missing",
      message: "No firm membership found for user.",
    };
  }

  if (preferredFirmId) {
    const matched = memberships.find((membership) => membership.firm_id === preferredFirmId);
    if (!matched) {
      return {
        ok: false as const,
        code: "firm_access_denied",
        message: "Access denied for requested firm.",
      };
    }

    return {
      ok: true as const,
      firmId: matched.firm_id,
      role: matched.role,
    };
  }

  const primary = memberships[0];
  return {
    ok: true as const,
    firmId: primary.firm_id,
    role: primary.role,
  };
}
