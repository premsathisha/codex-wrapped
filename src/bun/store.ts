import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionSource } from "../shared/schema";
import type { AppSettings } from "../shared/types";

export interface ScanStateEntry {
	source: SessionSource;
	fileSize: number;
	mtimeMs: number;
	parsedAt: string;
}

export type ScanStateStore = Record<string, ScanStateEntry>;

export interface DayStats {
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
}

export interface DailyAggregateEntry {
	bySource: Record<string, DayStats>;
	byModel: Record<string, DayStats>;
	byRepo: Record<string, DayStats>;
	byTool: Record<string, DayStats>;
	byHour: Record<string, DayStats>;
	byHourSource: Record<string, Record<string, DayStats>>;
	totals: DayStats;
}

export type DailyStore = Record<string, DailyAggregateEntry>;

export interface AggregationMeta {
	version: number;
	timeZone: string;
}

const AGGREGATION_META_VERSION = 4;
let dataDirOverride = Bun.env.CODEX_WRAPPED_DATA_DIR?.trim() || null;

const resolveDefaultTimeZone = (): string => {
	const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	try {
		void new Intl.DateTimeFormat("en-US", { timeZone: fallback });
		return fallback;
	} catch {
		return "UTC";
	}
};

const normalizeTimeZone = (value: unknown): string => {
	if (typeof value !== "string" || value.trim().length === 0) {
		return resolveDefaultTimeZone();
	}

	const candidate = value.trim();
	try {
		void new Intl.DateTimeFormat("en-US", { timeZone: candidate });
		return candidate;
	} catch {
		return resolveDefaultTimeZone();
	}
};

const DEFAULT_SETTINGS: AppSettings = {
	scanOnLaunch: true,
	scanIntervalMinutes: 5,
	theme: "system",
	aggregationTimeZone: resolveDefaultTimeZone(),
	customPaths: {},
};

let scanStateCache: ScanStateStore | null = null;
let dailyCache: DailyStore | null = null;
let settingsCache: AppSettings | null = null;

const clone = <T>(value: T): T => structuredClone(value);

const getDataDir = (): string => dataDirOverride || join(homedir(), ".codex-wrapped");

const getLegacyDataDir = (): string => join(homedir(), `.ai${"-wrapped"}`);

const getScanStatePath = (): string => join(getDataDir(), "scan-state.json");

const getDailyPath = (): string => join(getDataDir(), "daily.json");

const getAggregationMetaPath = (): string => join(getDataDir(), "aggregation-meta.json");

const getSettingsPath = (): string => join(getDataDir(), "settings.json");

const resetStoreCaches = (): void => {
	scanStateCache = null;
	dailyCache = null;
	settingsCache = null;
};

export const setDataDirOverrideForTests = (nextPath: string | null): void => {
	dataDirOverride = typeof nextPath === "string" && nextPath.trim().length > 0 ? nextPath.trim() : null;
	resetStoreCaches();
};

const migrateLegacyDataDirIfNeeded = () => {
	const dataDir = getDataDir();
	const legacyDataDir = getLegacyDataDir();
	if (existsSync(dataDir) || !existsSync(legacyDataDir)) {
		return;
	}

	try {
		renameSync(legacyDataDir, dataDir);
	} catch {
		// If migration fails (permissions/cross-device), continue with the new directory.
	}
};

const ensureDataDir = () => {
	migrateLegacyDataDirIfNeeded();
	mkdirSync(getDataDir(), { recursive: true });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toNumber = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const toStringOr = (value: unknown, fallback: string): string =>
	typeof value === "string" && value.length > 0 ? value : fallback;

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
	migrateLegacyDataDirIfNeeded();
	try {
		const text = await Bun.file(path).text();
		const parsed = JSON.parse(text) as unknown;
		return parsed as T;
	} catch {
		return fallback;
	}
};

const writeJson = async <T>(path: string, value: T): Promise<void> => {
	ensureDataDir();
	await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
};

export const createEmptyDayStats = (): DayStats => ({
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
});

export const hasTrackedActivity = (stats: DayStats | null | undefined): boolean =>
	Boolean(stats) &&
	((stats?.sessions ?? 0) > 0 ||
		(stats?.messages ?? 0) > 0 ||
		(stats?.toolCalls ?? 0) > 0 ||
		(stats?.inputTokens ?? 0) > 0 ||
		(stats?.outputTokens ?? 0) > 0 ||
		(stats?.cacheReadTokens ?? 0) > 0 ||
		(stats?.cacheWriteTokens ?? 0) > 0 ||
		(stats?.reasoningTokens ?? 0) > 0 ||
		(stats?.costUsd ?? 0) > 0 ||
		(stats?.durationMs ?? 0) > 0);

const normalizeDayStats = (value: unknown): DayStats => {
	if (!isRecord(value)) {
		return createEmptyDayStats();
	}

	return {
		sessions: toNumber(value.sessions),
		messages: toNumber(value.messages),
		toolCalls: toNumber(value.toolCalls),
		inputTokens: toNumber(value.inputTokens),
		outputTokens: toNumber(value.outputTokens),
		cacheReadTokens: toNumber(value.cacheReadTokens),
		cacheWriteTokens: toNumber(value.cacheWriteTokens),
		reasoningTokens: toNumber(value.reasoningTokens),
		costUsd: toNumber(value.costUsd),
		durationMs: toNumber(value.durationMs),
	};
};

