import Link from "next/link";

import { signInAction, signUpAction } from "@/app/auth/actions";

type SearchParams = {
  error?: string;
  message?: string;
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-screen bg-[#060911] text-[#F1F5F9]">
      <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 md:py-20">
        <section className="flex flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
            inhumans.io
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">
            Sign in to continue your Sprint 2 setup.
          </h1>
          <p className="mt-4 max-w-md text-[#94A3B8]">
            Use email/password or continue with Google/Microsoft OAuth for faster
            team onboarding.
          </p>
          <Link className="mt-6 text-sm text-[#8B5CF6] hover:underline" href="/">
            Back to home
          </Link>
        </section>

        <section className="glass-card grid gap-6 self-center p-6">
          {params.error ? (
            <p className="alert-error">
              {params.error}
            </p>
          ) : null}
          {params.message ? (
            <p className="alert-success">
              {params.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[#94A3B8]">
              Continue with OAuth
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link className="btn-base btn-ghost w-full text-center" href="/auth/oauth?provider=google">
                Continue with Google
              </Link>
              <Link
                className="btn-base btn-ghost w-full text-center"
                href="/auth/oauth?provider=microsoft"
              >
                Continue with Microsoft
              </Link>
            </div>
          </div>

          <form action={signInAction} className="grid gap-3">
            <h2 className="text-lg font-medium">Sign in</h2>
            <label className="grid gap-1">
              <span className="sr-only">Email address</span>
              <input
                className="input-base"
                name="email"
                type="email"
                placeholder="you@firm.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Password</span>
              <input
                className="input-base"
                name="password"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </label>
            <button
              className="btn-base btn-primary mt-1"
              type="submit"
            >
              Sign in
            </button>
          </form>

          <form action={signUpAction} className="grid gap-3 border-t border-white/10 pt-4">
            <h2 className="text-lg font-medium">Create account</h2>
            <label className="grid gap-1">
              <span className="sr-only">Email address</span>
              <input
                className="input-base"
                name="email"
                type="email"
                placeholder="you@firm.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Create password</span>
              <input
                className="input-base"
                name="password"
                type="password"
                placeholder="Create password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <button
              className="btn-base btn-secondary mt-1"
              type="submit"
            >
              Create account
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
