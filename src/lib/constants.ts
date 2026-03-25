export const PIPELINE_STAGES = [
  "researched",
  "approved",
  "sent",
  "replied",
  "meeting",
  "won",
  "lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
