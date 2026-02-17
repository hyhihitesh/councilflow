import { redirect } from "next/navigation";

import { completeOnboardingAction } from "@/app/auth/actions";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { getStepFromSearchParam } from "@/app/onboarding/validation";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  error?: string;
  step?: string;
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("firm_memberships")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (membershipsError) {
    redirect(
      `/auth/sign-in?error=${encodeURIComponent("Unable to load workspace state. Please sign in again.")}`,
    );
  }

  if (memberships && memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#060911] text-[#F1F5F9]">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
          Onboarding
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          Set up your firm workspace.
        </h1>
        <p className="mt-4 max-w-xl text-[#94A3B8]">
          This creates your first firm and saves your initial practice profile,
          ICP, and voice preferences.
        </p>

        <OnboardingForm
          error={params.error}
          action={completeOnboardingAction}
          initialStep={getStepFromSearchParam(params.step)}
        />
      </main>
    </div>
  );
}
