type ResearchRunSummary = {
  failed_prospect_ids?: unknown;
};

export function getRetryProspectIds(runSummary: ResearchRunSummary | null | undefined) {
  if (!runSummary || !Array.isArray(runSummary.failed_prospect_ids)) {
    return [];
  }

  return runSummary.failed_prospect_ids.filter((value): value is string => typeof value === "string");
}

export function nextRetryCount(currentRetryCount: number | null | undefined) {
  return Math.max(0, currentRetryCount ?? 0) + 1;
}

export function buildResearchRunSummary(input: {
  totalProspects: number;
  succeededProspects: string[];
  failedProspects: Array<{ prospect_id: string; error: string }>;
  providerSuccessCount: number;
  providerFailureCount: number;
}) {
  return {
    total_prospects: input.totalProspects,
    succeeded_prospect_ids: input.succeededProspects,
    failed_prospect_ids: input.failedProspects.map((item) => item.prospect_id),
    failed_items: input.failedProspects,
    provider_success_count: input.providerSuccessCount,
    provider_failure_count: input.providerFailureCount,
  };
}
