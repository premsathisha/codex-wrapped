const padDatePart = (value: number): string => String(value).padStart(2, "0");

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

export const shiftLocalISODate = (value: string, days: number): string => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return toLocalISODate(next);
};

export const calculateCurrentStreakFromDates = (
  activeDates: Set<string>,
  dateFrom: string,
  dateTo: string,
): { days: number; startDate: string | null } => {
  if (dateTo < dateFrom) return { days: 0, startDate: null };

  let streak = 0;
  let streakStartDate: string | null = null;
  for (let key = dateTo; key >= dateFrom; key = shiftLocalISODate(key, -1)) {
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
  for (let key = dateFrom; key <= dateTo; key = shiftLocalISODate(key, 1)) {
    if (activeDates.has(key)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }

  return best;
};
