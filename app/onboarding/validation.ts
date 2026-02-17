export const ONBOARDING_STEPS = ["Workspace", "Profile", "ICP", "Voice"] as const;

function asText(input: FormDataEntryValue | null | undefined) {
  if (typeof input !== "string") return "";
  return input.trim();
}

function parseCsv(input: FormDataEntryValue | null | undefined) {
  return asText(input)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function getStepFromSearchParam(value: string | undefined, maxStep = ONBOARDING_STEPS.length - 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(maxStep, Math.floor(parsed)));
}

export function validateOnboardingStep(formData: FormData, step: number) {
  if (step === 0) {
    const displayName = asText(formData.get("display_name"));
    const firmName = asText(formData.get("firm_name"));
    if (displayName.length < 2) {
      return { ok: false as const, message: "Display name must be at least 2 characters." };
    }
    if (firmName.length < 2) {
      return { ok: false as const, message: "Firm name must be at least 2 characters." };
    }
  }

  if (step === 1) {
    const practiceAreas = parseCsv(formData.get("practice_areas"));
    const officeLocation = asText(formData.get("office_location"));
    const avgMatterValue = Number(asText(formData.get("avg_matter_value")));
    if (practiceAreas.length === 0) {
      return { ok: false as const, message: "Add at least one practice area." };
    }
    if (!officeLocation) {
      return { ok: false as const, message: "Office location is required." };
    }
    if (!Number.isFinite(avgMatterValue) || avgMatterValue <= 0) {
      return { ok: false as const, message: "Average matter value must be greater than 0." };
    }
  }

  if (step === 2) {
    const industries = parseCsv(formData.get("icp_industries"));
    const sizes = parseCsv(formData.get("icp_company_sizes"));
    const geography = asText(formData.get("icp_geography"));
    if (industries.length === 0) {
      return { ok: false as const, message: "Add at least one ICP industry." };
    }
    if (sizes.length === 0) {
      return { ok: false as const, message: "Add at least one ICP company size." };
    }
    if (!geography) {
      return { ok: false as const, message: "ICP geography is required." };
    }
  }

  if (step === 3) {
    const voiceTone = asText(formData.get("voice_tone"));
    const voiceSample = asText(formData.get("voice_sample"));
    if (!voiceTone) {
      return { ok: false as const, message: "Preferred voice tone is required." };
    }
    if (voiceSample && voiceSample.length < 40) {
      return { ok: false as const, message: "Voice sample must be at least 40 characters if provided." };
    }
  }

  return { ok: true as const };
}

