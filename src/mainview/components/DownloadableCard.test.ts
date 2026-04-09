import { describe, expect, test } from "bun:test";
import { buildDownloadableCardFileName } from "./DownloadableCard";

describe("buildDownloadableCardFileName", () => {
	test("allows a download-specific filename part for cards", () => {
		expect(buildDownloadableCardFileName("Codex", new Date("2026-04-09T12:00:00Z"), "heatmap")).toBe(
			"codex-wrapped-heatmap-2026-04-09.png",
		);
	});
});