const normalizeDailyStore = (value: unknown): DailyStore => {
	if (!isRecord(value)) {
		return {};
	}

	const output: DailyStore = {};

	for (const [date, rawEntry] of Object.entries(value)) {
		if (!isRecord(rawEntry)) {
			continue;
		}

		const bySource: Record<string, DayStats> = {};
		if (isRecord(rawEntry.bySource)) {
			for (const [source, rawStats] of Object.entries(rawEntry.bySource)) {
				bySource[source] = normalizeDayStats(rawStats);
			}
		}

		const byModel: Record<string, DayStats> = {};
		if (isRecord(rawEntry.byModel)) {
			for (const [model, rawStats] of Object.entries(rawEntry.byModel)) {
				byModel[model] = normalizeDayStats(rawStats);
			}
		}

		const byRepo: Record<string, DayStats> = {};
		if (isRecord(rawEntry.byRepo)) {
			for (const [repo, rawStats] of Object.entries(rawEntry.byRepo)) {
				byRepo[repo] = normalizeDayStats(rawStats);
			}
		}

		const byTool: Record<string, DayStats> = {};
		if (isRecord(rawEntry.byTool)) {
			for (const [tool, rawStats] of Object.entries(rawEntry.byTool)) {
				byTool[tool] = normalizeDayStats(rawStats);
			}
		}

		const byHour: Record<string, DayStats> = {};
		if (isRecord(rawEntry.byHour)) {
			for (const [hour, rawStats] of Object.entries(rawEntry.byHour)) {
				byHour[hour] = normalizeDayStats(rawStats);
			}
		}

		const byHourSource: Record<string, Record<string, DayStats>> = {};
		if (isRecord(rawEntry.byHourSource)) {
			for (const [hour, rawSources] of Object.entries(rawEntry.byHourSource)) {
				if (!isRecord(rawSources)) continue;
				byHourSource[hour] = {};
				for (const [source, rawStats] of Object.entries(rawSources)) {
					byHourSource[hour][source] = normalizeDayStats(rawStats);
				}
			}
		}

		output[date] = {
			bySource,
			byModel,
			byRepo,
			byTool,
			byHour,
			byHourSource,
			totals: normalizeDayStats(rawEntry.totals),
		};
	}

	return output;
};

const normalizeAggregationMeta = (value: unknown): AggregationMeta | null => {
	if (!isRecord(value)) {
		return null;
	}

	const version = value.version;
	const timeZone = value.timeZone;
	if (
		typeof version !== "number" ||
		!Number.isFinite(version) ||
		!Number.isInteger(version) ||
		typeof timeZone !== "string" ||
		timeZone.trim().length === 0
	) {
		return null;
	}

	return {
		version,
		timeZone: timeZone.trim(),
	};
};

const normalizeScanState = (value: unknown): ScanStateStore => {
	if (!isRecord(value)) {
		return {};
	}

	const output: ScanStateStore = {};

	for (const [filePath, rawState] of Object.entries(value)) {
		if (!isRecord(rawState)) {
			continue;
		}

		const source = rawState.source;
		if (typeof source !== "string") {
			continue;
		}

		output[filePath] = {
			source: source as SessionSource,
			fileSize: toNumber(rawState.fileSize),
			mtimeMs: toNumber(rawState.mtimeMs),
			parsedAt: toStringOr(rawState.parsedAt, new Date(0).toISOString()),
		};
	}

	return output;
};

const normalizeSettings = (value: unknown): AppSettings => {
	if (!isRecord(value)) {
		return clone(DEFAULT_SETTINGS);
	}

	const customPathsInput = isRecord(value.customPaths) ? value.customPaths : {};
	const customPaths: AppSettings["customPaths"] = {};

	for (const [source, pathValue] of Object.entries(customPathsInput)) {
		if (typeof pathValue === "string") {
			customPaths[source as SessionSource] = pathValue;
		}
	}

	return {
		scanOnLaunch: typeof value.scanOnLaunch === "boolean" ? value.scanOnLaunch : DEFAULT_SETTINGS.scanOnLaunch,
		scanIntervalMinutes:
			typeof value.scanIntervalMinutes === "number" && Number.isFinite(value.scanIntervalMinutes)
				? Math.max(1, Math.floor(value.scanIntervalMinutes))
				: DEFAULT_SETTINGS.scanIntervalMinutes,
		theme:
			value.theme === "system" || value.theme === "light" || value.theme === "dark"
				? value.theme
				: DEFAULT_SETTINGS.theme,
		aggregationTimeZone: normalizeTimeZone(value.aggregationTimeZone),
		customPaths,
	};
};

export const readScanState = async (): Promise<ScanStateStore> => {
	if (scanStateCache === null) {
		const raw = await readJson<unknown>(getScanStatePath(), {});
		scanStateCache = normalizeScanState(raw);
	}

	return clone(scanStateCache);
};

