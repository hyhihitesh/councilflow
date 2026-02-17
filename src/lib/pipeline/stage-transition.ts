import type { PipelineStage } from "@/lib/followup/rules";

export type PipelineStageMoveInput = {
  fromStage: PipelineStage;
  toStage: PipelineStage;
};

export type PipelineStageMoveResult =
  | { ok: true }
  | { ok: false; code: "unauthorized_stage_mutation"; message: string };

const TERMINAL_STAGES = new Set<PipelineStage>(["won", "lost"]);

export function validatePipelineStageMove(input: PipelineStageMoveInput): PipelineStageMoveResult {
  const { fromStage, toStage } = input;

  if (fromStage === toStage) {
    return { ok: true };
  }

  if (TERMINAL_STAGES.has(fromStage)) {
    return {
      ok: false,
      code: "unauthorized_stage_mutation",
      message: "Prospects in won/lost cannot be moved without explicit reopen flow.",
    };
  }

  return { ok: true };
}
