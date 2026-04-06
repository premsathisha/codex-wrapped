import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { toISODateInTimeZone } from "../shared/localDate";
import type { ImportBackupResult, ImportedBackupSummary } from "../shared/types";
import type { Session, SessionEvent } from "./session-schema";
import {
	createEmptyDayStats,
	hasTrackedActivity,
	paths,
	type DailyAggregateEntry,
	type DailyStore,
	type DayStats,
} from "./store";

export type HistoryDimensionKind = "all" | "source" | "model" | "repo" | "tool";

export interface CanonicalHistoryFact {
	bucketStartUtc: string;
	dimensionKind: HistoryDimensionKind;
	dimensionKey: string;
	sessions: number;
	messages: number;
	toolCalls: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	costUsd: number;
	durationMs: number;
	lastSeenAtUtc: string | null;
}

export interface SessionDurationIndexEntry {
	sessionKey: string;
	startedAtUtc: string;
	durationMs: number;
}

interface ScanHistoryStore {
	version: number;
	facts: CanonicalHistoryFact[];
}

interface ImportHistoryStore {
	version: number;
	factsByBackupId: Record<string, CanonicalHistoryFact[]>;
}

interface ImportManifestStore {
	version: number;
	installId: string;
	backups: ImportedBackupManifest[];
}

interface SessionDurationStore {
	version: number;
	sessions: SessionDurationIndexEntry[];
}

export interface ImportedBackupManifest {
	backupId: string;
	exportId: string;
	originInstallId: string;
	originalFilename: string;
	checksum: string;
	importedAtUtc: string;
	exportedAtUtc: string | null;
	coverageStartDateUtc: string | null;
	coverageEndDateUtc: string | null;
	earliestKnownUsageDateUtc: string | null;
	exportTimeZone: string;
	schemaVersion: number;
	factCount: number;
}

interface ParsedBackupCsv {
	schemaVersion: number;
	originInstallId: string;
	exportId: string;
	exportedAtUtc: string;
	coverageStartDateUtc: string | null;
	coverageEndDateUtc: string | null;
	exportTimeZone: string;
	earliestKnownUsageDateUtc: string | null;
	facts: CanonicalHistoryFact[];
}

export interface MaterializeHistoryOptions {
	timeZone: string;
	overlapPolicy?: "local-wins";
}

interface EffectiveHistorySelection {
	facts: CanonicalHistoryFact[];
	activeBackupIds: Set<string>;
	contributingBackupIds: Set<string>;
	skippedDatesByBackupId: Map<string, Set<string>>;
	effectiveDates: Set<string>;
	coverageStartDateUtc: string | null;
	coverageEndDateUtc: string | null;
}

const HISTORY_SCAN_VERSION = 1;
const HISTORY_IMPORT_VERSION = 1;
const IMPORT_MANIFEST_VERSION = 1;
const HISTORY_SESSION_DURATION_VERSION = 1;
const CSV_SCHEMA_ID = "codex_wrapped_backup";
const CSV_SCHEMA_VERSION = 1;
const HISTORY_SCAN_FILE = "history-scan-v1.json";
const HISTORY_IMPORT_FILE = "history-import-v1.json";
const IMPORT_MANIFEST_FILE = "import-manifest.json";
const HISTORY_SESSION_DURATION_FILE = "history-session-durations-v1.json";
const IMPORTS_DIR_NAME = "imports";

const CSV_COLUMNS = [
	"schema_id",
	"schema_version",
	"record_type",
	"origin_install_id",
	"export_id",
	"exported_at_utc",
	"coverage_start_date_utc",
	"coverage_end_date_utc",
	"export_time_zone",
	"bucket_start_utc",
	"dimension_kind",
	"dimension_key",
	"sessions",
	"messages",
	"tool_calls",
	"input_tokens",
	"output_tokens",
	"cache_read_tokens",
	"cache_write_tokens",
	"reasoning_tokens",
	"cost_usd",
	"duration_ms",
	"last_seen_at_utc",
	"earliest_known_usage_date_utc",
] as const;

const DEFAULT_EXPORT_TIME_ZONE = "UTC";

const getHistoryScanPath = (): string => join(paths.dataDir, HISTORY_SCAN_FILE);

const getHistoryImportPath = (): string => join(paths.dataDir, HISTORY_IMPORT_FILE);

const getImportManifestPath = (): string => join(paths.dataDir, IMPORT_MANIFEST_FILE);

const getSessionDurationPath = (): string => join(paths.dataDir, HISTORY_SESSION_DURATION_FILE);

const getBackupDir = (backupId: string): string => join(paths.dataDir, IMPORTS_DIR_NAME, backupId);

