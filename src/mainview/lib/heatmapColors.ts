import type { ThemePalette } from "./themePalettes";

interface HeatmapColorStop {
  stop: number;
  color: keyof ThemePalette;
}

const HEATMAP_COLOR_STOPS: HeatmapColorStop[] = [
  { stop: 0, color: "less" },
  { stop: 0.22, color: "slightlyLess" },
  { stop: 0.5, color: "medium" },
  { stop: 0.78, color: "high" },
  { stop: 1, color: "veryHigh" },
];
const MIN_ACTIVE_COLOR_STOP = 0.005;
const HEATMAP_INTENSITY_GAMMA = 0.6;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const hexToRgb = (value: string): [number, number, number] => {
  const normalized = value.replace("#", "");
  if (normalized.length !== 6) return [0, 0, 0];

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;

const mixHexColors = (from: string, to: string, amount: number): string => {
  const [fromR, fromG, fromB] = hexToRgb(from);
  const [toR, toG, toB] = hexToRgb(to);
  const clamped = clamp01(amount);

  return rgbToHex(
    fromR + (toR - fromR) * clamped,
    fromG + (toG - fromG) * clamped,
    fromB + (toB - fromB) * clamped,
  );
};

const scaleHeatmapIntensity = (intensity: number): number => {
  if (intensity <= 0) return 0;
  return Math.pow(clamp01(intensity), HEATMAP_INTENSITY_GAMMA);
};

export const getHeatmapColor = (
  palette: ThemePalette,
  intensity: number,
  hasActivity: boolean,
): string => {
  if (!hasActivity) return palette.none;

  const normalized = scaleHeatmapIntensity(intensity);
  if (normalized <= MIN_ACTIVE_COLOR_STOP) return palette.less;
  if (normalized >= 1) return palette.veryHigh;

  for (let index = 1; index < HEATMAP_COLOR_STOPS.length; index += 1) {
    const current = HEATMAP_COLOR_STOPS[index];
    const previous = HEATMAP_COLOR_STOPS[index - 1];
    if (!current || !previous) continue;
    if (normalized > current.stop) continue;

    const range = current.stop - previous.stop;
    const progress = range > 0 ? (normalized - previous.stop) / range : 0;
    return mixHexColors(palette[previous.color], palette[current.color], progress);
  }

  return palette.veryHigh;
};
