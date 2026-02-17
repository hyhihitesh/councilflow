import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getAppOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function mapProvider(input: string) {
  const normalized = input.trim().toLowerCase();
  if (normalized === "google") return "google" as const;
  if (normalized === "microsoft") return "azure" as const;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerInput = url.searchParams.get("provider") ?? "";
  const mappedProvider = mapProvider(providerInput);
  const nextPath = url.searchParams.get("next") ?? "/dashboard";

  if (!mappedProvider) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=Unsupported%20OAuth%20provider", request.url),
    );
  }

  const origin = getAppOrigin();
  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  const queryParams =
    mappedProvider === "azure"
      ? {
          prompt: "select_account",
        }
      : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: mappedProvider,
    options: {
      redirectTo: callbackUrl,
      queryParams,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=${encodeURIComponent(error?.message ?? "OAuth sign-in failed")}`,
        request.url,
      ),
    );
  }

  return NextResponse.redirect(data.url);
}