const getBackupCsvPath = (backupId: string): string => join(getBackupDir(backupId), "backup.csv");

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const toNullableString = (value: unknown): string | null =>
	typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeIsoTimestamp = (value: unknown): string | null => {
	if (typeof value !== "string" || value.trim().length === 0) {
		return null;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeSessionDurationIndexEntry = (value: unknown): SessionDurationIndexEntry | null => {
	if (!isRecord(value)) return null;

	const sessionKey = toNullableString(value.sessionKey);
	const startedAtUtc = normalizeIsoTimestamp(value.startedAtUtc);
	const durationMs = Math.max(0, Math.floor(toFiniteNumber(value.durationMs)));
	if (!sessionKey || !startedAtUtc || durationMs <= 0) {
		return null;
	}

	return {
		sessionKey,
		startedAtUtc,
		durationMs,
	};
};

const startOfUtcHour = (value: string | null | undefined): string | null => {
	const parsed = normalizeIsoTimestamp(value);
	if (!parsed) return null;
	return `${parsed.slice(0, 13)}:00:00.000Z`;
};

const normalizeDimensionKey = (
	dimensionKind: HistoryDimensionKind,
	value: string | null | undefined,
): string | null => {
	if (dimensionKind === "all") {
		return "all";
	}

	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toDayStats = (fact: CanonicalHistoryFact): DayStats => ({
	sessions: fact.sessions,
	messages: fact.messages,
	toolCalls: fact.toolCalls,
	inputTokens: fact.inputTokens,
	outputTokens: fact.outputTokens,
	cacheReadTokens: fact.cacheReadTokens,
	cacheWriteTokens: fact.cacheWriteTokens,
	reasoningTokens: fact.reasoningTokens,
	costUsd: fact.costUsd,
	durationMs: fact.durationMs,
});

const factHasActivity = (fact: CanonicalHistoryFact): boolean => hasTrackedActivity(toDayStats(fact));

const addStats = (target: DayStats, source: DayStats): void => {
	target.sessions += source.sessions;
	target.messages += source.messages;
	target.toolCalls += source.toolCalls;
	target.inputTokens += source.inputTokens;
	target.outputTokens += source.outputTokens;
	target.cacheReadTokens += source.cacheReadTokens;
	target.cacheWriteTokens += source.cacheWriteTokens;
	target.reasoningTokens += source.reasoningTokens;
	target.costUsd += source.costUsd;
	target.durationMs += source.durationMs;
};

const emptyFact = (
	bucketStartUtc: string,
	dimensionKind: HistoryDimensionKind,
	dimensionKey: string,
): CanonicalHistoryFact => ({
	bucketStartUtc,
	dimensionKind,
	dimensionKey,
	sessions: 0,
	messages: 0,
	toolCalls: 0,
	inputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	reasoningTokens: 0,
	costUsd: 0,
	durationMs: 0,
	lastSeenAtUtc: null,
});

const updateFact = (
	facts: Map<string, CanonicalHistoryFact>,
	bucketStartUtc: string | null,
	dimensionKind: HistoryDimensionKind,
	dimensionKey: string | null,
	stats: DayStats,
	lastSeenAtUtc: string | null,
): void => {
	if (!bucketStartUtc) return;
	const normalizedKey = normalizeDimensionKey(dimensionKind, dimensionKey);
	if (!normalizedKey) return;

	const key = `${bucketStartUtc}|${dimensionKind}|${normalizedKey}`;
	const existing = facts.get(key) ?? emptyFact(bucketStartUtc, dimensionKind, normalizedKey);
	const next = toDayStats(existing);
	addStats(next, stats);
	existing.sessions = next.sessions;
	existing.messages = next.messages;
	existing.toolCalls = next.toolCalls;
	existing.inputTokens = next.inputTokens;
	existing.outputTokens = next.outputTokens;
	existing.cacheReadTokens = next.cacheReadTokens;
	existing.cacheWriteTokens = next.cacheWriteTokens;
	existing.reasoningTokens = next.reasoningTokens;
	existing.costUsd = next.costUsd;
	existing.durationMs = next.durationMs;

	if (lastSeenAtUtc && (!existing.lastSeenAtUtc || lastSeenAtUtc > existing.lastSeenAtUtc)) {
		existing.lastSeenAtUtc = lastSeenAtUtc;
	}

	facts.set(key, existing);
};

const parseSessionTimestamp = (session: Session): string | null => {
	const candidates = [session.startTime, session.parsedAt];
	for (const candidate of candidates) {
		const normalized = normalizeIsoTimestamp(candidate);
		if (normalized) return normalized;
	}
	return null;
};

const resolveEventTimestamp = (event: SessionEvent, session: Session): string | null =>
	normalizeIsoTimestamp(event.timestamp) ?? parseSessionTimestamp(session);

const toSessionStats = (session: Session, includeRollupStats: boolean): DayStats => ({
	sessions: 1,
	messages: includeRollupStats ? session.messageCount : 0,
	toolCalls: includeRollupStats ? session.toolCallCount : 0,
	inputTokens: includeRollupStats ? session.totalTokens.inputTokens : 0,
	outputTokens: includeRollupStats ? session.totalTokens.outputTokens : 0,
	cacheReadTokens: includeRollupStats ? session.totalTokens.cacheReadTokens : 0,
	cacheWriteTokens: includeRollupStats ? session.totalTokens.cacheWriteTokens : 0,
	reasoningTokens: includeRollupStats ? session.totalTokens.reasoningTokens : 0,
	costUsd: includeRollupStats ? (session.totalCostUsd ?? 0) : 0,
	durationMs: session.isSubagent ? 0 : (session.durationMs ?? 0),
});

const toEventStats = (event: SessionEvent): DayStats => ({
	sessions: 0,
	messages: event.kind === "user" || event.kind === "assistant" ? 1 : 0,
	toolCalls: event.kind === "tool_call" ? 1 : 0,
	inputTokens: event.tokens?.inputTokens ?? 0,
	outputTokens: event.tokens?.outputTokens ?? 0,
	cacheReadTokens: event.tokens?.cacheReadTokens ?? 0,
	cacheWriteTokens: event.tokens?.cacheWriteTokens ?? 0,
	reasoningTokens: event.tokens?.reasoningTokens ?? 0,
	costUsd: event.costUsd ?? 0,
	durationMs: 0,
});

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
	try {
		const text = await Bun.file(path).text();
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
};

const writeJson = async <T>(path: string, value: T): Promise<void> => {
	await mkdir(paths.dataDir, { recursive: true });
	await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
};

const normalizeFact = (value: unknown): CanonicalHistoryFact | null => {
	if (!isRecord(value)) return null;

	const bucketStartUtc = startOfUtcHour(toNullableString(value.bucketStartUtc));
	const dimensionKind = toNullableString(value.dimensionKind);
	if (!bucketStartUtc || !dimensionKind || !["all", "source", "model", "repo", "tool"].includes(dimensionKind)) {
		return null;
	}

	const dimensionKey = normalizeDimensionKey(
		dimensionKind as HistoryDimensionKind,
		toNullableString(value.dimensionKey),
	);
	if (!dimensionKey) return null;

	return {
		bucketStartUtc,
		dimensionKind: dimensionKind as HistoryDimensionKind,
		dimensionKey,
		sessions: toFiniteNumber(value.sessions),
		messages: toFiniteNumber(value.messages),
		toolCalls: toFiniteNumber(value.toolCalls),
		inputTokens: toFiniteNumber(value.inputTokens),
		outputTokens: toFiniteNumber(value.outputTokens),
		cacheReadTokens: toFiniteNumber(value.cacheReadTokens),
		cacheWriteTokens: toFiniteNumber(value.cacheWriteTokens),
		reasoningTokens: toFiniteNumber(value.reasoningTokens),
		costUsd: toFiniteNumber(value.costUsd),
		durationMs: toFiniteNumber(value.durationMs),
		lastSeenAtUtc: normalizeIsoTimestamp(value.lastSeenAtUtc),
	};
};

const normalizeScanHistoryStore = (value: unknown): ScanHistoryStore => {
	if (!isRecord(value)) {
		return { version: HISTORY_SCAN_VERSION, facts: [] };
	}

	const rawFacts = Array.isArray(value.facts) ? value.facts : [];
	return {
		version: HISTORY_SCAN_VERSION,
		facts: rawFacts.map(normalizeFact).filter((fact): fact is CanonicalHistoryFact => fact !== null),
	};
};

const normalizeImportHistoryStore = (value: unknown): ImportHistoryStore => {
	if (!isRecord(value) || !isRecord(value.factsByBackupId)) {
		return { version: HISTORY_IMPORT_VERSION, factsByBackupId: {} };
	}

	const factsByBackupId: Record<string, CanonicalHistoryFact[]> = {};
	for (const [backupId, rawFacts] of Object.entries(value.factsByBackupId)) {
		if (!Array.isArray(rawFacts)) continue;
		factsByBackupId[backupId] = rawFacts
			.map(normalizeFact)
			.filter((fact): fact is CanonicalHistoryFact => fact !== null);
	}

	return {
		version: HISTORY_IMPORT_VERSION,
		factsByBackupId,
	};
};

const normalizeManifestStore = (value: unknown): ImportManifestStore => {
	const defaultStore: ImportManifestStore = {
		version: IMPORT_MANIFEST_VERSION,
		installId: randomUUID(),
		backups: [],
	};

	if (!isRecord(value)) {
		return defaultStore;
	}

	const backups = Array.isArray(value.backups) ? value.backups : [];
	return {
		version: IMPORT_MANIFEST_VERSION,
		installId: toNullableString(value.installId) ?? defaultStore.installId,
		backups: backups
			.map((backup) => {
				if (!isRecord(backup)) return null;
				const backupId = toNullableString(backup.backupId);
				const exportId = toNullableString(backup.exportId);
				const originInstallId = toNullableString(backup.originInstallId);
				const originalFilename = toNullableString(backup.originalFilename);
				const checksum = toNullableString(backup.checksum);
				const importedAtUtc = normalizeIsoTimestamp(backup.importedAtUtc);
				const exportedAtUtc = normalizeIsoTimestamp(backup.exportedAtUtc);
				const exportTimeZone = toNullableString(backup.exportTimeZone) ?? DEFAULT_EXPORT_TIME_ZONE;
				if (!backupId || !exportId || !originInstallId || !originalFilename || !checksum || !importedAtUtc) {
					return null;
				}

				return {
					backupId,
					exportId,
					originInstallId,
					originalFilename,
					checksum,
					importedAtUtc,
					exportedAtUtc,
					coverageStartDateUtc: toNullableString(backup.coverageStartDateUtc),
					coverageEndDateUtc: toNullableString(backup.coverageEndDateUtc),
					earliestKnownUsageDateUtc: toNullableString(backup.earliestKnownUsageDateUtc),
					exportTimeZone,
					schemaVersion: Math.max(1, Math.floor(toFiniteNumber(backup.schemaVersion) || CSV_SCHEMA_VERSION)),
					factCount: Math.max(0, Math.floor(toFiniteNumber(backup.factCount))),
				} satisfies ImportedBackupManifest;
			})
			.filter((backup): backup is ImportedBackupManifest => backup !== null),
	};
};

const normalizeSessionDurationStore = (value: unknown): SessionDurationStore => {
	if (!isRecord(value)) {
		return { version: HISTORY_SESSION_DURATION_VERSION, sessions: [] };
	}

	const rawSessions = Array.isArray(value.sessions) ? value.sessions : [];
	return {
		version: HISTORY_SESSION_DURATION_VERSION,
		sessions: rawSessions
			.map(normalizeSessionDurationIndexEntry)
			.filter((entry): entry is SessionDurationIndexEntry => entry !== null)
			.sort((left, right) => {
				if (left.startedAtUtc !== right.startedAtUtc) {
					return left.startedAtUtc.localeCompare(right.startedAtUtc);
				}
				return left.sessionKey.localeCompare(right.sessionKey);
			}),
	};
};

const readScanHistoryStore = async (): Promise<ScanHistoryStore> =>
	normalizeScanHistoryStore(await readJson<unknown>(getHistoryScanPath(), null));

const writeScanHistoryStore = async (store: ScanHistoryStore): Promise<void> => {
	await writeJson(getHistoryScanPath(), {
		version: HISTORY_SCAN_VERSION,
		facts: store.facts,
	} satisfies ScanHistoryStore);
};

const readImportHistoryStore = async (): Promise<ImportHistoryStore> =>
	normalizeImportHistoryStore(await readJson<unknown>(getHistoryImportPath(), null));

const writeImportHistoryStore = async (store: ImportHistoryStore): Promise<void> => {
	await writeJson(getHistoryImportPath(), {
		version: HISTORY_IMPORT_VERSION,
		factsByBackupId: store.factsByBackupId,
	} satisfies ImportHistoryStore);
};

const readImportManifestStore = async (): Promise<ImportManifestStore> =>
	normalizeManifestStore(await readJson<unknown>(getImportManifestPath(), null));

const readSessionDurationStore = async (): Promise<SessionDurationStore> =>
	normalizeSessionDurationStore(await readJson<unknown>(getSessionDurationPath(), null));

const writeImportManifestStore = async (store: ImportManifestStore): Promise<void> => {
	await writeJson(getImportManifestPath(), {
		version: IMPORT_MANIFEST_VERSION,
		installId: store.installId,
		backups: store.backups,
	} satisfies ImportManifestStore);
};

const writeSessionDurationStore = async (store: SessionDurationStore): Promise<void> => {
	await writeJson(getSessionDurationPath(), {
		version: HISTORY_SESSION_DURATION_VERSION,
		sessions: store.sessions,
	} satisfies SessionDurationStore);
};

const sortFacts = (facts: CanonicalHistoryFact[]): CanonicalHistoryFact[] =>
	[...facts].sort((left, right) => {
		if (left.bucketStartUtc !== right.bucketStartUtc) {
			return left.bucketStartUtc.localeCompare(right.bucketStartUtc);
		}
		if (left.dimensionKind !== right.dimensionKind) {
			return left.dimensionKind.localeCompare(right.dimensionKind);
		}
		return left.dimensionKey.localeCompare(right.dimensionKey);
	});

const factsEqual = (left: CanonicalHistoryFact[], right: CanonicalHistoryFact[]): boolean => {
	const sortedLeft = sortFacts(left);
	const sortedRight = sortFacts(right);
	if (sortedLeft.length !== sortedRight.length) return false;

	for (let index = 0; index < sortedLeft.length; index += 1) {
		const a = sortedLeft[index] as CanonicalHistoryFact;
		const b = sortedRight[index] as CanonicalHistoryFact;
		if (
			a.bucketStartUtc !== b.bucketStartUtc ||
			a.dimensionKind !== b.dimensionKind ||
			a.dimensionKey !== b.dimensionKey ||
			a.sessions !== b.sessions ||
			a.messages !== b.messages ||
			a.toolCalls !== b.toolCalls ||
			a.inputTokens !== b.inputTokens ||
			a.outputTokens !== b.outputTokens ||
			a.cacheReadTokens !== b.cacheReadTokens ||
			a.cacheWriteTokens !== b.cacheWriteTokens ||
			a.reasoningTokens !== b.reasoningTokens ||
			a.costUsd !== b.costUsd ||
			a.durationMs !== b.durationMs ||
			(a.lastSeenAtUtc ?? null) !== (b.lastSeenAtUtc ?? null)
		) {
			return false;
		}
	}

	return true;
};

const getActivityDates = (facts: CanonicalHistoryFact[], timeZone: string): Set<string> =>
	new Set(
		facts
			.filter((fact) => fact.dimensionKind === "all" && factHasActivity(fact))
			.map((fact) => toISODateInTimeZone(new Date(fact.bucketStartUtc), timeZone)),
	);

const factsToDailyStore = (facts: CanonicalHistoryFact[], timeZone: string): DailyStore => {
	const output: DailyStore = {};
	const hourFormatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "2-digit",
		hourCycle: "h23",
	});

	const ensureDay = (date: string): DailyAggregateEntry => {
		if (!output[date]) {
			output[date] = {
				bySource: {},
				byModel: {},
				byRepo: {},
				byTool: {},
				byHour: {},
				byHourSource: {},
				totals: createEmptyDayStats(),
			};
		}

		return output[date] as DailyAggregateEntry;
	};

	const ensureBucket = (buckets: Record<string, DayStats>, key: string): DayStats => {
		if (!buckets[key]) {
			buckets[key] = createEmptyDayStats();
		}
		return buckets[key] as DayStats;
	};

	for (const fact of facts) {
		const date = toISODateInTimeZone(new Date(fact.bucketStartUtc), timeZone);
		const hour = hourFormatter.format(new Date(fact.bucketStartUtc));
		const entry = ensureDay(date);
		const stats = toDayStats(fact);

		if (fact.dimensionKind === "all") {
			addStats(entry.totals, stats);
			addStats(ensureBucket(entry.byHour, hour), stats);
			continue;
		}

		if (fact.dimensionKind === "source") {
			addStats(ensureBucket(entry.bySource, fact.dimensionKey), stats);
			if (!entry.byHourSource[hour]) {
				entry.byHourSource[hour] = {};
			}
			addStats(ensureBucket(entry.byHourSource[hour] as Record<string, DayStats>, fact.dimensionKey), stats);
			continue;
		}

		if (fact.dimensionKind === "model") {
			addStats(ensureBucket(entry.byModel, fact.dimensionKey), stats);
			continue;
		}

		if (fact.dimensionKind === "repo") {
			addStats(ensureBucket(entry.byRepo, fact.dimensionKey), stats);
			continue;
		}

		if (fact.dimensionKind === "tool") {
			addStats(ensureBucket(entry.byTool, fact.dimensionKey), stats);
		}
	}

	const sortedDates = Object.keys(output).sort((a, b) => a.localeCompare(b));
	const sorted: DailyStore = {};
	for (const date of sortedDates) {
		sorted[date] = output[date] as DailyAggregateEntry;
	}
	return sorted;
};

const compareBackupsForRecency = (left: ImportedBackupManifest, right: ImportedBackupManifest): number => {
	const leftCoverage = left.coverageEndDateUtc ?? "";
	const rightCoverage = right.coverageEndDateUtc ?? "";
	if (leftCoverage !== rightCoverage) {
		return leftCoverage.localeCompare(rightCoverage);
	}
	const leftExportedAt = left.exportedAtUtc ?? left.importedAtUtc;
	const rightExportedAt = right.exportedAtUtc ?? right.importedAtUtc;
	if (leftExportedAt !== rightExportedAt) {
		return leftExportedAt.localeCompare(rightExportedAt);
	}
	if (left.importedAtUtc !== right.importedAtUtc) {
		return left.importedAtUtc.localeCompare(right.importedAtUtc);
	}
	return left.backupId.localeCompare(right.backupId);
};

const selectLatestBackup = (backups: ImportedBackupManifest[]): ImportedBackupManifest | null =>
	backups.reduce<ImportedBackupManifest | null>((latest, backup) => {
		if (!latest) return backup;
		return compareBackupsForRecency(latest, backup) < 0 ? backup : latest;
	}, null);

const groupFactsByLocalDate = <T extends { fact: CanonicalHistoryFact }>(
	facts: T[],
	timeZone: string,
): Map<string, T[]> => {
	const grouped = new Map<string, T[]>();
	for (const entry of facts) {
		const date = toISODateInTimeZone(new Date(entry.fact.bucketStartUtc), timeZone);
		const existing = grouped.get(date) ?? [];
		existing.push(entry);
		grouped.set(date, existing);
	}
	return grouped;
};

const selectEffectiveHistory = (
	scanFacts: CanonicalHistoryFact[],
	backups: ImportedBackupManifest[],
	factsByBackupId: Record<string, CanonicalHistoryFact[]>,
	options: MaterializeHistoryOptions,
): EffectiveHistorySelection => {
	const timeZone = options.timeZone;
	const effectiveFacts: CanonicalHistoryFact[] = [...scanFacts];
	const scanFactsByDate = groupFactsByLocalDate(
		scanFacts.filter((fact) => fact.dimensionKind === "all").map((fact) => ({ fact })),
		timeZone,
	);
	const effectiveDates = new Set<string>();
	for (const [date, facts] of scanFactsByDate.entries()) {
		if (facts.some(({ fact }) => factHasActivity(fact))) {
			effectiveDates.add(date);
		}
	}

	const activeBackup = selectLatestBackup(backups);
	const activeBackupIds = new Set(activeBackup ? [activeBackup.backupId] : []);
	const contributingBackupIds = new Set<string>();
	const skippedDatesByBackupId = new Map<string, Set<string>>();
	const claimedImportDates = new Set<string>();
	const mergedFacts = activeBackup
		? (factsByBackupId[activeBackup.backupId] ?? []).map((fact) => ({
				backupId: activeBackup.backupId,
				fact,
			}))
		: [];
	const factsByLocalDate = groupFactsByLocalDate(mergedFacts, timeZone);

	for (const [localDate, dateFacts] of factsByLocalDate.entries()) {
		if (effectiveDates.has(localDate) || claimedImportDates.has(localDate)) {
			for (const { backupId } of dateFacts) {
				const existing = skippedDatesByBackupId.get(backupId) ?? new Set<string>();
				existing.add(localDate);
				skippedDatesByBackupId.set(backupId, existing);
			}
			continue;
		}

		claimedImportDates.add(localDate);
		effectiveDates.add(localDate);
		for (const { backupId, fact } of dateFacts) {
			contributingBackupIds.add(backupId);
			effectiveFacts.push(fact);
		}
	}

	const sortedEffectiveFacts = sortFacts(effectiveFacts);
	const allFacts = sortedEffectiveFacts.filter((fact) => fact.dimensionKind === "all" && factHasActivity(fact));

	return {
		facts: sortedEffectiveFacts,
		activeBackupIds,
		contributingBackupIds,
		skippedDatesByBackupId,
		effectiveDates,
		coverageStartDateUtc: allFacts[0]?.bucketStartUtc.slice(0, 10) ?? null,
		coverageEndDateUtc: allFacts[allFacts.length - 1]?.bucketStartUtc.slice(0, 10) ?? null,
	};
};

const toImportedBackupSummary = (
	manifest: ImportedBackupManifest,
	activeBackupIds: Set<string>,
	contributingBackupIds: Set<string>,
): ImportedBackupSummary => ({
	backupId: manifest.backupId,
	exportId: manifest.exportId,
	originInstallId: manifest.originInstallId,
	originalFilename: manifest.originalFilename,
	checksum: manifest.checksum,
	importedAtUtc: manifest.importedAtUtc,
	coverageStartDateUtc: manifest.coverageStartDateUtc,
	coverageEndDateUtc: manifest.coverageEndDateUtc,
	earliestKnownUsageDateUtc: manifest.earliestKnownUsageDateUtc,
	exportTimeZone: manifest.exportTimeZone,
	schemaVersion: manifest.schemaVersion,
	factCount: manifest.factCount,
	isActive: activeBackupIds.has(manifest.backupId),
	contributesData: contributingBackupIds.has(manifest.backupId),
});

const escapeCsv = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replaceAll(`"`, `""`)}"` : value);

