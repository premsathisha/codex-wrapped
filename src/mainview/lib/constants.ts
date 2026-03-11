import type { SessionSource } from "@shared/schema";

export const SOURCE_LABELS: Record<SessionSource, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  droid: "Droid",
  copilot: "Copilot",
};

export const SOURCE_COLORS: Record<SessionSource, string> = {
  claude: "#30368F",
  codex: "#777BF8",
  gemini: "#4B4FD1",
  opencode: "#1F245E",
  droid: "#30368F",
  copilot: "#4B4FD1",
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
