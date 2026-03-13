import { describe, expect, test } from "bun:test";
import { getHeatmapColor } from "./heatmapColors";
import { THEME_PALETTES } from "./themePalettes";

describe("getHeatmapColor", () => {
  test("returns the empty color when there is no activity", () => {
    expect(getHeatmapColor(THEME_PALETTES.blue, 0.8, false)).toBe(THEME_PALETTES.blue.none);
  });

  test("never uses the empty color for active days", () => {
    expect(getHeatmapColor(THEME_PALETTES.orange, 0.01, true)).toBe(THEME_PALETTES.orange.less);
    expect(getHeatmapColor(THEME_PALETTES.orange, 0.01, true)).not.toBe(THEME_PALETTES.orange.none);
  });

  test("keeps the brightest color for the max-intensity day", () => {
    expect(getHeatmapColor(THEME_PALETTES.blue, 1, true)).toBe(THEME_PALETTES.blue.veryHigh);
  });

  test("assigns different shades to different token intensities", () => {
    const low = getHeatmapColor(THEME_PALETTES.blue, 0.05, true);
    const mid = getHeatmapColor(THEME_PALETTES.blue, 0.1, true);
    const high = getHeatmapColor(THEME_PALETTES.blue, 0.5, true);

    expect(low).not.toBe(mid);
    expect(mid).not.toBe(high);
  });
});
