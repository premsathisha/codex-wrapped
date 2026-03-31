import { basename, dirname, join } from "node:path";
import type { AgentDiscoverer } from "./types";
import { dedupeCandidates, expandHome, scanGlobCandidates } from "./utils";

interface CodexRoots {
  sessionsRoot: string;
  archivedRoot: string;
}

const resolveCodexBasePath = (customPath?: string): string => {
  if (typeof customPath === "string" && customPath.trim().length > 0) {
    return expandHome(customPath.trim());
  }

  const codexHome = process.env.CODEX_HOME;
  if (codexHome && codexHome.trim().length > 0) {
    return expandHome(codexHome.trim());
  }

  return expandHome("~/.codex");
};

const resolveCodexRoots = (customPath?: string): CodexRoots => {
  const basePath = resolveCodexBasePath(customPath);
  const tail = basename(basePath);

  if (tail === "sessions") {
    const codexRoot = dirname(basePath);
    return {
      sessionsRoot: basePath,
      archivedRoot: join(codexRoot, "archived_sessions"),
    };
  }

  if (tail === "archived_sessions") {
    const codexRoot = dirname(basePath);
    return {
      sessionsRoot: join(codexRoot, "sessions"),
      archivedRoot: basePath,
    };
  }

  return {
    sessionsRoot: join(basePath, "sessions"),
    archivedRoot: join(basePath, "archived_sessions"),
  };
};

export const codexDiscoverer: AgentDiscoverer = {
  source: "codex",
  async discover(options) {
    const { sessionsRoot, archivedRoot } = resolveCodexRoots(options?.customPaths?.codex);
    const [activeSessions, archivedFlat, archivedNested] = await Promise.all([
      scanGlobCandidates(sessionsRoot, "????/??/??/rollout-*.jsonl", "codex"),
      scanGlobCandidates(archivedRoot, "rollout-*.jsonl", "codex"),
      scanGlobCandidates(archivedRoot, "????/??/??/rollout-*.jsonl", "codex"),
    ]);

    return dedupeCandidates([...activeSessions, ...archivedFlat, ...archivedNested]);
  },
};

export const discoverCodex = codexDiscoverer.discover;
