import type { Session, SessionEvent } from "./session-schema";
import {
  createEmptyDayStats,
  type DailyAggregateEntry,
  type DailyStore,
  type DayStats,
} from "./store";

const DEFAULT_TIME_ZONE = "UTC";

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

const parseTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (typeof timestamp !== "string" || timestamp.length < 10) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const parseSessionTimestamp = (session: Session): Date | null => parseTimestamp(session.startTime ?? session.parsedAt);

const resolveFormatterTimeZone = (timeZone?: string): string => {
  const candidate =
    typeof timeZone === "string" && timeZone.trim().length > 0
      ? timeZone.trim()
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) {
    return DEFAULT_TIME_ZONE;
  }

  try {
    // Validate the zone before use. Falls back to UTC for invalid identifiers.
    void new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

const formatDateKey = (date: Date, formatter: Intl.DateTimeFormat): string => {
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
};

const formatHourKey = (date: Date, formatter: Intl.DateTimeFormat): string | null => {
  const hourValue = formatter.formatToParts(date).find((part) => part.type === "hour")?.value;
  if (!hourValue) return null;

  const hourNum = Number(hourValue);
  if (!Number.isFinite(hourNum)) return null;

  return String(hourNum).padStart(2, "0");
};

const toDayKey = (session: Session, dateFormatter: Intl.DateTimeFormat): string => {
  const parsed = parseSessionTimestamp(session);
  if (parsed) {
    return formatDateKey(parsed, dateFormatter);
  }

  const fallback = session.startTime ?? session.parsedAt;
  if (typeof fallback === "string" && fallback.length >= 10) {
    return fallback.slice(0, 10);
  }

  return formatDateKey(new Date(), dateFormatter);
};

const toHourKey = (session: Session, hourFormatter: Intl.DateTimeFormat): string | null => {
  const parsed = parseSessionTimestamp(session);
  if (!parsed) return null;

  return formatHourKey(parsed, hourFormatter);
};

const toSessionStats = (session: Session, includeRollupStats: boolean): DayStats => ({
  sessions: 1,
  messages: includeRollupStats ? session.messageCount : 0,
  toolCalls: includeRollupStats ? session.toolCallCount : 0,
  inputTokens: includeRollupStats ? session.totalTokens.inputTokens : 0,
  outputTokens: includeRollupStats ? session.totalTokens.outputTokens : 0,
  cacheReadTokens: includeRollupStats ? session.totalTokens.cacheReadTokens : 0,
  cacheWriteTokens: includeRollupStats ? session.totalTokens.cacheWriteTokens : 0,
  reasoningTokens: includeRollupStats ? session.totalTokens.reasoningTokens : 0,
  costUsd: includeRollupStats ? session.totalCostUsd ?? 0 : 0,
  durationMs: session.durationMs ?? 0,
});

const toEventStats = (event: SessionEvent): DayStats => ({
  sessions: 0,
  messages: event.kind === "user" || event.kind === "assistant" ? 1 : 0,
  toolCalls: event.kind === "tool_call" ? 1 : 0,
  inputTokens: event.tokens?.inputTokens ?? 0,
  outputTokens: event.tokens?.outputTokens ?? 0,
  cacheReadTokens: event.tokens?.cacheReadTokens ?? 0,
  cacheWriteTokens: event.tokens?.cacheWriteTokens ?? 0,
  reasoningTokens: event.tokens?.reasoningTokens ?? 0,
  costUsd: event.costUsd ?? 0,
  durationMs: 0,
});

const toRepoKey = (repoName: string | null): string | null => {
  if (!repoName) return null;
  const trimmed = repoName.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureDateEntry = (daily: DailyStore, date: string): DailyAggregateEntry => {
  const existing = daily[date];
  if (existing) {
    return existing;
  }

  const created: DailyAggregateEntry = {
    bySource: {},
    byModel: {},
    byRepo: {},
    byHour: {},
    byHourSource: {},
    totals: createEmptyDayStats(),
  };
  daily[date] = created;
  return created;
};

const ensureBucket = (buckets: Record<string, DayStats>, key: string): DayStats => {
  if (!buckets[key]) {
    buckets[key] = createEmptyDayStats();
  }

  return buckets[key] as DayStats;
};

const applyStatsToEntry = (
  entry: DailyAggregateEntry,
  stats: DayStats,
  source: string,
  model: string,
  repo: string | null,
  hour: string | null,
): void => {
  addStats(entry.totals, stats);
  addStats(ensureBucket(entry.bySource, source), stats);
  addStats(ensureBucket(entry.byModel, model), stats);

  if (repo) {
    addStats(ensureBucket(entry.byRepo, repo), stats);
  }

  if (hour !== null) {
    addStats(ensureBucket(entry.byHour, hour), stats);
    if (!entry.byHourSource[hour]) {
      entry.byHourSource[hour] = {};
    }
    addStats(ensureBucket(entry.byHourSource[hour] as Record<string, DayStats>, source), stats);
  }
};

const sortedEntries = <T>(entries: Record<string, T>): Record<string, T> => {
  const keys = Object.keys(entries).sort((a, b) => a.localeCompare(b));
  const sorted: Record<string, T> = {};
  for (const key of keys) {
    sorted[key] = entries[key] as T;
  }
  return sorted;
};

const sortDailyStore = (daily: DailyStore): DailyStore => {
  const sortedDates = Object.keys(daily).sort((a, b) => a.localeCompare(b));
  const output: DailyStore = {};

  for (const date of sortedDates) {
    const entry = daily[date] as DailyAggregateEntry;
    const sortedByHourSource: Record<string, Record<string, DayStats>> = {};
    for (const [hour, sources] of Object.entries(sortedEntries(entry.byHourSource))) {
      sortedByHourSource[hour] = sortedEntries(sources);
    }

    output[date] = {
      bySource: sortedEntries(entry.bySource),
      byModel: sortedEntries(entry.byModel),
      byRepo: sortedEntries(entry.byRepo),
      byHour: sortedEntries(entry.byHour),
      byHourSource: sortedByHourSource,
      totals: { ...entry.totals },
    };
  }

  return output;
};

export interface AggregateSessionsOptions {
  timeZone?: string;
}

export interface NormalizedSessionAggregateInput {
  session: Session;
  events: SessionEvent[];
}

type AggregateSessionInput = Session | NormalizedSessionAggregateInput;

const isNormalizedSessionInput = (value: AggregateSessionInput): value is NormalizedSessionAggregateInput =>
  "session" in value && Array.isArray(value.events);

const resolveEventTimestamp = (event: SessionEvent, session: Session): string | null =>
  event.timestamp ?? session.startTime ?? session.parsedAt;

const toEventDateKey = (
  event: SessionEvent,
  session: Session,
  dateFormatter: Intl.DateTimeFormat,
): string => {
  const timestamp = resolveEventTimestamp(event, session);
  const parsed = parseTimestamp(timestamp);
  if (parsed) {
    return formatDateKey(parsed, dateFormatter);
  }

  if (typeof timestamp === "string" && timestamp.length >= 10) {
    return timestamp.slice(0, 10);
  }

  return toDayKey(session, dateFormatter);
};

const toEventHourKey = (
  event: SessionEvent,
  session: Session,
  hourFormatter: Intl.DateTimeFormat,
): string | null => {
  const parsed = parseTimestamp(resolveEventTimestamp(event, session));
  if (!parsed) return null;
  return formatHourKey(parsed, hourFormatter);
};

export const resolveAggregationTimeZone = (timeZone?: string): string =>
  resolveFormatterTimeZone(timeZone);

const aggregateEntriesByDate = (
  inputs: AggregateSessionInput[],
  options: AggregateSessionsOptions = {},
): DailyStore => {
  const timeZone = resolveFormatterTimeZone(options.timeZone);
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });

  const daily: DailyStore = {};

  for (const input of inputs) {
    const session = isNormalizedSessionInput(input) ? input.session : input;
    const events = isNormalizedSessionInput(input) ? input.events : [];
    const date = toDayKey(session, dateFormatter);
    const entry = ensureDateEntry(daily, date);
    const modelKey = session.model && session.model.trim().length > 0 ? session.model : "unknown";
    const repoKey = toRepoKey(session.repoName);
    applyStatsToEntry(
      entry,
      toSessionStats(session, events.length === 0),
      session.source,
      modelKey,
      repoKey,
      toHourKey(session, hourFormatter),
    );

    for (const event of events) {
      const stats = toEventStats(event);
      const isEmpty =
        stats.messages === 0 &&
        stats.toolCalls === 0 &&
        stats.inputTokens === 0 &&
        stats.outputTokens === 0 &&
        stats.cacheReadTokens === 0 &&
        stats.cacheWriteTokens === 0 &&
        stats.reasoningTokens === 0 &&
        stats.costUsd === 0;

      if (isEmpty) {
        continue;
      }

      const eventDate = toEventDateKey(event, session, dateFormatter);
      const eventEntry = ensureDateEntry(daily, eventDate);
      const eventModelKey = event.model && event.model.trim().length > 0 ? event.model : modelKey;
      applyStatsToEntry(
        eventEntry,
        stats,
        session.source,
        eventModelKey,
        repoKey,
        toEventHourKey(event, session, hourFormatter),
      );
    }
  }

  return sortDailyStore(daily);
};

export const aggregateSessionsByDate = (
  sessions: Session[],
  options: AggregateSessionsOptions = {},
): DailyStore => aggregateEntriesByDate(sessions, options);

export const aggregateNormalizedSessionsByDate = (
  inputs: NormalizedSessionAggregateInput[],
  options: AggregateSessionsOptions = {},
): DailyStore => aggregateEntriesByDate(inputs, options);
