import { describe, expect, it } from "vitest";

import { isUtcWednesday, toUtcDateKey, toUtcIsoWeekStartKey } from "@/lib/scheduler/windows";

describe("scheduler windows", () => {
  it("returns utc date key", () => {
    const date = new Date("2026-02-18T14:30:00.000Z");

    expect(toUtcDateKey(date)).toBe("2026-02-18");
  });

  it("returns monday key for any day in the week", () => {
    const wednesday = new Date("2026-02-18T14:30:00.000Z");
    const sunday = new Date("2026-02-22T23:59:59.000Z");

    expect(toUtcIsoWeekStartKey(wednesday)).toBe("2026-02-16");
    expect(toUtcIsoWeekStartKey(sunday)).toBe("2026-02-16");
  });

  it("detects utc wednesday correctly", () => {
    expect(isUtcWednesday(new Date("2026-02-18T00:00:00.000Z"))).toBe(true);
    expect(isUtcWednesday(new Date("2026-02-19T00:00:00.000Z"))).toBe(false);
  });
});
