import { describe, expect, test } from "bun:test";
import { EMPTY_TOKEN_USAGE } from "../shared/schema";
import { aggregateNormalizedSessionsByDate, aggregateSessionsByDate } from "./aggregator";
import type { Session, SessionEvent } from "./session-schema";

const makeSession = (overrides: Partial<Session>): Session => ({
  id: "session-1",
  source: "codex",
  filePath: "/tmp/session-1.jsonl",
  fileSizeBytes: 100,
  startTime: "2026-02-21T10:00:00.000Z",
  endTime: "2026-02-21T10:01:00.000Z",
  durationMs: 60_000,
  title: "Test session",
  model: "gpt-5",
  cwd: "/tmp/ai-stats",
  repoName: "ai-stats",
  gitBranch: "main",
  cliVersion: "1.0.0",
  eventCount: 4,
  messageCount: 2,
  totalTokens: { ...EMPTY_TOKEN_USAGE },
  totalCostUsd: 0.5,
  toolCallCount: 1,
  isHousekeeping: false,
  parsedAt: "2026-02-21T10:02:00.000Z",
  ...overrides,
});

const makeEvent = (overrides: Partial<SessionEvent>): SessionEvent => ({
  id: "session-1:event-1",
  sessionId: "session-1",
  kind: "meta",
  timestamp: "2026-02-21T10:00:10.000Z",
  role: "meta",
  text: null,
  toolName: null,
  toolInput: null,
  toolOutput: null,
  model: "gpt-5",
  parentId: null,
  messageId: null,
  isDelta: false,
  tokens: null,
  costUsd: null,
  ...overrides,
});

