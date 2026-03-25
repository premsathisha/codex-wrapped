interface TimelineActivityLike {
  sessions: number;
  tokens: number;
  costUsd: number;
  durationMs: number;
  messages: number;
  toolCalls: number;
}

export const hasTimelineActivity = (entry: TimelineActivityLike): boolean =>
  entry.sessions > 0 ||
  entry.tokens > 0 ||
  entry.costUsd > 0 ||
  entry.durationMs > 0 ||
  entry.messages > 0 ||
  entry.toolCalls > 0;
