import type { SessionSource } from "../../shared/schema";

export interface FileCandidate {
  path: string;
  source: SessionSource;
  mtime: number;
  size: number;
}

export interface DiscoverOptions {
  customPaths?: Partial<Record<SessionSource, string>>;
}

export interface AgentDiscoverer {
  source: SessionSource;
  discover(options?: DiscoverOptions): Promise<FileCandidate[]>;
}