describe("aggregateSessionsByDate", () => {
  test("tracks per-repository totals in byRepo", () => {
    const daily = aggregateSessionsByDate([
      makeSession({ id: "s1", totalCostUsd: 1.25 }),
      makeSession({ id: "s2", totalCostUsd: 0.75 }),
      makeSession({ id: "s3", repoName: "other-repo", totalCostUsd: 2.0 }),
      makeSession({ id: "s4", repoName: null, totalCostUsd: 3.0 }),
    ], { timeZone: "UTC" });

    const entry = daily["2026-02-21"];
    expect(entry).toBeDefined();
    expect(Object.keys(entry?.byRepo ?? {})).toEqual(["ai-stats", "other-repo"]);

    expect(entry?.byRepo["ai-stats"]?.sessions).toBe(2);
    expect(entry?.byRepo["ai-stats"]?.costUsd).toBe(2);
    expect(entry?.byRepo["other-repo"]?.sessions).toBe(1);
    expect(entry?.byRepo["other-repo"]?.costUsd).toBe(2);
    expect(entry?.totals.sessions).toBe(4);
  });

  test("tracks per-hour totals in byHour using startTime or parsedAt", () => {
    const daily = aggregateSessionsByDate([
      makeSession({
        id: "h1",
        startTime: "2026-02-21T10:10:00.000Z",
        parsedAt: "2026-02-21T10:30:00.000Z",
      }),
      makeSession({
        id: "h2",
        startTime: null,
        parsedAt: "2026-02-21T13:40:00.000Z",
      }),
    ], { timeZone: "UTC" });

    const entry = daily["2026-02-21"];
    expect(entry).toBeDefined();
    expect(entry?.byHour["10"]?.sessions).toBe(1);
    expect(entry?.byHour["13"]?.sessions).toBe(1);
    expect(entry?.totals.sessions).toBe(2);
  });

  test("uses requested timezone consistently for day and hour buckets", () => {
    const daily = aggregateSessionsByDate([
      makeSession({
        id: "tz-1",
        startTime: "2026-02-21T07:30:00.000Z",
        parsedAt: "2026-02-21T07:45:00.000Z",
      }),
    ], { timeZone: "America/Los_Angeles" });

    const entry = daily["2026-02-20"];
    expect(entry).toBeDefined();
    expect(entry?.byHour["23"]?.sessions).toBe(1);
    expect(entry?.byHourSource["23"]?.codex?.sessions).toBe(1);
    expect(entry?.totals.sessions).toBe(1);
    expect(daily["2026-02-21"]).toBeUndefined();
  });

  test("falls back to UTC when timezone is invalid", () => {
    const daily = aggregateSessionsByDate([
      makeSession({
        id: "tz-invalid",
        startTime: "2026-02-21T10:10:00.000Z",
      }),
    ], { timeZone: "Invalid/Timezone" });

    const entry = daily["2026-02-21"];
    expect(entry).toBeDefined();
    expect(entry?.byHour["10"]?.sessions).toBe(1);
  });

  test("attributes event token usage and spend to the event day instead of session start day", () => {
    const session = makeSession({
      id: "cross-midnight",
      startTime: "2026-02-21T23:55:00.000Z",
      endTime: "2026-02-22T00:10:00.000Z",
      parsedAt: "2026-02-22T00:11:00.000Z",
      totalTokens: {
        inputTokens: 500,
        outputTokens: 200,
        cacheReadTokens: 100,
        cacheWriteTokens: 0,
        reasoningTokens: 50,
      },
      totalCostUsd: 1.23,
      messageCount: 2,
      toolCallCount: 1,
    });

    const daily = aggregateNormalizedSessionsByDate([
      {
        session,
        events: [
          makeEvent({
            id: "cross-midnight:event-1",
            timestamp: "2026-02-22T00:05:00.000Z",
            model: "gpt-5.3-codex",
            tokens: {
              inputTokens: 500,
              outputTokens: 200,
              cacheReadTokens: 100,
              cacheWriteTokens: 0,
              reasoningTokens: 50,
            },
            costUsd: 1.23,
          }),
        ],
      },
    ], { timeZone: "UTC" });

    expect(daily["2026-02-21"]?.totals.sessions).toBe(1);
    expect(daily["2026-02-21"]?.totals.costUsd).toBe(0);
    expect(daily["2026-02-22"]?.totals.sessions).toBe(0);
    expect(daily["2026-02-22"]?.totals.costUsd).toBeCloseTo(1.23, 10);
    expect(daily["2026-02-22"]?.totals.reasoningTokens).toBe(50);
    expect(daily["2026-02-22"]?.byHour["00"]?.costUsd).toBeCloseTo(1.23, 10);
  });

  test("attributes mixed-model token usage to the model that produced it", () => {
    const session = makeSession({
      id: "mixed-model",
      model: "gpt-5.3-codex",
      totalTokens: {
        inputTokens: 300,
        outputTokens: 120,
        cacheReadTokens: 80,
        cacheWriteTokens: 0,
        reasoningTokens: 20,
      },
      totalCostUsd: 0.84,
    });

    const daily = aggregateNormalizedSessionsByDate([
      {
        session,
        events: [
          makeEvent({
            id: "mixed-model:event-1",
            timestamp: "2026-02-21T10:02:00.000Z",
            model: "gpt-5.3-codex",
            tokens: {
              inputTokens: 200,
              outputTokens: 70,
              cacheReadTokens: 50,
              cacheWriteTokens: 0,
              reasoningTokens: 10,
            },
            costUsd: 0.5,
          }),
          makeEvent({
            id: "mixed-model:event-2",
            timestamp: "2026-02-21T10:05:00.000Z",
            model: "gpt-5.4",
            tokens: {
              inputTokens: 100,
              outputTokens: 50,
              cacheReadTokens: 30,
              cacheWriteTokens: 0,
              reasoningTokens: 10,
            },
            costUsd: 0.34,
          }),
        ],
      },
    ], { timeZone: "UTC" });

    const entry = daily["2026-02-21"];
    expect(entry?.byModel["gpt-5.3-codex"]?.costUsd).toBeCloseTo(0.5, 10);
    expect(entry?.byModel["gpt-5.3-codex"]?.inputTokens).toBe(200);
    expect(entry?.byModel["gpt-5.3-codex"]?.sessions).toBe(1);
    expect(entry?.byModel["gpt-5.4"]?.costUsd).toBeCloseTo(0.34, 10);
    expect(entry?.byModel["gpt-5.4"]?.inputTokens).toBe(100);
    expect(entry?.byModel["gpt-5.4"]?.sessions).toBe(0);
    expect(entry?.totals.costUsd).toBeCloseTo(0.84, 10);
  });
});
