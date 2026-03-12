interface HourlyActivityRow {
  sessions: number;
  tokens: number;
  costUsd: number;
  durationMs: number;
}

export const formatHourLabel = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
};

export const hasHourlyActivity = (rows: HourlyActivityRow[]): boolean =>
  rows.some((row) => row.sessions > 0 || row.tokens > 0 || row.costUsd > 0 || row.durationMs > 0);
