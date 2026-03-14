import type { SessionSource } from "@shared/schema";

export const SOURCE_LABELS: Record<SessionSource, string> = {
  codex: "Codex",
};

export const SOURCE_COLORS: Record<SessionSource, string> = {
  codex: "#777BF8",
};

export const CHART_COLORS = [
  "#1F245E",
  "#30368F",
  "#4B4FD1",
  "#777BF8",
  "#D8DDFF",
  "#4B4FD1",
  "#30368F",
  "#777BF8",
];

export const DEFAULT_PAGE_SIZE = 20;
