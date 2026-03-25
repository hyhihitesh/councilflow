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
  { href: "/pipeline", label: "Pipeline" },
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
    label: "View Dashboard",
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#2C2A26] font-sans selection:bg-[#E2DECF]">
      <div className="flex w-full min-h-screen relative">
        
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-[#EBE8E0] bg-[#FDFCFB] p-8 lg:flex">
          <div className="flex flex-col h-full">
            <div className="mb-12">
              <Link href="/" className="text-sm font-semibold tracking-[0.2em] uppercase text-[#2C2A26] hover:opacity-70 transition-opacity">
                CouncilFlow
              </Link>
              <p className="mt-2 text-[10px] text-[#A19D94] uppercase tracking-[0.1em] font-medium opacity-80">
                Practice Intelligence
              </p>
            </div>

            <nav className="flex-1 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(currentPath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center px-4 py-2.5 rounded text-sm transition-all duration-300 ${
                      active
                        ? "bg-[#EFECE5] text-[#2C2A26] font-medium shadow-sm"
                        : "text-[#716E68] hover:text-[#2C2A26] hover:bg-[#F7F6F2]"
                    }`}
                  >
                    <span className={`mr-3 w-1.5 h-1.5 rounded-full transition-all ${active ? "bg-[#2C2A26]" : "bg-transparent group-hover:bg-[#D5D1C6]"}`}></span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pt-8 border-t border-[#EBE8E0]">
              <div className="mb-6">
                <p className="text-[10px] text-[#A19D94] uppercase tracking-wider mb-3">Enterprise Access</p>
                <Link href="/checkout?plan=pro" className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-[#2C2A26] text-[#F7F6F2] text-xs font-medium rounded hover:bg-[#4A4742] transition-colors shadow-sm">
                  Upgrade Plan
                </Link>
              </div>
              <div className="text-[10px] text-[#D5D1C6] uppercase tracking-widest text-center">
                v2.5.0-Flash
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          
          {/* Global Alert Bar (Billing) */}
          {(readOnly || grace) && (
            <div className={`py-2 px-6 flex items-center justify-center gap-4 text-xs font-medium ${readOnly ? "bg-red-50 text-red-700 border-b border-red-100" : "bg-[#EFECE5] text-[#2C2A26] border-b border-[#EBE8E0]"}`}>
              <span>
                {readOnly 
                  ? "Workspace in Read-Only Mode. Trial has expired." 
                  : `Workspace Trial active until ${billingAccessContext?.graceEndsAt ? new Date(billingAccessContext.graceEndsAt).toLocaleDateString() : 'soon'}.`}
              </span>
              <Link href="/portal" className="underline underline-offset-2 hover:opacity-70 transition-opacity">
                Configure Billing →
              </Link>
            </div>
          )}

          {/* Page Header */}
          <header className="px-6 py-8 sm:px-10 lg:px-12 bg-white/40 backdrop-blur-sm border-b border-[#EBE8E0]/40 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="max-w-xl">
                <h1 className="text-3xl font-light tracking-tight text-[#2C2A26] font-display">{title}</h1>
                {description && <p className="mt-2 text-[#716E68] text-sm font-light leading-relaxed">{description}</p>}
              </div>
              {headerActions && (
                <div className="flex flex-wrap items-center gap-3">
                  {headerActions}
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
            <div className={`animate-in fade-in duration-700 ${readOnly ? "pointer-events-none opacity-60 grayscale-[0.2]" : ""}`}>
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      <div className="fixed inset-x-6 bottom-8 z-50 lg:hidden pointer-events-none">
        <Link href={primaryCta.href} className="pointer-events-auto w-full py-4 bg-[#2C2A26] text-[#F7F6F2] shadow-xl rounded-full text-center flex items-center justify-center font-medium text-sm">
          {primaryCta.label}
        </Link>
      </div>
    </div>
  );
}

