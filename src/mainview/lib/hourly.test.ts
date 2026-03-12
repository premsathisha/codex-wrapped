import { describe, expect, test } from "bun:test";
import { formatHourLabel, hasHourlyActivity } from "./hourly";

describe("hourly helpers", () => {
  test("formats 24-hour values into am/pm labels", () => {
    expect(formatHourLabel(0)).toBe("12 AM");
    expect(formatHourLabel(1)).toBe("1 AM");
    expect(formatHourLabel(11)).toBe("11 AM");
    expect(formatHourLabel(12)).toBe("12 PM");
    expect(formatHourLabel(15)).toBe("3 PM");
    expect(formatHourLabel(23)).toBe("11 PM");
  });

  test("detects when at least one hourly row has activity", () => {
    expect(
      hasHourlyActivity([
        { sessions: 0, tokens: 0, costUsd: 0, durationMs: 0 },
        { sessions: 1, tokens: 0, costUsd: 0, durationMs: 0 },
      ]),
    ).toBe(true);

    expect(
      hasHourlyActivity([
        { sessions: 0, tokens: 0, costUsd: 0, durationMs: 0 },
        { sessions: 0, tokens: 0, costUsd: 0, durationMs: 0 },
      ]),
    ).toBe(false);
  });
});
