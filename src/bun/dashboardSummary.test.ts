import { describe, expect, test } from "bun:test";
import { buildTopRepos, tokenTotalFromStats } from "./dashboardSummary";
import { createEmptyDayStats, type DayStats } from "./store";

const makeStats = (overrides: Partial<DayStats>): DayStats => ({
  ...createEmptyDayStats(),
  ...overrides,
});

describe("dashboardSummary", () => {
  test("tokenTotalFromStats sums all token buckets", () => {
    const total = tokenTotalFromStats(
      makeStats({
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        reasoningTokens: 2,
      }),
    );

    expect(total).toBe(150);
  });

  test("buildTopRepos includes tokens and duration with stable ordering", () => {
    const byRepo = new Map<string, DayStats>([
      [
        "beta",
        makeStats({
          sessions: 2,
          inputTokens: 15,
          outputTokens: 5,
          costUsd: 0.25,
          durationMs: 120_000,
        }),
      ],
      [
        "alpha",
        makeStats({
          sessions: 2,
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 3,
          reasoningTokens: 2,
          costUsd: 0.5,
          durationMs: 90_000,
        }),
      ],
      [
        "zero",
        makeStats({
          sessions: 0,
          inputTokens: 999,
          durationMs: 999,
        }),
      ],
    ]);

    const topRepos = buildTopRepos(byRepo);
    expect(topRepos).toHaveLength(3);
    expect(topRepos[0]).toEqual({
      repo: "zero",
      sessions: 0,
      tokens: 999,
      costUsd: 0,
      durationMs: 999,
    });
    expect(topRepos[1]).toEqual({
      repo: "alpha",
      sessions: 2,
      tokens: 35,
      costUsd: 0.5,
      durationMs: 90_000,
    });
    expect(topRepos[2]).toEqual({
      repo: "beta",
      sessions: 2,
      tokens: 20,
      costUsd: 0.25,
      durationMs: 120_000,
    });
  });

  test("buildTopRepos keeps high-activity zero-session repos inside the top 24 cutoff", () => {
    const byRepo = new Map<string, DayStats>();

    for (let index = 0; index < 24; index += 1) {
      byRepo.set(
        `session-repo-${index}`,
        makeStats({
          sessions: 1,
          inputTokens: 10 + index,
          costUsd: 0.01,
        }),
      );
    }

    byRepo.set(
      "spawned-agent-heavy",
      makeStats({
        sessions: 0,
        inputTokens: 10_000,
        costUsd: 5,
      }),
    );

    const topRepos = buildTopRepos(byRepo);
    expect(topRepos).toHaveLength(24);
    expect(topRepos.some((repo) => repo.repo === "spawned-agent-heavy")).toBe(true);
    expect(topRepos[0]?.repo).toBe("spawned-agent-heavy");
  });

  test("buildTopRepos consolidates alias repos using shared meaningful tokens and latest name", () => {
    const byRepo = new Map<string, DayStats>([
      [
        "AI Wrapped",
        makeStats({
          sessions: 2,
          inputTokens: 100,
          outputTokens: 20,
          costUsd: 0.4,
          durationMs: 120_000,
        }),
      ],
      [
        "ai-wrapped-1.8.1",
        makeStats({
          sessions: 1,
          inputTokens: 50,
          outputTokens: 10,
          costUsd: 0.2,
          durationMs: 60_000,
        }),
      ],
      [
        "Codex Wrapped",
        makeStats({
          sessions: 3,
          inputTokens: 200,
          outputTokens: 40,
          costUsd: 0.8,
          durationMs: 240_000,
        }),
      ],
      [
        "another-project",
        makeStats({
          sessions: 1,
          inputTokens: 10,
        }),
      ],
    ]);

    const repoLastSeen = new Map<string, string>([
      ["AI Wrapped", "2026-03-01"],
      ["ai-wrapped-1.8.1", "2026-03-10"],
      ["Codex Wrapped", "2026-03-25"],
      ["another-project", "2026-03-20"],
    ]);

    const topRepos = buildTopRepos(byRepo, repoLastSeen);
    const wrapped = topRepos.find((row) => row.repo === "Codex Wrapped");

    expect(wrapped).toBeDefined();
    expect(wrapped?.repo).toBe("Codex Wrapped");
    expect(wrapped?.sessions).toBe(6);
    expect(wrapped?.tokens).toBe(420);
    expect(wrapped?.costUsd).toBeCloseTo(1.4, 10);
    expect(wrapped?.durationMs).toBe(420_000);
    expect(topRepos.some((row) => row.repo === "AI Wrapped")).toBe(false);
    expect(topRepos.some((row) => row.repo === "ai-wrapped-1.8.1")).toBe(false);
    expect(topRepos.some((row) => row.repo === "another-project")).toBe(true);
  });
});
