import { join } from "node:path";
import type { AgentDiscoverer } from "./types";
import { expandHome, scanGlobCandidates } from "./utils";

const resolveCodexRoot = (customPath?: string): string => {
  if (typeof customPath === "string" && customPath.trim().length > 0) {
    return expandHome(customPath.trim());
  }

  const codexHome = process.env.CODEX_HOME;
  if (codexHome && codexHome.trim().length > 0) {
    return join(codexHome, "sessions");
  }
  return expandHome("~/.codex/sessions");
};

export const codexDiscoverer: AgentDiscoverer = {
  source: "codex",
  async discover(options) {
    return scanGlobCandidates(resolveCodexRoot(options?.customPaths?.codex), "????/??/??/rollout-*.jsonl", "codex");
  },
};

export const discoverCodex = codexDiscoverer.discover;
