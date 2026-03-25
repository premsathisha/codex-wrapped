import { describe, expect, test } from "bun:test";
import { hasTimelineActivity } from "./activity";

describe("timeline activity helpers", () => {
  test("counts subagent-only token activity as active", () => {
    expect(
      hasTimelineActivity({
        sessions: 0,
        tokens: 2500,
        costUsd: 1.25,
        durationMs: 0,
        messages: 0,
        toolCalls: 0,
      }),
    ).toBe(true);
  });

  test("treats fully empty rows as inactive", () => {
    expect(
      hasTimelineActivity({
        sessions: 0,
        tokens: 0,
        costUsd: 0,
        durationMs: 0,
        messages: 0,
        toolCalls: 0,
      }),
    ).toBe(false);
  });
});
