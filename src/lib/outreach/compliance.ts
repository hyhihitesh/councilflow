export type ComplianceSeverity = "pass" | "warning" | "fail";

export type ComplianceCheck = {
  id: string;
  label: string;
  severity: ComplianceSeverity;
  message: string;
};

export type ComplianceSummary = {
  status: ComplianceSeverity;
  checks: ComplianceCheck[];
};

const GUARANTEED_OUTCOME_REGEX =
  /\b(guarantee|guaranteed|certain win|sure win|no risk|100%|always win)\b/i;
const LEGAL_ADVICE_REGEX =
  /\b(legal advice|you should sue|we will win your case|definitely liable)\b/i;

export function evaluateOutreachCompliance(input: {
  subject: string;
  body: string;
  voiceScore: number | null;
}) {
  const checks: ComplianceCheck[] = [];
  const subject = input.subject.trim();
  const body = input.body.trim();

  checks.push({
    id: "subject_length",
    label: "Subject length",
    severity: subject.length >= 5 && subject.length <= 120 ? "pass" : "fail",
    message:
      subject.length >= 5 && subject.length <= 120
        ? "Subject length is within deliverability guidelines."
        : "Subject must be between 5 and 120 characters.",
  });

  checks.push({
    id: "body_length",
    label: "Body length",
    severity: body.length >= 30 && body.length <= 1800 ? "pass" : "fail",
    message:
      body.length >= 30 && body.length <= 1800
        ? "Body length is acceptable."
        : "Body should be between 30 and 1800 characters.",
  });

  checks.push({
    id: "guaranteed_outcomes",
    label: "Guaranteed outcomes",
    severity: GUARANTEED_OUTCOME_REGEX.test(body) ? "fail" : "pass",
    message: GUARANTEED_OUTCOME_REGEX.test(body)
      ? "Remove guaranteed-outcome language before sending."
      : "No guaranteed-outcome claims detected.",
  });

  checks.push({
    id: "legal_advice_claims",
    label: "Legal advice claims",
    severity: LEGAL_ADVICE_REGEX.test(body) ? "fail" : "pass",
    message: LEGAL_ADVICE_REGEX.test(body)
      ? "Potential legal-advice claim detected. Rewrite before sending."
      : "No direct legal-advice claim patterns detected.",
  });

  checks.push({
    id: "cta_presence",
    label: "Clear CTA",
    severity: /\?/.test(body) ? "pass" : "warning",
    message: /\?/.test(body)
      ? "Draft includes a clear response prompt."
      : "Consider adding a direct question as a call-to-action.",
  });

  checks.push({
    id: "voice_score",
    label: "Voice match",
    severity:
      input.voiceScore === null ? "warning" : input.voiceScore >= 70 ? "pass" : "warning",
    message:
      input.voiceScore === null
        ? "Voice score unavailable."
        : input.voiceScore >= 70
          ? "Voice score is in acceptable range."
          : "Voice score is low; consider editing for tone.",
  });

  const status = checks.some((check) => check.severity === "fail")
    ? "fail"
    : checks.some((check) => check.severity === "warning")
      ? "warning"
      : "pass";

  return {
    status,
    checks,
  } satisfies ComplianceSummary;
}
