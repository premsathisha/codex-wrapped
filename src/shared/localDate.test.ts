import { describe, expect, test } from "bun:test";
import {
  calculateCurrentStreakFromDates,
  calculateLongestStreakFromDates,
  daysAgoLocalISO,
  shiftLocalISODate,
  toISODateInTimeZone,
  toLocalISODate,
} from "./localDate";

describe("localDate", () => {
  test("uses the local calendar date even when UTC is already the next day", () => {
    const eveningInPhoenix = new Date("2026-03-11T17:13:48-07:00");

    expect(eveningInPhoenix.toISOString().slice(0, 10)).toBe("2026-03-12");
    expect(toISODateInTimeZone(eveningInPhoenix, "America/Phoenix")).toBe("2026-03-11");
    expect(daysAgoLocalISO(0, new Date("2026-03-11T10:00:00"))).toBe(toLocalISODate(new Date("2026-03-11T10:00:00")));
  });

  test("shifts local ISO dates across month boundaries", () => {
    expect(shiftLocalISODate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftLocalISODate("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("keeps the current streak active for the local day", () => {
    const activeDates = new Set(["2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11"]);

    expect(calculateCurrentStreakFromDates(activeDates, "2026-03-01", "2026-03-11")).toEqual({
      days: 4,
      startDate: "2026-03-08",
    });
  });

  test("calculates the longest streak across the selected range", () => {
    const activeDates = new Set([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-05",
      "2026-03-06",
      "2026-03-08",
    ]);

    expect(calculateLongestStreakFromDates(activeDates, "2026-03-01", "2026-03-08")).toBe(3);
  });
});
