import { createClient } from "@/lib/supabase/server";

export async function AuthProvidersSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const oauthProviders = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata?.providers as string[])
    : [];
  const hasGoogleAuth = oauthProviders.includes("google");
  const hasMicrosoftAuth = oauthProviders.includes("azure");

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="mb-8">
        <h2 className="text-xl font-light tracking-tight">Connected Identity Providers</h2>
        <p className="mt-2 text-sm text-[#716E68]">
          Authentication state for enterprise resource access.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">
            Google Workspace
          </p>
          <p
            className={
              hasGoogleAuth ? "text-sm font-medium text-[#6B705C]" : "text-sm font-medium text-[#A19D94]"
            }
          >
            {hasGoogleAuth ? "✓ Authenticated" : "Not connected"}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">
            Microsoft 365
          </p>
          <p
            className={
              hasMicrosoftAuth
                ? "text-sm font-medium text-[#6B705C]"
                : "text-sm font-medium text-[#A19D94]"
            }
          >
            {hasMicrosoftAuth ? "✓ Authenticated" : "Not connected"}
          </p>
        </div>
      </div>
    </section>
  );
}