export const writeScanState = async (state: ScanStateStore): Promise<void> => {
	scanStateCache = normalizeScanState(state);
	await writeJson(getScanStatePath(), scanStateCache);
};

export const readDailyStore = async (): Promise<DailyStore> => {
	if (dailyCache === null) {
		const raw = await readJson<unknown>(getDailyPath(), {});
		dailyCache = normalizeDailyStore(raw);
	}

	return clone(dailyCache);
};

export const writeDailyStore = async (daily: DailyStore): Promise<void> => {
	dailyCache = normalizeDailyStore(daily);
	await writeJson(getDailyPath(), dailyCache);
};

const rawDailyStoreHasActivity = (raw: unknown): boolean => {
	if (!isRecord(raw)) {
		return false;
	}

	for (const rawEntry of Object.values(raw)) {
		if (!isRecord(rawEntry)) {
			continue;
		}

		const totals = normalizeDayStats(rawEntry.totals);
		if (hasTrackedActivity(totals)) {
			return true;
		}
	}

	return false;
};

export const dailyStoreMissingRepoDimension = async (): Promise<boolean> => {
	const raw = await readJson<unknown>(getDailyPath(), {});
	if (!isRecord(raw)) {
		return false;
	}

	for (const rawEntry of Object.values(raw)) {
		if (!isRecord(rawEntry)) {
			continue;
		}

		if (!Object.prototype.hasOwnProperty.call(rawEntry, "byRepo")) {
			return true;
		}
	}

	return false;
};

export const rawDailyStoreMissingHourDimension = (raw: unknown): boolean => {
	if (!isRecord(raw)) {
		return false;
	}

	for (const rawEntry of Object.values(raw)) {
		if (!isRecord(rawEntry)) {
			continue;
		}

		const totals = normalizeDayStats(rawEntry.totals);
		if (!hasTrackedActivity(totals)) {
			continue;
		}

		if (!Object.prototype.hasOwnProperty.call(rawEntry, "byHour")) {
			return true;
		}

		const byHour = rawEntry.byHour;
		if (!isRecord(byHour)) {
			return true;
		}

		if (!Object.prototype.hasOwnProperty.call(rawEntry, "byHourSource")) {
			return true;
		}

		const byHourSource = rawEntry.byHourSource;
		if (!isRecord(byHourSource)) {
			return true;
		}
	}

	return false;
};

export const rawAggregationMetaNeedsTimeZoneBackfill = (rawMeta: unknown, currentTimeZone: string): boolean => {
	const normalizedCurrent =
		typeof currentTimeZone === "string" && currentTimeZone.trim().length > 0 ? currentTimeZone.trim() : "UTC";
	const meta = normalizeAggregationMeta(rawMeta);
	if (!meta) {
		return true;
	}

	if (meta.version !== AGGREGATION_META_VERSION) {
		return true;
	}

	return meta.timeZone !== normalizedCurrent;
};

export const dailyStoreMissingHourDimension = async (): Promise<boolean> => {
	const raw = await readJson<unknown>(getDailyPath(), {});
	return rawDailyStoreMissingHourDimension(raw);
};

export const dailyStoreNeedsTimeZoneBackfill = async (currentTimeZone: string): Promise<boolean> => {
	const rawDaily = await readJson<unknown>(getDailyPath(), {});
	if (!rawDailyStoreHasActivity(rawDaily)) {
		return false;
	}

	const rawMeta = await readJson<unknown>(getAggregationMetaPath(), null);
	return rawAggregationMetaNeedsTimeZoneBackfill(rawMeta, currentTimeZone);
};

export const writeAggregationMeta = async (timeZone: string): Promise<void> => {
	const normalizedTimeZone = typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone.trim() : "UTC";
	await writeJson<AggregationMeta>(getAggregationMetaPath(), {
		version: AGGREGATION_META_VERSION,
		timeZone: normalizedTimeZone,
	});
};

export const readAggregationMeta = async (): Promise<AggregationMeta | null> => {
	const raw = await readJson<unknown>(getAggregationMetaPath(), null);
	return normalizeAggregationMeta(raw);
};

export const readAggregationTimeZone = async (fallback = "UTC"): Promise<string> => {
	const meta = await readAggregationMeta();
	if (meta?.timeZone) {
		return meta.timeZone;
	}

	return typeof fallback === "string" && fallback.trim().length > 0 ? fallback.trim() : "UTC";
};

export const getSettings = async (): Promise<AppSettings> => {
	if (settingsCache === null) {
		const raw = await readJson<unknown>(getSettingsPath(), DEFAULT_SETTINGS);
		settingsCache = normalizeSettings(raw);
	}

	return clone(settingsCache);
};

export const setSettings = async (settings: AppSettings): Promise<void> => {
	settingsCache = normalizeSettings(settings);
	await writeJson(getSettingsPath(), settingsCache);
};

export const paths = {
	get dataDir() {
		return getDataDir();
	},
	get scanState() {
		return getScanStatePath();
	},
	get daily() {
		return getDailyPath();
	},
	get aggregationMeta() {
		return getAggregationMetaPath();
	},
	get settings() {
		return getSettingsPath();
	},
};
