import { describe, expect, test } from "bun:test";
import { getHeroCopy } from "./heroCopy";

describe("getHeroCopy", () => {
	test("uses the aggregation timezone to decide whether a year is current", () => {
		const now = new Date("2026-01-01T07:30:00Z");

		expect(getHeroCopy("year:2025", "America/Los_Angeles", now)).toEqual({
			kicker: "This Year In Code",
			title: "Your AI Coding Year",
		});
	});

	test("keeps past-year copy for years that are not current in the aggregation timezone", () => {
		const now = new Date("2026-01-01T07:30:00Z");

		expect(getHeroCopy("year:2025", "UTC", now)).toEqual({
			kicker: "2025 In Code",
			title: "Your AI Coding 2025",
		});
	});
});
