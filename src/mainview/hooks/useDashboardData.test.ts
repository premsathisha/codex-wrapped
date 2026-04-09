import { describe, expect, test } from "bun:test";
import { buildRangeOptions, getCurrentYearInTimeZone, resolveDateRange, selectTopRepos } from "./useDashboardData";

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

	test("preserves backend top repo ordering when selecting the visible subset", () => {
		const topRepos = [
			{ repo: "repo-1", tokens: 100, costUsd: 24, sessions: 1 },
			{ repo: "repo-2", tokens: 100, costUsd: 23, sessions: 2 },
			{ repo: "repo-3", tokens: 100, costUsd: 22, sessions: 3 },
			{ repo: "repo-4", tokens: 100, costUsd: 21, sessions: 4 },
			{ repo: "repo-5", tokens: 100, costUsd: 20, sessions: 5 },
			{ repo: "repo-6", tokens: 100, costUsd: 19, sessions: 6 },
			{ repo: "repo-7", tokens: 100, costUsd: 18, sessions: 7 },
			{ repo: "repo-8", tokens: 100, costUsd: 17, sessions: 8 },
			{ repo: "repo-9", tokens: 100, costUsd: 16, sessions: 9 },
		];

		expect(selectTopRepos(topRepos).map((row) => row.repo)).toEqual([
			"repo-1",
			"repo-2",
			"repo-3",
			"repo-4",
			"repo-5",
			"repo-6",
			"repo-7",
			"repo-8",
		]);
	});
});
