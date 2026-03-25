import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string };
  firmId: string;
  role: string;
  firmName: string | null;
};

/**
 * Server-side auth guard for all authenticated pages.
 * Fetches user + primary firm membership and redirects if missing.
 * Eliminates ~50 lines of boilerplate repeated in every page.
 *
 * Usage:
 *   const { supabase, user, firmId, role, firmName } = await requireAuth();
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: memberships, error } = await supabase
    .from("firm_memberships")
    .select("firm_id, role, firms(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    redirect(
      `/onboarding?error=${encodeURIComponent("Unable to load firm membership. Please retry or sign in again.")}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const primary = memberships[0];
  const firmsData = primary.firms;
  const firmName =
    Array.isArray(firmsData)
      ? (firmsData[0]?.name ?? null)
      : ((firmsData as { name?: string } | null)?.name ?? null);

  return {
    supabase,
    user: { id: user.id, email: user.email },
    firmId: primary.firm_id,
    role: primary.role ?? "member",
    firmName,
  };
}
