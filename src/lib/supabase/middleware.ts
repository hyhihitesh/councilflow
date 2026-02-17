import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export function isAuthRoute(pathname: string) {
  return pathname.startsWith("/auth/sign-in");
}

export function isProtectedRoute(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/prospects") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/outreach") ||
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/content-studio") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/settings")
  );
}

export function isServerActionRequest(request: Pick<NextRequest, "method" | "headers">) {
  return request.method === "POST" && request.headers.has("next-action");
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options }),
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const authRoute = isAuthRoute(pathname);
  const protectedRoute = isProtectedRoute(pathname);
  const serverActionRequest = isServerActionRequest(request);

  // Server Actions expect a specific response format. Redirecting/re-writing them
  // in middleware can surface "unexpected response from server" in clients.
  if (serverActionRequest) {
    return response;
  }

  if (!user && protectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("error", "Please sign in to continue");
    return NextResponse.redirect(url);
  }

  if (user && authRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
