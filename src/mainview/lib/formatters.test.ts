import { describe, expect, test } from "bun:test";
import { formatDate } from "./formatters";

describe("formatDate", () => {
  test("does not shift plain ISO dates back by one day in local time zones", () => {
    expect(formatDate("2026-03-11")).toBe("Mar 11, 2026");
    expect(formatDate("2026-03-12")).toBe("Mar 12, 2026");
  });

  test("still formats timestamps as local instants", () => {
    expect(formatDate("2026-03-12T06:36:07.505Z")).toBeTruthy();
  });
});
