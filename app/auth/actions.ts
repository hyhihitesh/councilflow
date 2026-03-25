"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function asNonEmptyString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toQueryParam(value: string) {
  return encodeURIComponent(value);
}

function mapAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "Email rate limit exceeded. Wait a minute and try again, or use Google/Microsoft sign-in.";
  }

  return message;
}

function getAppOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function parseCsvList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

type OAuthProviderInput = "google" | "microsoft";
type SupabaseOAuthProvider = "google" | "azure";

function mapOAuthProvider(provider: string): SupabaseOAuthProvider | null {
  const normalized = provider.toLowerCase();

  if (normalized === "google") return "google";
  if (normalized === "microsoft") return "azure";

  return null;
}

export async function oauthSignInAction(formData: FormData) {
  const providerInput = asNonEmptyString(formData.get("provider")) as OAuthProviderInput;
  const mappedProvider = mapOAuthProvider(providerInput);

  if (!mappedProvider) {
    redirect("/auth/sign-in?error=Unsupported%20OAuth%20provider");
  }

  const supabase = await createClient();
  const origin = getAppOrigin();
  const nextPath = "/dashboard";
  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  const queryParams =
    mappedProvider === "azure"
      ? {
          prompt: "select_account",
        }
      : undefined;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: mappedProvider,
    options: {
      redirectTo: callbackUrl,
      queryParams,
    },
  });

  if (error || !data.url) {
    redirect(`/auth/sign-in?error=${toQueryParam(error?.message ?? "OAuth sign-in failed")}`);
  }

  redirect(data.url);
}

