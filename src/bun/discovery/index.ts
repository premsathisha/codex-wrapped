import type { SessionSource } from "../../shared/schema";
import { codexDiscoverer } from "./codex";
import type { AgentDiscoverer, DiscoverOptions, FileCandidate } from "./types";

const DISCOVERERS: AgentDiscoverer[] = [
  codexDiscoverer,
];

export const discoverAll = async (
  sources?: SessionSource[],
  options: DiscoverOptions = {},
): Promise<FileCandidate[]> => {
  const discoverers = sources?.length
    ? DISCOVERERS.filter((discoverer) => sources.includes(discoverer.source))
    : DISCOVERERS;

  const results = await Promise.all(discoverers.map((discoverer) => discoverer.discover(options).catch(() => [])));
  return results.flat().sort((a, b) => a.path.localeCompare(b.path));
};

export type { FileCandidate } from "./types";
