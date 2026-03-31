import { describe, expect, test } from "bun:test";
import { buildRangeOptions, getCurrentYearInTimeZone, resolveDateRange } from "./useDashboardData";

describe("useDashboardData date ranges", () => {
  test("uses the aggregation timezone year around New Year's", () => {
    const now = new Date("2026-01-01T07:30:00Z");

    expect(getCurrentYearInTimeZone("America/Los_Angeles", now)).toBe(2025);
    expect(getCurrentYearInTimeZone("UTC", now)).toBe(2026);
  });

  test("does not offer a future year when the aggregation timezone is still in the previous year", () => {
    const now = new Date("2026-01-01T07:30:00Z");
    const options = buildRangeOptions("America/Los_Angeles", now);

    expect(options.some((option) => option.value === "year:2026")).toBe(false);
    expect(options.some((option) => option.value === "year:2025")).toBe(true);
  });

  test("keeps year selections valid when the aggregation timezone is behind the browser year", () => {
    const now = new Date("2026-01-01T07:30:00Z");

    expect(resolveDateRange("year:2026", "America/Los_Angeles", now)).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
  });
});
