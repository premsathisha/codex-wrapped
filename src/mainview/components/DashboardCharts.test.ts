import { describe, expect, test } from "bun:test";
import { THEME_PALETTES } from "../lib/themePalettes";
import { buildModelColors, buildTopRepoBarColors, classifyCodingPersonality } from "./DashboardCharts";

const getPerceivedBrightness = (hexColor: string): number => {
	const normalized = hexColor.replace("#", "");
	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	return red * 0.299 + green * 0.587 + blue * 0.114;
};

describe("DashboardCharts helpers", () => {
	test("classifies 4 AM as Night Owl", () => {
		const personality = classifyCodingPersonality(4);
		expect(personality.label).toBe("Night Owl");
	});

	test("buildModelColors keeps the first six model series visually distinct", () => {
		const colors = buildModelColors(THEME_PALETTES.blue);
		expect(colors.length).toBeGreaterThanOrEqual(6);
		expect(new Set(colors.slice(0, 6)).size).toBe(6);
	});

	test("buildTopRepoBarColors stays in descending brightness order", () => {
		const palette = THEME_PALETTES.blue;
		const colors = buildTopRepoBarColors(palette);
		expect(colors.length).toBeGreaterThanOrEqual(8);
		expect(colors[6]).not.toBe(palette.none);
		expect(colors[7]).not.toBe(palette.none);

		const brightness = colors.map(getPerceivedBrightness);
		for (let index = 1; index < brightness.length; index += 1) {
			expect(brightness[index]).toBeLessThan(brightness[index - 1]);
		}
	});
});
