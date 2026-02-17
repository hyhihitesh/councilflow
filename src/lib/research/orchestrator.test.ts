import { describe, expect, it } from "vitest";

import { buildResearchRunSummary, getRetryProspectIds, nextRetryCount } from "./orchestrator";

describe("research orchestrator helpers", () => {
  it("returns retry prospect ids from prior run summary", () => {
    expect(
      getRetryProspectIds({
        failed_prospect_ids: ["p1", "p2", 3],
      }),
    ).toEqual(["p1", "p2"]);
  });

  it("computes next retry count safely", () => {
    expect(nextRetryCount(0)).toBe(1);
    expect(nextRetryCount(2)).toBe(3);
    expect(nextRetryCount(null)).toBe(1);
  });

  it("builds normalized run summary", () => {
    const summary = buildResearchRunSummary({
      totalProspects: 3,
      succeededProspects: ["p1", "p2"],
      failedProspects: [{ prospect_id: "p3", error: "timeout" }],
      providerSuccessCount: 5,
      providerFailureCount: 1,
    });

    expect(summary).toMatchObject({
      total_prospects: 3,
      succeeded_prospect_ids: ["p1", "p2"],
      failed_prospect_ids: ["p3"],
      provider_success_count: 5,
      provider_failure_count: 1,
    });
  });
});
