import type { SessionSource } from "../shared/schema";
import {
  aggregateSessionsByDate,
  resolveAggregationTimeZone,
} from "./aggregator";
import { discoverAll } from "./discovery";
import { normalizeSession } from "./normalizer";
import { parseFile } from "./parsers";
import type { Session } from "./session-schema";
import {
  dailyStoreNeedsTimeZoneBackfill,
  getSettings,
  readScanState,
  writeAggregationMeta,
  writeDailyStore,
  writeScanState,
} from "./store";
import { prefetchPricing } from "./pricing";

export interface ScanOptions {
  fullScan?: boolean;
  sources?: SessionSource[];
  timeZone?: string;
}

export interface ScanResult {
  scanned: number;
  total: number;
  errors: number;
}

export const runScan = async (options: ScanOptions = {}): Promise<ScanResult> => {
  await prefetchPricing();
  const aggregationTimeZone = resolveAggregationTimeZone(options.timeZone);
  const shouldFullScan =
    Boolean(options.fullScan) || (await dailyStoreNeedsTimeZoneBackfill(aggregationTimeZone));
  const settings = await getSettings();
  const candidates = await discoverAll(options.sources, { customPaths: settings.customPaths });
  const scanState = await readScanState();
  const selectedSources = options.sources && options.sources.length > 0 ? new Set(options.sources) : null;
  const isSelectedSource = (source: SessionSource): boolean =>
    selectedSources === null || selectedSources.has(source);
  const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
  const deletedPaths = Object.entries(scanState)
    .filter(([, state]) => isSelectedSource(state.source))
    .filter(([path]) => !candidatePaths.has(path))
    .map(([path]) => path);

  const changed = candidates.filter((candidate) => {
    const state = scanState[candidate.path];
    return !state || state.mtimeMs !== candidate.mtime || state.fileSize !== candidate.size;
  });
  const needsConsistencyRebuild = shouldFullScan || deletedPaths.length > 0 || changed.length > 0;
  const toProcess = needsConsistencyRebuild ? candidates : [];
  const nextScanState = structuredClone(scanState);

  let scanned = 0;
  let errors = 0;
  const sessions: Session[] = [];

  for (const path of deletedPaths) {
    delete nextScanState[path];
  }

  for (const candidate of toProcess) {
    const parsed = await parseFile(candidate);

    if (!parsed) {
      errors += 1;
      continue;
    }

    const { session } = normalizeSession(parsed);
    sessions.push(session);

    nextScanState[candidate.path] = {
      source: candidate.source,
      fileSize: candidate.size,
      mtimeMs: candidate.mtime,
      parsedAt: session.parsedAt,
    };

    scanned += 1;
  }

  if (needsConsistencyRebuild && errors === 0) {
    await writeDailyStore(aggregateSessionsByDate(sessions, { timeZone: aggregationTimeZone }));
    await writeAggregationMeta(aggregationTimeZone);
    await writeScanState(nextScanState);
  }

  return {
    scanned,
    total: candidates.length,
    errors,
  };
};
