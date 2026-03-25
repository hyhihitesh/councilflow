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
    <div className="min-h-screen bg-[#FDFCFB] text-[#2C2A26] font-sans selection:bg-[#E2DECF] selection:text-[#2C2A26] relative">
      {/* Subtle top gradient */}
      <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-[#EFECE5]/60 to-transparent pointer-events-none"></div>
      
      <main className="mx-auto flex min-h-screen w-full max-w-[800px] flex-col items-center justify-center px-6 py-16 relative z-10">
        <div className="w-full text-center mb-10">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-[#A19D94] uppercase mb-4">
            CouncilFlow Onboarding
          </p>
          <h1 className="text-[2.5rem] md:text-[3rem] font-light tracking-[-0.01em] text-[#2C2A26] leading-[1.1] font-display mb-4">
            Establish your firm.
          </h1>
          <p className="text-[17px] text-[#716E68] font-light leading-relaxed max-w-xl mx-auto">
            Design your workspace, define your ideal client profile, and tune the AI voice to perfectly align with your firm's professional standards.
          </p>
        </div>

        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
          <OnboardingForm
            error={params.error}
            action={completeOnboardingAction}
            initialStep={getStepFromSearchParam(params.step)}
          />
        </div>
      </main>
    </div>
  );
}

