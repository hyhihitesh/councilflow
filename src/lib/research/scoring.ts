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

/**
 * Weights for different signal types. 
 * Values > 1.0 are boosters.
 * Values between 0 and 1.0 are dampers.
 * Negative values (or very low < 0.3) represent "Negative Signals" or Red Flags.
 */
const SIGNAL_TYPE_WEIGHT: Record<string, number> = {
  // High Intensity Boosters
  funding_event: 1.4,
  intent_signal: 1.35,
  mna_signal: 1.25,
  expansion_signal: 1.2,
  
  // Moderate Signals
  hiring_signal: 0.9,
  partnership_signal: 0.85,
  firmographic_update: 0.8,
  market_activity: 0.7,
  website_change_signal: 0.6,
  
  // Risk/Negative Signals (Red Flags)
  legal_risk_signal: 0.4,     // Strong damper
  layoff_signal: 0.2,          // Massive damper
  bankruptcy_signal: 0.05,     // Near-kill switch
  closing_signal: 0.0,         // Absolute kill switch
};

/**
 * Calculates a multiplier based on how recent the signal is.
 * Signals older than 180 days are ignored for scoring.
 */
function recencyMultiplier(occurredAt: string | null) {
  if (!occurredAt) return 0.5; // Unknown age is penalized
  const eventTime = Date.parse(occurredAt);
  if (Number.isNaN(eventTime)) return 0.5;

  const ageDays = (Date.now() - eventTime) / (1000 * 60 * 60 * 24);
  
  if (ageDays < 0) return 1.0;     // Future dates (weird but happens)
  if (ageDays <= 7) return 1.2;    // Very Hot (Last week)
  if (ageDays <= 30) return 1.1;   // Hot (Last month)
  if (ageDays <= 90) return 0.8;   // Warm (Last quarter)
  if (ageDays <= 180) return 0.4;  // Cold (Half year)
  return 0.0;                      // Stale (Over 6 months)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function computeProspectFitScore(signals: SignalInput[]) {
  if (!signals.length) {
    return {
      fit_score: 10,
      score_version: "v2",
      score_explanation: [{
        reason: "No active external signals detected",
        contribution: 10,
        signal_type: "none",
      }],
    };
  }

  const explanations: ScoreExplanation[] = [];
  const typeCounts: Record<string, number> = {};
  let totalScoreRaw = 0;

  // 1. Process individual signals
  for (const signal of signals) {
    const type = signal.signal_type ?? "market_activity";
    if (type === "none") continue;

    const weight = SIGNAL_TYPE_WEIGHT[type] ?? 0.7;
    const recency = recencyMultiplier(signal.occurred_at);
    
    // Skip stale signals
    if (recency === 0) continue;

    // Dampen repeating signals of the same type (Capping)
    const currentCount = typeCounts[type] || 0;
    const cappingDampener = Math.max(0.2, 1 - (currentCount * 0.3)); // Each repeat is 30% less effective
    typeCounts[type] = currentCount + 1;

    const strength = (signal.signal_strength ?? 50) / 100;
    const contribution = strength * weight * recency * cappingDampener * 25; // Base impact units
    
    totalScoreRaw += contribution;

    explanations.push({
      reason: signal.summary?.slice(0, 100) ?? `Detected ${type}`,
      contribution: Math.round(contribution * 10) / 10,
      signal_type: type,
    });
  }

  // 2. Apply Red Flag Penalties
  // If we have a layoff or bankruptcy signal, we massively penalize the total
  const hasSevereRisk = signals.some(s => s.signal_type === "bankruptcy_signal" || s.signal_type === "closing_signal");
  if (hasSevereRisk) {
    totalScoreRaw = totalScoreRaw * 0.1; // 90% drop
    explanations.push({
      reason: "CRITICAL RISK: Company may be inactive or in distress",
      contribution: -50,
      signal_type: "risk",
    });
  }

  // 3. Source Diversity Bonus
  const sources = new Set(signals.filter(s => s.signal_source).map(s => s.signal_source));
  const diversityBonus = sources.size > 1 ? (sources.size - 1) * 5 : 0;
  
  // 4. Final Final Score
  const finalScore = clamp(Math.round(totalScoreRaw + diversityBonus), 0, 100);

  // 5. Generate Top Explanations
  const finalExplanations = explanations
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  return {
    fit_score: finalScore,
    score_version: "v2",
    score_explanation: finalExplanations,
  };
}
