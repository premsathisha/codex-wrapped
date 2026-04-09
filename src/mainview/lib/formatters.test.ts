import { describe, expect, test } from "bun:test";
import { formatCompactNumber, formatDate, formatSpendUsd, formatUsd } from "./formatters";

describe("formatDate", () => {
	test("does not shift plain ISO dates back by one day in local time zones", () => {
		expect(formatDate("2026-03-11")).toBe("Mar 11, 2026");
		expect(formatDate("2026-03-12")).toBe("Mar 12, 2026");
	});

	test("still formats timestamps as local instants", () => {
		expect(formatDate("2026-03-12T06:36:07.505Z")).toBeTruthy();
	});
});

describe("formatCompactNumber", () => {
	test("formats large axis labels into readable compact values", () => {
		expect(formatCompactNumber(300_000_000)).toBe("300M");
		expect(formatCompactNumber(600_000_000)).toBe("600M");
		expect(formatCompactNumber(1_200_000_000)).toBe("1.2B");
	});
});

describe("formatUsd", () => {
	test("supports one-decimal currency formatting when requested", () => {
		expect(formatUsd(716.9551, { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe("$717.0");
	});
});

describe("formatSpendUsd", () => {
	test("formats spend values with one decimal place", () => {
		expect(formatSpendUsd(716.9551)).toBe("$717.0");
	});
});
