import type { DashboardSummary } from "../shared/schema";
import type { DayStats } from "./store";

export const tokenTotalFromStats = (stats: DayStats): number =>
  stats.inputTokens +
  stats.outputTokens +
  stats.cacheReadTokens +
  stats.cacheWriteTokens +
  stats.reasoningTokens;

const REPO_STOP_TOKENS = new Set([
  "app",
  "apps",
  "api",
  "client",
  "server",
  "service",
  "services",
  "project",
  "projects",
  "repo",
  "repos",
  "session",
  "sessions",
  "frontend",
  "backend",
  "test",
  "tests",
  "demo",
  "tmp",
  "temp",
  "sandbox",
]);

const tokenizeRepo = (repo: string): Set<string> => {
  const normalized = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (normalized.length === 0) return new Set();

  return new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 4 && !/^\d+$/.test(token) && !REPO_STOP_TOKENS.has(token),
      ),
  );
};

const reposShareMeaningfulToken = (left: string, right: string): boolean => {
  if (left.trim().toLowerCase() === right.trim().toLowerCase()) return true;

  const leftTokens = tokenizeRepo(left);
  const rightTokens = tokenizeRepo(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) return true;
  }

  return false;
};

const addStats = (target: DayStats, source: DayStats): void => {
  target.sessions += source.sessions;
  target.messages += source.messages;
  target.toolCalls += source.toolCalls;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.costUsd += source.costUsd;
  target.durationMs += source.durationMs;
};

interface ConsolidatedRepo {
  canonicalRepo: string;
  stats: DayStats;
}

const chooseCanonicalRepo = (
  names: string[],
  byRepoMap: Map<string, DayStats>,
  repoLastSeenDateMap: Map<string, string>,
): string => {
  const sorted = [...names].sort((left, right) => {
    const leftDate = repoLastSeenDateMap.get(left) ?? "";
    const rightDate = repoLastSeenDateMap.get(right) ?? "";
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);

    const leftStats = byRepoMap.get(left);
    const rightStats = byRepoMap.get(right);
    const leftTokens = leftStats ? tokenTotalFromStats(leftStats) : 0;
    const rightTokens = rightStats ? tokenTotalFromStats(rightStats) : 0;
    if (leftTokens !== rightTokens) return rightTokens - leftTokens;

    const leftCost = leftStats?.costUsd ?? 0;
    const rightCost = rightStats?.costUsd ?? 0;
    if (leftCost !== rightCost) return rightCost - leftCost;

    const leftSessions = leftStats?.sessions ?? 0;
    const rightSessions = rightStats?.sessions ?? 0;
    if (leftSessions !== rightSessions) return rightSessions - leftSessions;

    const leftDuration = leftStats?.durationMs ?? 0;
    const rightDuration = rightStats?.durationMs ?? 0;
    if (leftDuration !== rightDuration) return rightDuration - leftDuration;

    return left.localeCompare(right);
  });

  return sorted[0] as string;
};

const consolidateRepos = (
  byRepoMap: Map<string, DayStats>,
  repoLastSeenDateMap: Map<string, string>,
): ConsolidatedRepo[] => {
  const repos = [...byRepoMap.keys()];
  const visited = new Set<string>();
  const consolidated: ConsolidatedRepo[] = [];

  for (const repo of repos) {
    if (visited.has(repo)) continue;

    const stack = [repo];
    const cluster: string[] = [];
    visited.add(repo);

    while (stack.length > 0) {
      const current = stack.pop() as string;
      cluster.push(current);

      for (const candidate of repos) {
        if (visited.has(candidate)) continue;
        if (!reposShareMeaningfulToken(current, candidate)) continue;
        visited.add(candidate);
        stack.push(candidate);
      }
    }

    const canonicalRepo = chooseCanonicalRepo(cluster, byRepoMap, repoLastSeenDateMap);
    const stats: DayStats = {
      sessions: 0,
      messages: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
      durationMs: 0,
    };

    for (const name of cluster) {
      const source = byRepoMap.get(name);
      if (!source) continue;
      addStats(stats, source);
    }

    consolidated.push({ canonicalRepo, stats });
  }

  return consolidated;
};

export const buildTopRepos = (
  byRepoMap: Map<string, DayStats>,
  repoLastSeenDateMap: Map<string, string> = new Map(),
): DashboardSummary["topRepos"] =>
  consolidateRepos(byRepoMap, repoLastSeenDateMap)
    .map(({ canonicalRepo, stats }) => ({
      repo: canonicalRepo,
      sessions: stats.sessions,
      tokens: tokenTotalFromStats(stats),
      costUsd: stats.costUsd,
      durationMs: stats.durationMs,
    }))
    .filter((entry) => entry.sessions > 0 || entry.tokens > 0 || entry.costUsd > 0 || entry.durationMs > 0)
    .sort((left, right) => {
      if (right.tokens !== left.tokens) return right.tokens - left.tokens;
      if (right.costUsd !== left.costUsd) return right.costUsd - left.costUsd;
      if (right.sessions !== left.sessions) return right.sessions - left.sessions;
      if (right.durationMs !== left.durationMs) return right.durationMs - left.durationMs;
      return left.repo.localeCompare(right.repo);
    })
    .slice(0, 24);
