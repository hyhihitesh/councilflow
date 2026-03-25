import { describe, expect, it } from "vitest";

import { getStepFromSearchParam, validateOnboardingStep } from "../../app/onboarding/validation";

function buildValidFormData() {
  const formData = new FormData();
  formData.set("display_name", "Hitesh");
  formData.set("firm_name", "CouncilFlow Legal LLP");
  formData.set("practice_areas", "Corporate, Employment");
  formData.set("office_location", "New York, NY");
  formData.set("avg_matter_value", "15000");
  formData.set("icp_industries", "SaaS, Fintech");
  formData.set("icp_company_sizes", "11-50, 51-200");
  formData.set("icp_geography", "US East Coast");
  formData.set("voice_tone", "professional");
  formData.set(
    "voice_sample",
    "We help growing teams reduce legal friction while staying practical and business focused.",
  );
  return formData;
}

describe("onboarding step validation", () => {
  it("normalizes step query param into safe index", () => {
    expect(getStepFromSearchParam(undefined)).toBe(0);
    expect(getStepFromSearchParam("2")).toBe(2);
    expect(getStepFromSearchParam("100")).toBe(3);
    expect(getStepFromSearchParam("-9")).toBe(0);
    expect(getStepFromSearchParam("oops")).toBe(0);
  });

  it("accepts valid data for each step", () => {
    const formData = buildValidFormData();
    expect(validateOnboardingStep(formData, 0).ok).toBe(true);
    expect(validateOnboardingStep(formData, 1).ok).toBe(true);
    expect(validateOnboardingStep(formData, 2).ok).toBe(true);
    expect(validateOnboardingStep(formData, 3).ok).toBe(true);
  });

  it("blocks too-short voice sample on voice step", () => {
    const formData = buildValidFormData();
    formData.set("voice_sample", "too short");
    const result = validateOnboardingStep(formData, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("at least 40 characters");
    }
  });
});
