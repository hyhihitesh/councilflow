import { describe, expect, it } from "vitest";

import { validatePipelineStageMove } from "@/lib/pipeline/stage-transition";

describe("validatePipelineStageMove", () => {
  it("allows non-terminal transitions", () => {
    expect(
      validatePipelineStageMove({
        fromStage: "sent",
        toStage: "meeting",
      }),
    ).toEqual({ ok: true });
  });

  it("blocks transitions from won and lost", () => {
    expect(
      validatePipelineStageMove({
        fromStage: "won",
        toStage: "replied",
      }),
    ).toMatchObject({ ok: false, code: "unauthorized_stage_mutation" });

    expect(
      validatePipelineStageMove({
        fromStage: "lost",
        toStage: "approved",
      }),
    ).toMatchObject({ ok: false, code: "unauthorized_stage_mutation" });
  });
});
