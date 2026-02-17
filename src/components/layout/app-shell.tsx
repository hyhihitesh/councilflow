import Link from "next/link";

type AppShellProps = {
  title: string;
  description?: string;
  billingAccessState?: "active" | "grace" | "read_only";
  billingAccessContext?: {
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
  };
  currentPath:
    | "/dashboard"
    | "/prospects"
    | "/outreach"
    | "/pipeline"
    | "/content-studio"
    | "/analytics"
    | "/settings";
  mobileCta?: {
    href: string;
    label: string;
  };
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Command Center" },
  { href: "/prospects", label: "Prospect Queue" },
  { href: "/outreach", label: "Outreach Writer" },
  { href: "/pipeline", label: "Follow-Up Pipeline" },
  { href: "/content-studio", label: "Content Studio" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
] as const;

function isActivePath(currentPath: AppShellProps["currentPath"], href: string) {
  return currentPath === href;
}

export function AppShell({
  title,
  description,
  billingAccessState = "active",
  billingAccessContext,
  currentPath,
  mobileCta,
  headerActions,
  children,
}: AppShellProps) {
  const readOnly = billingAccessState === "read_only";
  const grace = billingAccessState === "grace";
  const primaryCta = mobileCta ?? {
    href: "/dashboard",
    label: "Open Command Center",
  };

  return (
    <div className="min-h-screen bg-[#060911] text-[#F1F5F9]">
      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 md:px-6 lg:py-8">
        <aside className="glass-card sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col justify-between p-4 lg:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">inhumans.io</p>
            <p className="mt-1 text-sm text-[#CBD5E1]">AI BD Operating System</p>

            <nav className="mt-6 grid gap-2">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(currentPath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "rounded-md border border-indigo-300/40 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-100"
                        : "rounded-md border border-white/10 bg-[#0D1117] px-3 py-2 text-sm text-[#CBD5E1] hover:border-white/20"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="grid gap-2">
            <p className="text-xs text-[#94A3B8]">Billing and plan controls</p>
            <Link href="/checkout?plan=pro" className="btn-base btn-primary text-center">
              Upgrade workspace
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          {readOnly ? (
            <div className="mb-4 rounded-lg border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-medium">Workspace is in read-only mode.</p>
              <p className="mt-1 text-xs text-amber-200">
                Trial window has expired. Upgrade to re-enable prospecting, outreach, and automation.
                {billingAccessContext?.trialEndsAt
                  ? ` Trial ended on ${new Date(billingAccessContext.trialEndsAt).toLocaleDateString()}.`
                  : ""}
                {billingAccessContext?.graceEndsAt
                  ? ` Grace period ended on ${new Date(billingAccessContext.graceEndsAt).toLocaleDateString()}.`
                  : ""}
              </p>
              <p className="mt-2 text-xs text-amber-200">
                Your data remains visible in read-only mode. Choose a plan to reactivate full workspace access.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link
                  href="/checkout?plan=starter"
                  className="rounded-md border border-amber-200/40 bg-amber-400/10 px-2.5 py-1.5 text-amber-100"
                >
                  Upgrade: Starter
                </Link>
                <Link
                  href="/checkout?plan=pro"
                  className="rounded-md border border-amber-200/40 bg-amber-400/10 px-2.5 py-1.5 text-amber-100"
                >
                  Upgrade: Pro
                </Link>
                <Link
                  href="/checkout?plan=premium"
                  className="rounded-md border border-amber-200/40 bg-amber-400/10 px-2.5 py-1.5 text-amber-100"
                >
                  Upgrade: Premium
                </Link>
                <Link href="/analytics" className="rounded-md border border-amber-200/30 px-2.5 py-1.5 text-amber-100">
                  View trial metrics
                </Link>
              </div>
            </div>
          ) : null}
          {grace ? (
            <div className="mb-4 rounded-lg border border-indigo-300/40 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
              <p className="font-medium">Workspace is in grace period.</p>
              <p className="mt-1 text-xs text-indigo-200">
                Trial access is still enabled temporarily
                {billingAccessContext?.graceEndsAt
                  ? ` until ${new Date(billingAccessContext.graceEndsAt).toLocaleDateString()}.`
                  : "."}
              </p>
            </div>
          ) : null}
          <header className="glass-card mb-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">inhumans.io</p>
                <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
                {description ? <p className="mt-2 text-[#94A3B8]">{description}</p> : null}
              </div>
              {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
            </div>
          </header>

          <div className={readOnly ? "pointer-events-none opacity-65" : undefined}>{children}</div>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-50 lg:hidden">
        <Link href={primaryCta.href} className="btn-base btn-primary block text-center">
          {primaryCta.label}
        </Link>
      </div>
    </div>
  );
}
