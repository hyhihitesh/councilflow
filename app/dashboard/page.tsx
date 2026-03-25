import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { ZenToggle } from "@/components/dashboard/zen-toggle";
import { getFirmAccessState } from "@/lib/billing/entitlements";

// Modular Dashboard Components
import { BillingSection } from "@/components/dashboard/billing-section";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { FunnelSection } from "@/components/dashboard/funnel-section";
import { ProspectsSection } from "@/components/dashboard/prospects-section";
import { ActivitySection } from "@/components/dashboard/activity-section";
import { AuthProvidersSection } from "@/components/dashboard/auth-providers-section";
import { TeamSection } from "@/components/dashboard/team-section";
import { EnrichmentSection } from "@/components/dashboard/enrichment-section";
import { ReportingSection } from "@/components/dashboard/reporting-section";
import { CalendarSection } from "@/components/dashboard/calendar-section";
import { ResearchSection } from "@/components/dashboard/research-section";
import { ManualIngestionForm } from "@/components/dashboard/manual-ingestion-form";

// Skeletons
import {
  SectionSkeleton,
  StatsSkeleton,
  TableSkeleton,
} from "@/components/dashboard/dashboard-skeleton";

type SearchParams = {
  error?: string;
  message?: string;
  q?: string;
  status?: string;
  min_score?: string;
  zen?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { user, firmId, role, firmName } = await requireAuth();

  // Basic context needed for the Shell
  const { supabase } = await requireAuth(); // We need a fresh one or just use the one from requireAuth if it's exported
  const accessState = await getFirmAccessState({ supabase, firmId });
  
  const isZen = params.zen === "true";
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.status?.trim().toLowerCase() ?? "all";
  const minScore = params.min_score ? Number(params.min_score) : undefined;

  return (
    <AppShell
      title={`Welcome${user.email ? `, ${user.email}` : ""}`}
      description={`Firm: ${firmName ?? "Unknown"} | Role: ${role}`}
      userEmail={user.email}
      billingAccessState={accessState.ok ? accessState.accessState : "active"}
      billingAccessContext={
        accessState.ok
          ? {
              trialEndsAt: accessState.trialEndsAt,
              graceEndsAt: accessState.graceEndsAt,
            }
          : undefined
      }
      currentPath="/dashboard"
      headerActions={
        <>
          <ZenToggle />
          <Link
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
            href="/prospects"
          >
            Prospect Queue
          </Link>
          <Link
            className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors uppercase tracking-widest shadow-sm"
            href="/outreach"
          >
            New Outreach
          </Link>
        </>
      }
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {isZen && (
          <div className="absolute top-4 right-8 flex items-center gap-2 px-3 py-1 bg-[#2C2A26]/5 rounded-full animate-in fade-in zoom-in duration-500">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6B705C] animate-pulse"></div>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B705C]">
              Zen Mode Active
            </span>
          </div>
        )}

        {params.error && <p className="mt-4 alert-error">{params.error}</p>}
        {params.message && <p className="mt-4 alert-success">{params.message}</p>}

        {!isZen && (
          <Suspense fallback={<SectionSkeleton />}>
            <BillingSection firmId={firmId} isOwner={role === "owner"} />
          </Suspense>
        )}

        <Suspense fallback={<StatsSkeleton />}>
          <QuickStats firmId={firmId} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <FunnelSection firmId={firmId} />
        </Suspense>

        <Suspense fallback={<TableSkeleton />}>
          <ProspectsSection
            firmId={firmId}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            minScore={minScore}
          />
        </Suspense>

        {!isZen && (
          <>
            <Suspense fallback={<SectionSkeleton />}>
              <ActivitySection firmId={firmId} />
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <AuthProvidersSection />
            </Suspense>

            <Suspense fallback={<TableSkeleton />}>
              <TeamSection firmId={firmId} userId={user.id} isOwner={role === "owner"} />
            </Suspense>

            <Suspense fallback={<TableSkeleton />}>
              <EnrichmentSection firmId={firmId} />
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <ReportingSection firmId={firmId} />
            </Suspense>

            <Suspense fallback={<TableSkeleton />}>
              <CalendarSection firmId={firmId} />
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <ResearchSection firmId={firmId} />
            </Suspense>

            <ManualIngestionForm firmId={firmId} />
          </>
        )}
      </div>
    </AppShell>
  );
}
