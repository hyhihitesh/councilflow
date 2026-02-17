type SignalInput = {
  signal_type: string | null;
  signal_source: string | null;
  signal_strength: number | null;
  summary: string | null;
  occurred_at: string | null;
};

type ScoreExplanation = {
  reason: string;
  contribution: number;
  signal_type: string;
};

const SIGNAL_TYPE_WEIGHT: Record<string, number> = {
  funding_event: 1.2,
  expansion_signal: 1.05,
  mna_signal: 1.1,
  legal_risk_signal: 0.95,
  compliance_signal: 0.9,
  hiring_signal: 0.8,
  website_change_signal: 0.6,
  market_activity: 0.7,
};

function recencyMultiplier(occurredAt: string | null) {
  if (!occurredAt) return 0.9;
  const eventTime = Date.parse(occurredAt);
  if (Number.isNaN(eventTime)) return 0.9;

  const ageDays = (Date.now() - eventTime) / (1000 * 60 * 60 * 24);
  if (ageDays <= 14) return 1.1;
  if (ageDays <= 45) return 1.0;
  if (ageDays <= 90) return 0.85;
  return 0.7;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function computeProspectFitScore(signals: SignalInput[]) {
  if (!signals.length) {
    return {
      fit_score: 12,
      score_version: "v1",
      score_explanation: [
        {
          reason: "No active external signals yet",
          contribution: 12,
          signal_type: "none",
        },
      ],
    };
  }

  const explanations: ScoreExplanation[] = [];
  let weightedTotal = 0;

  for (const signal of signals) {
    const type = signal.signal_type ?? "market_activity";
    const weight = SIGNAL_TYPE_WEIGHT[type] ?? 0.7;
    const strength = clamp(signal.signal_strength ?? 50, 10, 100);
    const recency = recencyMultiplier(signal.occurred_at);

    const contribution = (strength / 100) * weight * recency * 20;
    weightedTotal += contribution;

    explanations.push({
      reason: signal.summary?.slice(0, 120) ?? `Detected ${type}`,
      contribution: Math.round(contribution * 10) / 10,
      signal_type: type,
    });
  }

  const sourceDiversity = new Set(signals.map((signal) => signal.signal_source ?? "unknown")).size;
  const diversityBonus = Math.min(8, sourceDiversity * 2.5);
  const finalScore = clamp(Math.round(weightedTotal + diversityBonus), 0, 100);

  const topReasons = explanations
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 4);

  return {
    fit_score: finalScore,
    score_version: "v1",
    score_explanation: topReasons,
  };
}
