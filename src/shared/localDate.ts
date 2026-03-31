const padDatePart = (value: number): string => String(value).padStart(2, "0");

const formatUTCDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;

export const toISODateInTimeZone = (date: Date, timeZone?: string): string => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
  }

  return `${year}-${month}-${day}`;
};

export const toLocalISODate = (date: Date): string => toISODateInTimeZone(date);

export const daysAgoLocalISO = (daysAgo: number, now = new Date()): string => {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return toLocalISODate(date);
};

export const shiftISODate = (value: string, days: number): string => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return formatUTCDate(next);
};

export const shiftLocalISODate = (value: string, days: number): string => shiftISODate(value, days);

export const calculateCurrentStreakFromDates = (
  activeDates: Set<string>,
  dateFrom: string,
  dateTo: string,
): { days: number; startDate: string | null } => {
  if (dateTo < dateFrom) return { days: 0, startDate: null };

  let streak = 0;
  let streakStartDate: string | null = null;
  for (let key = dateTo; key >= dateFrom; key = shiftISODate(key, -1)) {
    if (!activeDates.has(key)) break;
    streak += 1;
    streakStartDate = key;
  }

  return { days: streak, startDate: streakStartDate };
};

export const calculateLongestStreakFromDates = (
  activeDates: Set<string>,
  dateFrom: string,
  dateTo: string,
): number => {
  if (dateTo < dateFrom) return 0;

  let best = 0;
  let current = 0;
  for (let key = dateFrom; key <= dateTo; key = shiftISODate(key, 1)) {
    if (activeDates.has(key)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }

  return best;
};
