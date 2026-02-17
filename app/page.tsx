import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#060911] text-[#F1F5F9]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-16 sm:px-6 sm:py-20">
        <p className="mb-4 text-sm uppercase tracking-[0.2em] text-[#94A3B8]">
          inhumans.io V1
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
          Foundation initialized. Sprint 1 build has started.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-[#94A3B8] md:text-lg">
          Next.js, TypeScript, Tailwind, and the core server/feature boundaries
          are now in place. Next step is implementing authentication, tenancy,
          and Supabase schema migrations.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/auth/sign-in"
            className="btn-base btn-primary"
          >
            Continue setup
          </Link>
          <Link
            href="/dashboard"
            className="btn-base btn-secondary"
          >
            Open dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
