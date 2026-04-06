import type { SessionSource } from "../shared/schema";
import { resolveAggregationTimeZone } from "./aggregator";
import { discoverAll } from "./discovery";
import {
	aggregateNormalizedSessionsToHistoryFacts,
	buildSessionDurationIndexFromSessions,
	rematerializeDailyStoreFromHistory,
	writeScanSessionDurationIndex,
	writeScanHistoryFacts,
} from "./history";
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

interface NormalizedSessionCandidate {
	session: Session;
	events: ReturnType<typeof normalizeSession>["events"];
	filePath: string;
	fileMtimeMs: number;
	fileSizeBytes: number;
}

const isPreferredDuplicate = (next: NormalizedSessionCandidate, current: NormalizedSessionCandidate): boolean => {
	if (next.fileMtimeMs !== current.fileMtimeMs) {
		return next.fileMtimeMs > current.fileMtimeMs;
	}

	if (next.fileSizeBytes !== current.fileSizeBytes) {
		return next.fileSizeBytes > current.fileSizeBytes;
	}

	return next.filePath.localeCompare(current.filePath) > 0;
};

export const runScan = async (options: ScanOptions = {}): Promise<ScanResult> => {
	await prefetchPricing();
	const aggregationTimeZone = resolveAggregationTimeZone(options.timeZone);
	const shouldFullScan = Boolean(options.fullScan) || (await dailyStoreNeedsTimeZoneBackfill(aggregationTimeZone));
	const settings = await getSettings();
	const candidates = await discoverAll(options.sources, { customPaths: settings.customPaths });
	const scanState = await readScanState();
	const selectedSources = options.sources && options.sources.length > 0 ? new Set(options.sources) : null;
	const isSelectedSource = (source: SessionSource): boolean => selectedSources === null || selectedSources.has(source);
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

	let parsedSessionCount = 0;
	let errors = 0;
	const normalizedSessions: NormalizedSessionCandidate[] = [];
	const normalizedSessionIndexById = new Map<string, number>();

	for (const path of deletedPaths) {
		delete nextScanState[path];
	}

	for (const candidate of toProcess) {
		const parsed = await parseFile(candidate);

		if (!parsed) {
			errors += 1;
			continue;
		}

		const normalized = normalizeSession(parsed);
		const { session } = normalized;
		const normalizedCandidate: NormalizedSessionCandidate = {
			session,
			events: normalized.events,
			filePath: candidate.path,
			fileMtimeMs: candidate.mtime,
			fileSizeBytes: candidate.size,
		};
		const dedupeKey = `${session.source}:${session.id}`;
		const existingIndex = normalizedSessionIndexById.get(dedupeKey);
		if (existingIndex === undefined) {
			normalizedSessionIndexById.set(dedupeKey, normalizedSessions.length);
			normalizedSessions.push(normalizedCandidate);
		} else {
			const current = normalizedSessions[existingIndex] as NormalizedSessionCandidate;
			if (isPreferredDuplicate(normalizedCandidate, current)) {
				normalizedSessions[existingIndex] = normalizedCandidate;
			}
		}

		nextScanState[candidate.path] = {
			source: candidate.source,
			fileSize: candidate.size,
			mtimeMs: candidate.mtime,
			parsedAt: session.parsedAt,
		};

		parsedSessionCount += 1;
	}

	const scanned = normalizedSessions.length;

	const shouldPersistRebuild =
		needsConsistencyRebuild &&
		// Exact rebuild (no parse failures).
		(errors === 0 ||
			// Partial rebuild when at least one session parsed.
			parsedSessionCount > 0 ||
			// Accurate empty state when no candidates exist.
			candidates.length === 0);

	if (shouldPersistRebuild) {
		await writeScanHistoryFacts(
			aggregateNormalizedSessionsToHistoryFacts(normalizedSessions.map(({ session, events }) => ({ session, events }))),
		);
		await writeScanSessionDurationIndex(
			buildSessionDurationIndexFromSessions(normalizedSessions.map(({ session }) => session)),
		);
		await writeScanState(nextScanState);
	}

	await writeDailyStore(await rematerializeDailyStoreFromHistory(aggregationTimeZone));
	await writeAggregationMeta(aggregationTimeZone);

	return {
		scanned,
		total: candidates.length,
		errors,
	};
};