function isRedirectError(error: any) {
  return (
    error &&
    typeof error === "object" &&
    error.digest &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

// ... (helper functions)

export async function signInAction(formData: FormData) {
  const email = asNonEmptyString(formData.get("email"));
  const password = asNonEmptyString(formData.get("password"));

  if (!email || !password) {
    redirect("/auth/sign-in?error=Email%20and%20password%20are%20required");
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      console.error("[signInAction] Auth error:", error.message);
      redirect(`/auth/sign-in?error=${toQueryParam(mapAuthErrorMessage(error.message))}`);
    }

    redirect("/dashboard");
  } catch (thrown) {
    if (isRedirectError(thrown)) throw thrown;
    console.error("[signInAction] Unexpected error:", thrown);
    const message = thrown instanceof Error ? thrown.message : "Sign in failed unexpectedly";
    redirect(`/auth/sign-in?error=${toQueryParam(message)}`);
  }
}

export async function signUpAction(formData: FormData) {
  const email = asNonEmptyString(formData.get("email"));
  const password = asNonEmptyString(formData.get("password"));

  if (!email || !password) {
    redirect("/auth/sign-in?error=Email%20and%20password%20are%20required");
  }

  try {
    const origin = getAppOrigin();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/dashboard`,
      },
    });

    if (error) {
      console.error("[signUpAction] Auth error:", error.message);
      redirect(`/auth/sign-in?error=${toQueryParam(mapAuthErrorMessage(error.message))}`);
    }

    if (!data?.session) {
      redirect(
        "/auth/sign-in?message=Check%20your%20email%20to%20confirm%20your%20account%2C%20then%20sign%20in",
      );
    }

    redirect("/onboarding");
  } catch (thrown) {
    if (isRedirectError(thrown)) throw thrown;
    console.error("[signUpAction] Unexpected error:", thrown);
    const message = thrown instanceof Error ? thrown.message : "Sign up failed unexpectedly";
    redirect(`/auth/sign-in?error=${toQueryParam(message)}`);
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in?message=Signed%20out");
}

export async function completeOnboardingAction(formData: FormData) {
  try {
    const displayName = asNonEmptyString(formData.get("display_name"));
    const firmName = asNonEmptyString(formData.get("firm_name"));
    const practiceAreas = parseCsvList(formData.get("practice_areas"));
    const officeLocation = asNonEmptyString(formData.get("office_location"));
    const avgMatterValueRaw = asNonEmptyString(formData.get("avg_matter_value"));
    const avgMatterValue = Number(avgMatterValueRaw);
    const icpIndustries = parseCsvList(formData.get("icp_industries"));
    const icpCompanySizes = parseCsvList(formData.get("icp_company_sizes"));
    const icpGeography = asNonEmptyString(formData.get("icp_geography"));
    const voiceTone = asNonEmptyString(formData.get("voice_tone"));
    const voiceSample = asNonEmptyString(formData.get("voice_sample"));

    if (!firmName) redirect("/onboarding?error=Firm%20name%20is%20required");
    if (displayName.length < 2) redirect("/onboarding?error=Display%20name%20must%20be%20at%20least%202%20characters");
    if (practiceAreas.length === 0) redirect("/onboarding?error=Add%20at%20least%20one%20practice%20area");
    if (!officeLocation) redirect("/onboarding?error=Office%20location%20is%20required");
    if (!Number.isFinite(avgMatterValue) || avgMatterValue <= 0) {
      redirect("/onboarding?error=Average%20matter%20value%20must%20be%20greater%20than%200");
    }
    if (icpIndustries.length === 0) redirect("/onboarding?error=Add%20at%20least%20one%20ICP%20industry");
    if (icpCompanySizes.length === 0) redirect("/onboarding?error=Add%20at%20least%20one%20company%20size");
    if (!icpGeography) redirect("/onboarding?error=ICP%20geography%20is%20required");
    if (!voiceTone) redirect("/onboarding?error=Preferred%20voice%20tone%20is%20required");
    if (voiceSample && voiceSample.length < 40) {
      redirect("/onboarding?error=Voice%20sample%20must%20be%20at%20least%2040%20characters");
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("[completeOnboardingAction] Auth error:", userError?.message);
      redirect("/auth/sign-in?error=Please%20sign%20in%20again");
    }

    // 1. Update Profile
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName || null,
      practice_areas: practiceAreas,
      office_location: officeLocation || null,
      avg_matter_value: Number.isFinite(avgMatterValue) && avgMatterValue >= 0 ? avgMatterValue : null,
      icp_profile: {
        industries: icpIndustries,
        company_sizes: icpCompanySizes,
        geography: icpGeography || null,
      },
      voice_profile: {
        tone: voiceTone || "professional",
        sample: voiceSample || null,
        source: voiceSample ? "manual_sample" : "default",
      },
    });

    if (profileError) {
      console.error("[completeOnboardingAction] Profile error:", profileError.message);
      redirect(`/onboarding?error=${toQueryParam(profileError.message)}`);
    }

    // 2. Create Firm via RPC
    const { data: createdFirmId, error: firmError } = await supabase.rpc("create_firm_with_owner", {
      firm_name: firmName,
    });

    if (firmError) {
      console.error("[completeOnboardingAction] Firm RPC error:", firmError.message);
      redirect(`/onboarding?error=${toQueryParam(firmError.message)}`);
    }

    // 3. Verify/Backfill Membership
    const { data: createdMembership, error: membershipCheckError } = await supabase
      .from("firm_memberships")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipCheckError) {
      console.error("[completeOnboardingAction] Membership check error:", membershipCheckError.message);
      redirect(`/onboarding?error=${toQueryParam(membershipCheckError.message)}`);
    }

    if (!createdMembership && typeof createdFirmId === "string" && createdFirmId.length > 0) {
      console.log("[completeOnboardingAction] Backfilling ownership for firm:", createdFirmId);
      const admin = createAdminClient();
      const { error: backfillMembershipError } = await admin.from("firm_memberships").upsert(
        {
          firm_id: createdFirmId,
          user_id: user.id,
          role: "owner",
        },
        { onConflict: "firm_id,user_id" },
      );

      if (backfillMembershipError) {
        console.error("[completeOnboardingAction] Backfill error:", backfillMembershipError.message);
        redirect(`/onboarding?error=${toQueryParam(backfillMembershipError.message)}`);
      }
    }

    console.log("[completeOnboardingAction] Onboarding successful for user:", user.id);
    redirect("/dashboard");
  } catch (thrown) {
    if (isRedirectError(thrown)) throw thrown;
    console.error("[completeOnboardingAction] CRITICAL ERROR:", thrown);
    const message = thrown instanceof Error ? thrown.message : "Onboarding failed unexpectedly";
    redirect(`/onboarding?error=${toQueryParam(message)}`);
  }
}

const INVITABLE_ROLES = new Set(["attorney", "ops"]);

export async function inviteMemberAction(formData: FormData) {
  const inviteEmail = asNonEmptyString(formData.get("invite_email")).toLowerCase();
  const inviteRole = asNonEmptyString(formData.get("invite_role")).toLowerCase();
  const firmId = asNonEmptyString(formData.get("firm_id"));

  if (!inviteEmail || !inviteRole || !firmId) {
    redirect("/dashboard?error=Missing%20invite%20details");
  }

  if (!INVITABLE_ROLES.has(inviteRole)) {
    redirect("/dashboard?error=Invalid%20invite%20role");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20again");
  }

  const { data: ownerMembership } = await supabase
    .from("firm_memberships")
    .select("id, role")
    .eq("firm_id", firmId)
    .eq("user_id", user.id)
    .single();

  if (!ownerMembership || ownerMembership.role !== "owner") {
    redirect("/dashboard?error=Only%20owners%20can%20invite%20members");
  }

  const { data: existingMember } = await supabase
    .from("firm_memberships")
    .select("id")
    .eq("firm_id", firmId)
    .eq("user_id", user.id)
    .single();

  if (!existingMember) {
    redirect("/dashboard?error=Owner%20membership%20validation%20failed");
  }

  const admin = createAdminClient();
  const origin = getAppOrigin();
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo: `${origin}/auth/sign-in`,
    });

  if (inviteError || !invited.user?.id) {
    redirect(`/dashboard?error=${toQueryParam(inviteError?.message ?? "Invite failed")}`);
  }

  const { error: invitationError } = await supabase.from("firm_invitations").insert({
    firm_id: firmId,
    email: inviteEmail,
    role: inviteRole,
    invited_by: user.id,
    invited_user_id: invited.user.id,
    status: "pending",
  });

  if (invitationError) {
    redirect(`/dashboard?error=${toQueryParam(invitationError.message)}`);
  }

  redirect("/dashboard?message=Invitation%20sent");
}

export async function resendInviteAction(formData: FormData) {
  const invitationId = asNonEmptyString(formData.get("invitation_id"));
  const firmId = asNonEmptyString(formData.get("firm_id"));

  if (!invitationId || !firmId) {
    redirect("/dashboard?error=Missing%20invite%20reference");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20again");
  }

  const { data: ownerMembership } = await supabase
    .from("firm_memberships")
    .select("id, role")
    .eq("firm_id", firmId)
    .eq("user_id", user.id)
    .single();

  if (!ownerMembership || ownerMembership.role !== "owner") {
    redirect("/dashboard?error=Only%20owners%20can%20resend%20invites");
  }

  const { data: invitation } = await supabase
    .from("firm_invitations")
    .select("id, email, status")
    .eq("id", invitationId)
    .eq("firm_id", firmId)
    .single();

  if (!invitation || invitation.status !== "pending") {
    redirect("/dashboard?error=Only%20pending%20invites%20can%20be%20resent");
  }

  const admin = createAdminClient();
  const origin = getAppOrigin();
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo: `${origin}/auth/sign-in`,
    });

  if (inviteError || !invited.user?.id) {
    redirect(`/dashboard?error=${toQueryParam(inviteError?.message ?? "Resend failed")}`);
  }

  const { error: updateError } = await supabase
    .from("firm_invitations")
    .update({
      invited_user_id: invited.user.id,
      invited_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", invitationId);

  if (updateError) {
    redirect(`/dashboard?error=${toQueryParam(updateError.message)}`);
  }

  redirect("/dashboard?message=Invitation%20resent");
}

export async function revokeInviteAction(formData: FormData) {
  const invitationId = asNonEmptyString(formData.get("invitation_id"));
  const firmId = asNonEmptyString(formData.get("firm_id"));

  if (!invitationId || !firmId) {
    redirect("/dashboard?error=Missing%20invite%20reference");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20again");
  }

  const { data: ownerMembership } = await supabase
    .from("firm_memberships")
    .select("id, role")
    .eq("firm_id", firmId)
    .eq("user_id", user.id)
    .single();

  if (!ownerMembership || ownerMembership.role !== "owner") {
    redirect("/dashboard?error=Only%20owners%20can%20revoke%20invites");
  }

  const { error: revokeError } = await supabase
    .from("firm_invitations")
    .update({
      status: "revoked",
      responded_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("status", "pending");

  if (revokeError) {
    redirect(`/dashboard?error=${toQueryParam(revokeError.message)}`);
  }

  redirect("/dashboard?message=Invitation%20revoked");
}

export async function acceptInviteAction(formData: FormData) {
  const invitationId = asNonEmptyString(formData.get("invitation_id"));

  if (!invitationId) {
    redirect("/invite?error=Missing%20invitation%20id");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20to%20accept%20invites");
  }

  const { error } = await supabase.rpc("accept_firm_invitation", {
    invitation_id: invitationId,
  });

  if (error) {
    redirect(`/invite?error=${toQueryParam(error.message)}`);
  }

  redirect("/dashboard?message=Invitation%20accepted");
}

export async function updateMemberRoleAction(formData: FormData) {
  const membershipId = asNonEmptyString(formData.get("membership_id"));
  const firmId = asNonEmptyString(formData.get("firm_id"));
  const newRole = asNonEmptyString(formData.get("new_role")).toLowerCase();

  if (!membershipId || !firmId || !newRole) {
    redirect("/dashboard?error=Missing%20member%20update%20data");
  }

  if (!["owner", "attorney", "ops"].includes(newRole)) {
    redirect("/dashboard?error=Invalid%20role");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20again");
  }

  const { data: ownerMembership } = await supabase
    .from("firm_memberships")
    .select("id, role")
    .eq("firm_id", firmId)
    .eq("user_id", user.id)
    .single();

  if (!ownerMembership || ownerMembership.role !== "owner") {
    redirect("/dashboard?error=Only%20owners%20can%20change%20roles");
  }

  const { data: targetMembership } = await supabase
    .from("firm_memberships")
    .select("id, role")
    .eq("id", membershipId)
    .eq("firm_id", firmId)
    .single();

  if (!targetMembership) {
    redirect("/dashboard?error=Membership%20not%20found");
  }

  if (targetMembership.role === "owner" && newRole !== "owner") {
    const { count: ownerCount } = await supabase
      .from("firm_memberships")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("role", "owner");

    if ((ownerCount ?? 0) <= 1) {
      redirect("/dashboard?error=Cannot%20downgrade%20the%20last%20owner");
    }
  }

  const { error } = await supabase
    .from("firm_memberships")
    .update({ role: newRole })
    .eq("id", membershipId)
    .eq("firm_id", firmId);

  if (error) {
    redirect(`/dashboard?error=${toQueryParam(error.message)}`);
  }

  redirect("/dashboard?message=Member%20role%20updated");
}

export async function removeMemberAction(formData: FormData) {
  const membershipId = asNonEmptyString(formData.get("membership_id"));
  const firmId = asNonEmptyString(formData.get("firm_id"));

  if (!membershipId || !firmId) {
    redirect("/dashboard?error=Missing%20member%20remove%20data");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20again");
  }

  const { data: ownerMembership } = await supabase
    .from("firm_memberships")
    .select("id, role")
    .eq("firm_id", firmId)
    .eq("user_id", user.id)
    .single();

  if (!ownerMembership || ownerMembership.role !== "owner") {
    redirect("/dashboard?error=Only%20owners%20can%20remove%20members");
  }

  const { data: targetMembership } = await supabase
    .from("firm_memberships")
    .select("id, role, user_id")
    .eq("id", membershipId)
    .eq("firm_id", firmId)
    .single();

  if (!targetMembership) {
    redirect("/dashboard?error=Membership%20not%20found");
  }

  if (targetMembership.user_id === user.id) {
    redirect("/dashboard?error=Use%20Sign%20out%20instead%20of%20removing%20yourself");
  }

  if (targetMembership.role === "owner") {
    const { count: ownerCount } = await supabase
      .from("firm_memberships")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("role", "owner");

    if ((ownerCount ?? 0) <= 1) {
      redirect("/dashboard?error=Cannot%20remove%20the%20last%20owner");
    }
  }

  const { error } = await supabase
    .from("firm_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("firm_id", firmId);

  if (error) {
    redirect(`/dashboard?error=${toQueryParam(error.message)}`);
  }

  redirect("/dashboard?message=Member%20removed");
}
