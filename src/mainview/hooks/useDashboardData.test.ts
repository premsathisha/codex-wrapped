import { describe, expect, test } from "bun:test";
import {
	buildRangeOptions,
	getCurrentYearInTimeZone,
	resolveDateRange,
	selectBusiestDayOfWeek,
	selectMostExpensiveDay,
	selectTopRepos,
	type TimelinePoint,
} from "./useDashboardData";

const point = (overrides: Partial<TimelinePoint>): TimelinePoint => ({
	date: "2026-01-01",
	sessions: 0,
	tokens: 0,
	costUsd: 0,
	durationMs: 0,
	messages: 0,
	toolCalls: 0,
	...overrides,
});

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

describe("useDashboardData timeline selectors", () => {
	test("does not report Sunday as busiest day when every timeline entry has zero tokens", () => {
		expect(
			selectBusiestDayOfWeek([
				point({ date: "2026-01-04", tokens: 0 }),
				point({ date: "2026-01-05", tokens: 0 }),
				point({ date: "2026-01-06", tokens: 0 }),
			]),
		).toBe("");
	});

	test("preserves existing weekday tie ordering for busiest day", () => {
		expect(
			selectBusiestDayOfWeek([
				point({ date: "2026-01-05", tokens: 10 }),
				point({ date: "2026-01-06", tokens: 10 }),
				point({ date: "2026-01-07", tokens: 5 }),
			]),
		).toBe("Monday");
	});

	test("does not report a most expensive day when every timeline entry has zero spend", () => {
		expect(
			selectMostExpensiveDay([point({ date: "2026-01-05", costUsd: 0 }), point({ date: "2026-01-06", costUsd: 0 })]),
		).toBeNull();
	});

	test("preserves first-day ordering for tied most expensive days", () => {
		expect(
			selectMostExpensiveDay([
				point({ date: "2026-01-05", costUsd: 4.25 }),
				point({ date: "2026-01-06", costUsd: 4.25 }),
				point({ date: "2026-01-07", costUsd: 1 }),
			])?.date,
		).toBe("2026-01-05");
	});
});