const splitCsvLine = (line: string): string[] => {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === `"`) {
			const next = line[index + 1];
			if (inQuotes && next === `"`) {
				current += `"`;
				index += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}

		if (char === "," && !inQuotes) {
			fields.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	fields.push(current);
	return fields;
};

const parseCsv = (csv: string): Array<Record<string, string>> => {
	const rows: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < csv.length; index += 1) {
		const char = csv[index];
		if (char === `"`) {
			const next = csv[index + 1];
			if (inQuotes && next === `"`) {
				current += `""`;
				index += 1;
				continue;
			}
			inQuotes = !inQuotes;
			current += char;
			continue;
		}

		if ((char === "\n" || char === "\r") && !inQuotes) {
			if (char === "\r" && csv[index + 1] === "\n") {
				index += 1;
			}
			rows.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	if (current.length > 0) {
		rows.push(current);
	}

	if (rows.length === 0) return [];
	const header = splitCsvLine(rows[0] as string);
	return rows
		.slice(1)
		.filter((line) => line.trim().length > 0)
		.map((line) => {
			const values = splitCsvLine(line);
			const row: Record<string, string> = {};
			for (let index = 0; index < header.length; index += 1) {
				row[header[index] as string] = values[index] ?? "";
			}
			return row;
		});
};

const parseBackupCsv = (csv: string): ParsedBackupCsv => {
	const headerLine = csv.split(/\r?\n/, 1)[0]?.replace(/^\uFEFF/, "") ?? "";
	const header = splitCsvLine(headerLine);
	if (header.length !== CSV_COLUMNS.length || header.some((value, index) => value !== CSV_COLUMNS[index])) {
		throw new Error("CSV header does not match the Codex Wrapped backup format.");
	}

	const rows = parseCsv(csv);
	if (rows.length === 0) {
		throw new Error("CSV is empty.");
	}

	const manifest = rows[0] as Record<string, string>;
	if (manifest.record_type !== "manifest") {
		throw new Error("CSV is missing the manifest row.");
	}

	if (manifest.schema_id !== CSV_SCHEMA_ID) {
		throw new Error("This CSV is not a Codex Wrapped backup.");
	}

	const schemaVersion = Math.floor(toFiniteNumber(manifest.schema_version));
	if (schemaVersion !== CSV_SCHEMA_VERSION) {
		throw new Error(`Unsupported backup schema version ${manifest.schema_version || "unknown"}.`);
	}

	const originInstallId = toNullableString(manifest.origin_install_id);
	const exportId = toNullableString(manifest.export_id);
	const exportedAtUtc = normalizeIsoTimestamp(manifest.exported_at_utc);
	if (!originInstallId || !exportId || !exportedAtUtc) {
		throw new Error("CSV manifest is missing required metadata.");
	}

	const parseStrictNumber = (
		rawValue: string,
		field: string,
		rowNumber: number,
		options: { integer?: boolean } = {},
	): number => {
		const value = rawValue.trim();
		if (value.length === 0) {
			throw new Error(`CSV fact row ${rowNumber} is missing ${field}.`);
		}

		const parsed = Number(value);
		if (!Number.isFinite(parsed)) {
			throw new Error(`CSV fact row ${rowNumber} has invalid ${field}.`);
		}
		if (parsed < 0) {
			throw new Error(`CSV fact row ${rowNumber} has negative ${field}.`);
		}
		if (options.integer && !Number.isInteger(parsed)) {
			throw new Error(`CSV fact row ${rowNumber} has non-integer ${field}.`);
		}
		return parsed;
	};

	const parseStrictBucketStartUtc = (rawValue: string, rowNumber: number): string => {
		const normalized = normalizeIsoTimestamp(rawValue);
		if (!normalized) {
			throw new Error(`CSV fact row ${rowNumber} has invalid bucket_start_utc.`);
		}

		if (startOfUtcHour(normalized) !== normalized) {
			throw new Error(`CSV fact row ${rowNumber} has non-hour bucket_start_utc.`);
		}

		return normalized;
	};

	const parseOptionalIsoTimestamp = (rawValue: string): string | null => {
		const value = rawValue.trim();
		if (value.length === 0) return null;
		return normalizeIsoTimestamp(value);
	};

	const facts: CanonicalHistoryFact[] = [];
	for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
		const row = rows[rowIndex] as Record<string, string>;
		if (row.record_type !== "fact") {
			continue;
		}

		const rowNumber = rowIndex + 2;
		if (row.schema_id !== CSV_SCHEMA_ID) {
			throw new Error(`CSV fact row ${rowNumber} has invalid schema_id.`);
		}
		const rowSchemaVersion = Math.floor(toFiniteNumber(row.schema_version));
		if (rowSchemaVersion !== schemaVersion) {
			throw new Error(`CSV fact row ${rowNumber} has inconsistent schema_version.`);
		}
		if (row.export_id && row.export_id !== exportId) {
			throw new Error(`CSV fact row ${rowNumber} has inconsistent export_id.`);
		}
		if (row.origin_install_id && row.origin_install_id !== originInstallId) {
			throw new Error(`CSV fact row ${rowNumber} has inconsistent origin_install_id.`);
		}

		const bucketStartUtc = parseStrictBucketStartUtc(row.bucket_start_utc, rowNumber);
		const lastSeenAtUtc = parseOptionalIsoTimestamp(row.last_seen_at_utc);
		if (row.last_seen_at_utc.trim().length > 0 && !lastSeenAtUtc) {
			throw new Error(`CSV fact row ${rowNumber} has invalid last_seen_at_utc.`);
		}

		const fact = normalizeFact({
			bucketStartUtc,
			dimensionKind: row.dimension_kind,
			dimensionKey: row.dimension_key,
			sessions: parseStrictNumber(row.sessions, "sessions", rowNumber, { integer: true }),
			messages: parseStrictNumber(row.messages, "messages", rowNumber, { integer: true }),
			toolCalls: parseStrictNumber(row.tool_calls, "tool_calls", rowNumber, { integer: true }),
			inputTokens: parseStrictNumber(row.input_tokens, "input_tokens", rowNumber, { integer: true }),
			outputTokens: parseStrictNumber(row.output_tokens, "output_tokens", rowNumber, { integer: true }),
			cacheReadTokens: parseStrictNumber(row.cache_read_tokens, "cache_read_tokens", rowNumber, { integer: true }),
			cacheWriteTokens: parseStrictNumber(row.cache_write_tokens, "cache_write_tokens", rowNumber, { integer: true }),
			reasoningTokens: parseStrictNumber(row.reasoning_tokens, "reasoning_tokens", rowNumber, { integer: true }),
			costUsd: parseStrictNumber(row.cost_usd, "cost_usd", rowNumber),
			durationMs: parseStrictNumber(row.duration_ms, "duration_ms", rowNumber, { integer: true }),
			lastSeenAtUtc,
		});

		if (!fact) {
			throw new Error(`CSV fact row ${rowNumber} is invalid.`);
		}
		facts.push(fact);
	}

	return {
		schemaVersion,
		originInstallId,
		exportId,
		exportedAtUtc,
		coverageStartDateUtc: toNullableString(manifest.coverage_start_date_utc),
		coverageEndDateUtc: toNullableString(manifest.coverage_end_date_utc),
		exportTimeZone: toNullableString(manifest.export_time_zone) ?? DEFAULT_EXPORT_TIME_ZONE,
		earliestKnownUsageDateUtc:
			toNullableString(manifest.earliest_known_usage_date_utc) ?? toNullableString(manifest.coverage_start_date_utc),
		facts: sortFacts(facts),
	};
};

const stringifyBackupCsv = (
	manifestStore: ImportManifestStore,
	effectiveFacts: CanonicalHistoryFact[],
	exportTimeZone: string,
): { filename: string; csv: string } => {
	const exportedAtUtc = new Date().toISOString();
	const exportId = randomUUID();
	const allFacts = effectiveFacts.filter((fact) => fact.dimensionKind === "all" && factHasActivity(fact));
	const coverageStartDateUtc = allFacts[0]?.bucketStartUtc.slice(0, 10) ?? "";
	const coverageEndDateUtc = allFacts[allFacts.length - 1]?.bucketStartUtc.slice(0, 10) ?? "";

	const rows: string[][] = [
		[...CSV_COLUMNS],
		[
			CSV_SCHEMA_ID,
			String(CSV_SCHEMA_VERSION),
			"manifest",
			manifestStore.installId,
			exportId,
			exportedAtUtc,
			coverageStartDateUtc,
			coverageEndDateUtc,
			exportTimeZone,
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			coverageStartDateUtc,
		],
	];

	for (const fact of effectiveFacts) {
		rows.push([
			CSV_SCHEMA_ID,
			String(CSV_SCHEMA_VERSION),
			"fact",
			manifestStore.installId,
			exportId,
			exportedAtUtc,
			coverageStartDateUtc,
			coverageEndDateUtc,
			exportTimeZone,
			fact.bucketStartUtc,
			fact.dimensionKind,
			fact.dimensionKey,
			String(fact.sessions),
			String(fact.messages),
			String(fact.toolCalls),
			String(fact.inputTokens),
			String(fact.outputTokens),
			String(fact.cacheReadTokens),
			String(fact.cacheWriteTokens),
			String(fact.reasoningTokens),
			String(fact.costUsd),
			String(fact.durationMs),
			fact.lastSeenAtUtc ?? "",
			coverageStartDateUtc,
		]);
	}

	const csv = rows.map((row) => row.map((value) => escapeCsv(value)).join(",")).join("\n");
	const stamp = exportedAtUtc.replaceAll(":", "").replaceAll("-", "").replace(".000Z", "Z");
	return {
		filename: `codex-wrapped-backup-${stamp}.csv`,
		csv: `${csv}\n`,
	};
};

export const aggregateNormalizedSessionsToHistoryFacts = (
	inputs: Array<{ session: Session; events: SessionEvent[] }>,
): CanonicalHistoryFact[] => {
	const facts = new Map<string, CanonicalHistoryFact>();

	for (const { session, events } of inputs) {
		const sessionTimestamp = parseSessionTimestamp(session);
		const sessionBucket = startOfUtcHour(sessionTimestamp);
		const sessionStats = toSessionStats(session, events.length === 0);
		const modelKey = session.model?.trim() || "unknown";
		const repoKey = session.repoName?.trim() || null;

		updateFact(facts, sessionBucket, "all", "all", sessionStats, sessionTimestamp);
		updateFact(facts, sessionBucket, "source", session.source, sessionStats, sessionTimestamp);
		updateFact(facts, sessionBucket, "model", modelKey, sessionStats, sessionTimestamp);
		updateFact(facts, sessionBucket, "repo", repoKey, sessionStats, sessionTimestamp);

		for (const event of events) {
			const stats = toEventStats(event);
			if (!hasTrackedActivity(stats)) {
				continue;
			}

			const eventTimestamp = resolveEventTimestamp(event, session);
			const eventBucket = startOfUtcHour(eventTimestamp);
			const eventModelKey = event.model?.trim() || modelKey;
			updateFact(facts, eventBucket, "all", "all", stats, eventTimestamp);
			updateFact(facts, eventBucket, "source", session.source, stats, eventTimestamp);
			updateFact(facts, eventBucket, "model", eventModelKey, stats, eventTimestamp);
			updateFact(facts, eventBucket, "repo", repoKey, stats, eventTimestamp);

			if (event.kind === "tool_call") {
				updateFact(facts, eventBucket, "tool", event.toolName?.trim() || "unknown", stats, eventTimestamp);
			}
		}
	}

	return sortFacts([...facts.values()]);
};

export const buildSessionDurationIndexFromSessions = (sessions: Session[]): SessionDurationIndexEntry[] =>
	sessions
		.map((session) => {
			const startedAtUtc = parseSessionTimestamp(session);
			const durationMs = session.isSubagent ? 0 : Math.max(0, session.durationMs ?? 0);
			if (!startedAtUtc || durationMs <= 0) {
				return null;
			}

			return {
				sessionKey: `${session.source}:${session.id}`,
				startedAtUtc,
				durationMs,
			} satisfies SessionDurationIndexEntry;
		})
		.filter((entry): entry is SessionDurationIndexEntry => entry !== null)
		.sort((left, right) => {
			if (left.startedAtUtc !== right.startedAtUtc) {
				return left.startedAtUtc.localeCompare(right.startedAtUtc);
			}
			return left.sessionKey.localeCompare(right.sessionKey);
		});

export const writeScanHistoryFacts = async (facts: CanonicalHistoryFact[]): Promise<void> => {
	await writeScanHistoryStore({
		version: HISTORY_SCAN_VERSION,
		facts: sortFacts(facts),
	});
};

export const writeScanSessionDurationIndex = async (sessions: SessionDurationIndexEntry[]): Promise<void> => {
	await writeSessionDurationStore({
		version: HISTORY_SESSION_DURATION_VERSION,
		sessions,
	});
};

export const getLongestSessionDurationInRange = async (
	dateFrom: string | undefined,
	dateTo: string | undefined,
	timeZone: string,
): Promise<number> => {
	const sessionStore = await readSessionDurationStore();
	let longestDurationMs = 0;

	for (const session of sessionStore.sessions) {
		const localDate = toISODateInTimeZone(new Date(session.startedAtUtc), timeZone);
		if (dateFrom && localDate < dateFrom) continue;
		if (dateTo && localDate > dateTo) continue;
		if (session.durationMs > longestDurationMs) {
			longestDurationMs = session.durationMs;
		}
	}

	return longestDurationMs;
};

export const sessionDurationIndexNeedsBackfill = async (): Promise<boolean> => {
	const scanStore = await readScanHistoryStore();
	const hasRecordedDurations = scanStore.facts.some((fact) => fact.dimensionKind === "all" && fact.durationMs > 0);
	if (!hasRecordedDurations) {
		return false;
	}

	const sessionStore = await readSessionDurationStore();
	return sessionStore.sessions.length === 0;
};

export const rematerializeDailyStoreFromHistory = async (timeZone: string): Promise<DailyStore> => {
	const scanStore = await readScanHistoryStore();
	const importStore = await readImportHistoryStore();
	const manifestStore = await readImportManifestStore();
	const selection = selectEffectiveHistory(scanStore.facts, manifestStore.backups, importStore.factsByBackupId, {
		timeZone,
		overlapPolicy: "local-wins",
	});
	return factsToDailyStore(selection.facts, timeZone);
};

export const exportBackupCsv = async (timeZone: string): Promise<{ filename: string; csv: string }> => {
	const scanStore = await readScanHistoryStore();
	const importStore = await readImportHistoryStore();
	const manifestStore = await readImportManifestStore();
	const selection = selectEffectiveHistory(scanStore.facts, manifestStore.backups, importStore.factsByBackupId, {
		timeZone,
		overlapPolicy: "local-wins",
	});
	await writeImportManifestStore(manifestStore);
	return stringifyBackupCsv(manifestStore, selection.facts, timeZone);
};

export const listImportedBackups = async (timeZone: string): Promise<ImportedBackupSummary[]> => {
	const scanStore = await readScanHistoryStore();
	const importStore = await readImportHistoryStore();
	const manifestStore = await readImportManifestStore();
	const selection = selectEffectiveHistory(scanStore.facts, manifestStore.backups, importStore.factsByBackupId, {
		timeZone,
		overlapPolicy: "local-wins",
	});

	return [...manifestStore.backups]
		.sort((left, right) => right.importedAtUtc.localeCompare(left.importedAtUtc))
		.map((backup) => toImportedBackupSummary(backup, selection.activeBackupIds, selection.contributingBackupIds));
};

export const importBackupCsv = async (filename: string, csv: string, timeZone: string): Promise<ImportBackupResult> => {
	const scanStore = await readScanHistoryStore();
	const importStore = await readImportHistoryStore();
	const manifestStore = await readImportManifestStore();
	const beforeSelection = selectEffectiveHistory(scanStore.facts, manifestStore.backups, importStore.factsByBackupId, {
		timeZone,
		overlapPolicy: "local-wins",
	});

	const checksum = createHash("sha256").update(csv).digest("hex");
	const duplicate = manifestStore.backups.find((backup) => backup.checksum === checksum);
	if (duplicate) {
		return {
			recognized: true,
			duplicate: true,
			backup: toImportedBackupSummary(
				duplicate,
				beforeSelection.activeBackupIds,
				beforeSelection.contributingBackupIds,
			),
			activeCoverageStartDateUtc: beforeSelection.coverageStartDateUtc,
			activeCoverageEndDateUtc: beforeSelection.coverageEndDateUtc,
			newDateCount: 0,
			overlappingDateCount: 0,
			skippedOverlappingDates: [],
			message: "This backup was already imported. No changes were made.",
		};
	}

	let parsed: ParsedBackupCsv;
	try {
		parsed = parseBackupCsv(csv);
	} catch (error) {
		return {
			recognized: false,
			duplicate: false,
			backup: null,
			activeCoverageStartDateUtc: beforeSelection.coverageStartDateUtc,
			activeCoverageEndDateUtc: beforeSelection.coverageEndDateUtc,
			newDateCount: 0,
			overlappingDateCount: 0,
			skippedOverlappingDates: [],
			message: error instanceof Error ? error.message : "This CSV could not be imported.",
		};
	}

	const activeImportedBackupBeforeImport = selectLatestBackup(manifestStore.backups);
	const staleAgainstActiveImportBeforeSimulation =
		Boolean(activeImportedBackupBeforeImport) &&
		parsed.originInstallId === activeImportedBackupBeforeImport?.originInstallId &&
		parsed.exportId !== activeImportedBackupBeforeImport?.exportId &&
		parsed.exportedAtUtc <=
			(activeImportedBackupBeforeImport?.exportedAtUtc ?? activeImportedBackupBeforeImport?.importedAtUtc ?? "");
	if (staleAgainstActiveImportBeforeSimulation) {
		return {
			recognized: true,
			duplicate: false,
			backup: null,
			activeCoverageStartDateUtc: beforeSelection.coverageStartDateUtc,
			activeCoverageEndDateUtc: beforeSelection.coverageEndDateUtc,
			newDateCount: 0,
			overlappingDateCount: 0,
			skippedOverlappingDates: [],
			message: "This backup is older than the data currently shown in Codex Wrapped. No changes were made.",
		};
	}

	const candidateBackupId = randomUUID();
	const simulatedImportFactsByBackupId = {
		...importStore.factsByBackupId,
		[candidateBackupId]: sortFacts(parsed.facts),
	};
	const simulatedBackups = [
		...manifestStore.backups,
		{
			backupId: candidateBackupId,
			exportId: parsed.exportId,
			originInstallId: parsed.originInstallId,
			originalFilename: filename || "backup.csv",
			checksum,
			importedAtUtc: new Date().toISOString(),
			exportedAtUtc: parsed.exportedAtUtc,
			coverageStartDateUtc: parsed.coverageStartDateUtc,
			coverageEndDateUtc: parsed.coverageEndDateUtc,
			earliestKnownUsageDateUtc: parsed.earliestKnownUsageDateUtc,
			exportTimeZone: parsed.exportTimeZone,
			schemaVersion: parsed.schemaVersion,
			factCount: parsed.facts.length,
		} satisfies ImportedBackupManifest,
	];
	const simulatedSelection = selectEffectiveHistory(scanStore.facts, simulatedBackups, simulatedImportFactsByBackupId, {
		timeZone,
		overlapPolicy: "local-wins",
	});
	if (factsEqual(beforeSelection.facts, simulatedSelection.facts)) {
		return {
			recognized: true,
			duplicate: false,
			backup: null,
			activeCoverageStartDateUtc: beforeSelection.coverageStartDateUtc,
			activeCoverageEndDateUtc: beforeSelection.coverageEndDateUtc,
			newDateCount: 0,
			overlappingDateCount: 0,
			skippedOverlappingDates: [],
			message: "This backup matches the data already shown in Codex Wrapped. No changes were made.",
		};
	}

	const activeImportedBackup = selectLatestBackup(manifestStore.backups);
	const activeImportedFacts = activeImportedBackup
		? sortFacts(importStore.factsByBackupId[activeImportedBackup.backupId] ?? [])
		: [];
	const newDates = [...simulatedSelection.effectiveDates]
		.filter((date) => !beforeSelection.effectiveDates.has(date))
		.sort();
	const allowSameOriginCorrectionRefresh =
		newDates.length === 0 &&
		Boolean(activeImportedBackup) &&
		parsed.originInstallId === activeImportedBackup?.originInstallId &&
		parsed.exportId !== activeImportedBackup?.exportId &&
		parsed.exportedAtUtc > (activeImportedBackup?.exportedAtUtc ?? activeImportedBackup?.importedAtUtc ?? "") &&
		!factsEqual(activeImportedFacts, sortFacts(parsed.facts));

	if (newDates.length === 0) {
		const staleAgainstActiveImport =
			Boolean(activeImportedBackup) &&
			parsed.originInstallId === activeImportedBackup?.originInstallId &&
			parsed.exportedAtUtc <= (activeImportedBackup?.exportedAtUtc ?? activeImportedBackup?.importedAtUtc ?? "");
		const staleAgainstVisibleCoverage =
			Boolean(beforeSelection.coverageEndDateUtc && parsed.coverageEndDateUtc) &&
			(parsed.coverageEndDateUtc as string) < (beforeSelection.coverageEndDateUtc as string);

		if (allowSameOriginCorrectionRefresh) {
			// Continue and store this import as a same-origin correction refresh.
		} else if (staleAgainstActiveImport || staleAgainstVisibleCoverage) {
			return {
				recognized: true,
				duplicate: false,
				backup: null,
				activeCoverageStartDateUtc: beforeSelection.coverageStartDateUtc,
				activeCoverageEndDateUtc: beforeSelection.coverageEndDateUtc,
				newDateCount: 0,
				overlappingDateCount: 0,
				skippedOverlappingDates: [],
				message: "This backup is older than the data currently shown in Codex Wrapped. No changes were made.",
			};
		}

		if (!allowSameOriginCorrectionRefresh) {
			return {
				recognized: true,
				duplicate: false,
				backup: null,
				activeCoverageStartDateUtc: beforeSelection.coverageStartDateUtc,
				activeCoverageEndDateUtc: beforeSelection.coverageEndDateUtc,
				newDateCount: 0,
				overlappingDateCount: 0,
				skippedOverlappingDates: [],
				message: "This backup only contains dates already shown in Codex Wrapped. No changes were made.",
			};
		}
	}

	const backupId = candidateBackupId;
	const importedAtUtc = new Date().toISOString();

	await mkdir(getBackupDir(backupId), { recursive: true });
	await Bun.write(getBackupCsvPath(backupId), csv);

	importStore.factsByBackupId[backupId] = sortFacts(parsed.facts);
	manifestStore.backups.push({
		backupId,
		exportId: parsed.exportId,
		originInstallId: parsed.originInstallId,
		originalFilename: filename || "backup.csv",
		checksum,
		importedAtUtc,
		exportedAtUtc: parsed.exportedAtUtc,
		coverageStartDateUtc: parsed.coverageStartDateUtc,
		coverageEndDateUtc: parsed.coverageEndDateUtc,
		earliestKnownUsageDateUtc: parsed.earliestKnownUsageDateUtc,
		exportTimeZone: parsed.exportTimeZone,
		schemaVersion: parsed.schemaVersion,
		factCount: parsed.facts.length,
	});

	await writeImportHistoryStore(importStore);
	await writeImportManifestStore(manifestStore);

	const afterSelection = selectEffectiveHistory(scanStore.facts, manifestStore.backups, importStore.factsByBackupId, {
		timeZone,
		overlapPolicy: "local-wins",
	});
	const importedBackup = manifestStore.backups.find((backup) => backup.backupId === backupId) as ImportedBackupManifest;
	const backupSummary = toImportedBackupSummary(
		importedBackup,
		afterSelection.activeBackupIds,
		afterSelection.contributingBackupIds,
	);
	const localScanDates = getActivityDates(scanStore.facts, timeZone);
	const skippedDates = [
		...new Set(
			parsed.facts
				.filter((fact) => fact.dimensionKind === "all" && factHasActivity(fact))
				.map((fact) => toISODateInTimeZone(new Date(fact.bucketStartUtc), timeZone))
				.filter((date) => localScanDates.has(date)),
		),
	].sort();

	return {
		recognized: true,
		duplicate: false,
		backup: backupSummary,
		activeCoverageStartDateUtc: afterSelection.coverageStartDateUtc,
		activeCoverageEndDateUtc: afterSelection.coverageEndDateUtc,
		newDateCount: newDates.length,
		overlappingDateCount: skippedDates.length,
		skippedOverlappingDates: skippedDates,
		message:
			newDates.length > 0
				? `Imported ${filename || "backup.csv"} and added ${newDates.length} new day${newDates.length === 1 ? "" : "s"}.`
				: `Imported ${filename || "backup.csv"} and refreshed existing covered days.`,
	};
};

export const deleteImportedBackup = async (backupId: string): Promise<void> => {
	const importStore = await readImportHistoryStore();
	const manifestStore = await readImportManifestStore();

	delete importStore.factsByBackupId[backupId];
	manifestStore.backups = manifestStore.backups.filter((backup) => backup.backupId !== backupId);

	await writeImportHistoryStore(importStore);
	await writeImportManifestStore(manifestStore);

	if (existsSync(getBackupDir(backupId))) {
		await rm(getBackupDir(backupId), { recursive: true, force: true });
	}
};
