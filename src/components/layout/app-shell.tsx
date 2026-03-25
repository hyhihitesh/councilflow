"use client";

import Link from "next/link";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { 
  LayoutDashboard, 
  Users, 
  Send, 
  Kanban, 
  PenTool, 
  BarChart3, 
  Settings, 
  ChevronRight, 
  Plus, 
  User, 
  LogOut, 
  CreditCard,
  Zap,
  MoreVertical
} from "lucide-react";

import { CommandPalette } from "./command-palette";
import dynamic from "next/dynamic";

const AgentSidebar = dynamic(
  () => import("@/components/agent/agent-sidebar").then((m) => ({ default: m.AgentSidebar })),
  { ssr: false }
);

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
  userEmail?: string;
  onSignOut?: () => void; // Used for client-side override if needed, but we typically use form actions
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/prospects", label: "Prospect Queue", icon: Users },
  { href: "/outreach", label: "Outreach Writer", icon: Send },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/content-studio", label: "Content Studio", icon: PenTool },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActivePath(currentPath: string, href: string) {
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
  userEmail,
}: AppShellProps) {
  const readOnly = billingAccessState === "read_only";
  const grace = billingAccessState === "grace";
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const primaryCta = mobileCta ?? {
    href: "/dashboard",
    label: "View Dashboard",
  };

  // Enhanced Breadcrumbs logic
  const breadcrumbs = currentPath
    .split("/")
    .filter(Boolean)
    .map((part, index, array) => {
      const href = `/${array.slice(0, index + 1).join("/")}`;
      
      // Special case for dashboard to avoid redundancy if title is already descriptive
      if (part === "dashboard" && array.length > 1) return null;

      const label = part
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return { label, href };
    })
    .filter((crumb): crumb is { label: string; href: string } => crumb !== null);

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#2C2A26] font-sans selection:bg-[#E2DECF]">
      <div className="flex w-full min-h-screen relative">
        
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-[#EBE8E0] bg-[#FDFCFB] p-8 lg:flex">
          <div className="flex flex-col h-full">
            <div className="mb-12">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-[0.2em] uppercase text-[#2C2A26] hover:opacity-70 transition-opacity">
                <div className="w-6 h-6 bg-[#2C2A26] rounded-sm flex items-center justify-center text-[10px] text-[#F7F6F2] font-bold">CF</div>
                CouncilFlow
              </Link>
              <p className="mt-2 text-[10px] text-[#A19D94] uppercase tracking-[0.1em] font-medium opacity-80">
                Practice Intelligence
              </p>
            </div>

            <nav className="flex-1 flex flex-col gap-1.5">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(currentPath, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center px-4 py-2.5 rounded-sm text-[13px] transition-all duration-300 ${
                      active
                        ? "bg-[#EFECE5] text-[#2C2A26] font-medium shadow-sm"
                        : "text-[#716E68] hover:text-[#2C2A26] hover:bg-[#F7F6F2]"
                    }`}
                  >
                    <Icon className={`mr-3 w-4 h-4 transition-colors ${active ? "text-[#2C2A26]" : "text-[#A19D94] group-hover:text-[#2C2A26]"}`} />
                    {item.label}
                    {active && <div className="ml-auto w-1 h-1 rounded-full bg-[#2C2A26]"></div>}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pt-8 border-t border-[#EBE8E0]">
              <div className="mb-6 p-4 rounded-sm bg-[#F7F6F2]/50 border border-[#EBE8E0]">
                <p className="text-[10px] text-[#A19D94] uppercase tracking-wider mb-2">Workspace Tier</p>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-3 h-3 text-[#B79455]" />
                  <span className="text-xs font-medium uppercase tracking-tight text-[#2C2A26]">Enterprise Pro</span>
                </div>
                <Link href="/portal" className="inline-flex items-center justify-center w-full px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors shadow-sm uppercase tracking-widest">
                  Manage Plan
                </Link>
              </div>
              <div className="text-[10px] text-[#D5D1C6] uppercase tracking-[0.3em] font-medium text-center">
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

          {/* Top Bar (Breadcrumbs + Actions) */}
          <div className="h-16 px-6 lg:px-12 flex items-center justify-between border-b border-[#EBE8E0] bg-white/40 backdrop-blur-md sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <nav className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#A19D94]">
                <Link href="/dashboard" className="hover:text-[#2C2A26] transition-colors flex items-center gap-1.5">
                  <LayoutDashboard className="w-3.5 h-3.5 opacity-60" />
                  App
                </Link>
                {breadcrumbs.map((crumb, idx) => (
                  <div key={crumb.href} className="flex items-center gap-2">
                    <span className="text-[#D5D1C6] font-light">/</span>
                    <Link 
                      href={crumb.href} 
                      className={`hover:text-[#2C2A26] transition-colors ${idx === breadcrumbs.length - 1 ? "text-[#2C2A26] font-bold" : "opacity-80"}`}
                    >
                      {crumb.label}
                    </Link>
                  </div>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              {/* AI Agent Toggle */}
              <button
                onClick={() => setIsAgentOpen((prev) => !prev)}
                aria-label="Toggle AI Agent"
                className={`w-9 h-9 flex items-center justify-center rounded-sm border transition-all ${
                  isAgentOpen
                    ? "bg-[#2C2A26] text-[#F7F6F2] border-[#2C2A26]"
                    : "border-[#EBE8E0] text-[#A19D94] hover:text-[#2C2A26] hover:border-[#D5D1C6] hover:bg-[#F7F6F2]"
                }`}
              >
                <Zap className="w-4 h-4" />
              </button>
              {/* Quick Actions */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex items-center justify-center gap-2 px-3 h-9 rounded-sm bg-[#2C2A26] text-[#F7F6F2] hover:bg-[#4A4742] transition-colors focus:outline-none shadow-sm">
                    <Plus className="w-4 h-4" />
                    <span className="text-[10px] font-medium uppercase tracking-widest hidden sm:inline">Actions</span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content 
                    className="min-w-[200px] bg-white rounded-lg p-2 shadow-2xl border border-[#EBE8E0] animate-in fade-in slide-in-from-top-2 duration-300 z-50 mt-2"
                    sideOffset={8}
                    align="end"
                  >
                    <DropdownMenu.Label className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#A19D94] font-semibold">Priority Tasks</DropdownMenu.Label>
                    <DropdownMenu.Item asChild>
                      <Link href="/prospects" className="flex items-center px-4 py-3 text-[13px] text-[#2C2A26] hover:bg-[#F7F6F2] rounded-md transition-colors cursor-pointer outline-none">
                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">Ingest Prospect</span>
                          <span className="text-[10px] text-[#A19D94]">Add new firm leads</span>
                        </div>
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild>
                      <Link href="/outreach" className="flex items-center px-4 py-3 text-[13px] text-[#2C2A26] hover:bg-[#F7F6F2] rounded-md transition-colors cursor-pointer outline-none">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3">
                          <PenTool className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">Draft Outreach</span>
                          <span className="text-[10px] text-[#A19D94]">AI-assisted writing</span>
                        </div>
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild>
                      <Link href="/content-studio" className="flex items-center px-4 py-3 text-[13px] text-[#2C2A26] hover:bg-[#F7F6F2] rounded-md transition-colors cursor-pointer outline-none">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mr-3">
                          <Zap className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">Generate Post</span>
                          <span className="text-[10px] text-[#A19D94]">Social & Blog drafts</span>
                        </div>
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="h-px bg-[#EBE8E0] my-2" />
                    <DropdownMenu.Item asChild>
                      <Link href="/pipeline" className="flex items-center px-4 py-2.5 text-[12px] text-[#716E68] hover:text-[#2C2A26] hover:bg-[#F7F6F2] rounded-md transition-colors cursor-pointer outline-none">
                        <Kanban className="w-3.5 h-3.5 mr-3 opacity-60" />
                        View Pipeline Board
                      </Link>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* User Menu */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-full border border-[#EBE8E0] bg-[#FDFCFB] hover:border-[#D5D1C6] hover:shadow-sm transition-all focus:outline-none ring-offset-2 focus:ring-2 focus:ring-[#E2DECF]">
                    <span className="text-[11px] font-medium text-[#2C2A26] ml-2 hidden lg:inline">{userEmail?.split('@')[0] ?? "User"}</span>
                    <div className="w-7 h-7 rounded-full bg-[#E2DECF] border border-[#D5D1C6] flex items-center justify-center text-[10px] text-[#2C2A26] font-bold shadow-inner uppercase">
                      {userEmail?.charAt(0) ?? <User className="w-3 h-3" />}
                    </div>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content 
                    className="min-w-[240px] bg-white rounded-lg p-2 shadow-2xl border border-[#EBE8E0] animate-in fade-in slide-in-from-top-2 duration-300 z-50 mt-2"
                    sideOffset={8}
                    align="end"
                  >
                    <div className="px-4 py-4 border-b border-[#F7F6F2] mb-1">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-full bg-[#EFECE5] flex items-center justify-center text-xs font-bold text-[#2C2A26]">
                          {userEmail?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <p className="text-[13px] font-semibold text-[#2C2A26] truncate capitalize">{userEmail?.split('@')[0]}</p>
                          <p className="text-[11px] text-[#A19D94] truncate">{userEmail}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[9px] text-[#A19D94] uppercase tracking-widest font-medium">Firm: CFS-882</span>
                        <span className="px-1.5 py-0.5 bg-[#6B705C]/10 text-[#6B705C] text-[8px] font-bold uppercase rounded-sm">Verified</span>
                      </div>
                    </div>
                    
                    <DropdownMenu.Item asChild>
                      <Link href="/settings" className="flex items-center px-4 py-2.5 text-[12px] text-[#2C2A26] hover:bg-[#F7F6F2] rounded-md transition-colors cursor-pointer outline-none">
                        <User className="w-4 h-4 mr-3 opacity-60 text-[#716E68]" />
                        Organization Settings
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild>
                      <Link href="/portal" className="flex items-center px-4 py-2.5 text-[12px] text-[#2C2A26] hover:bg-[#F7F6F2] rounded-md transition-colors cursor-pointer outline-none">
                        <CreditCard className="w-4 h-4 mr-3 opacity-60 text-[#716E68]" />
                        Billing & Usage
                      </Link>
                    </DropdownMenu.Item>
                    
                    <DropdownMenu.Separator className="h-px bg-[#F7F6F2] my-2" />
                    
                    <DropdownMenu.Item className="outline-none">
                      <form action="/auth/sign-out" method="POST" className="w-full">
                        <button type="submit" className="flex items-center w-full px-4 py-2.5 text-[12px] text-red-600 font-medium hover:bg-red-50 rounded-md transition-colors cursor-pointer">
                          <LogOut className="w-4 h-4 mr-3 opacity-80" />
                          Sign Out
                        </button>
                      </form>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          {/* Page Background Header (Title / Description) */}
          <header className="px-6 py-10 lg:px-12">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="max-w-2xl">
                <h1 className="text-4xl font-light tracking-tight text-[#2C2A26] font-display">{title}</h1>
                {description && <p className="mt-3 text-[#716E68] text-sm font-light leading-relaxed max-w-lg">{description}</p>}
              </div>
              {headerActions && (
                <div className="flex flex-wrap items-center gap-3">
                  {headerActions}
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 px-6 sm:px-10 lg:px-12 pb-20 max-w-7xl mx-auto w-full">
            <div className={`animate-in fade-in duration-700 ${readOnly ? "pointer-events-none opacity-60 grayscale-[0.2]" : ""}`}>
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      <div className="fixed inset-x-6 bottom-8 z-50 lg:hidden pointer-events-none">
        <Link href={primaryCta.href} className="pointer-events-auto w-full py-4 bg-[#2C2A26] text-[#F7F6F2] shadow-xl rounded-full text-center flex items-center justify-center font-medium text-sm">
          <Plus className="w-4 h-4 mr-2" />
          {primaryCta.label}
        </Link>
      </div>
      <CommandPalette />
      <AgentSidebar isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
    </div>
  );
}

