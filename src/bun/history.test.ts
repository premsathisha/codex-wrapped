import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EMPTY_TOKEN_USAGE } from "../shared/schema";
import type { Session, SessionEvent } from "./session-schema";
import {
	aggregateNormalizedSessionsToHistoryFacts,
	deleteImportedBackup,
	exportBackupCsv,
	importBackupCsv,
	listImportedBackups,
	rematerializeDailyStoreFromHistory,
	writeScanHistoryFacts,
	type CanonicalHistoryFact,
} from "./history";
import { setDataDirOverrideForTests, writeDailyStore } from "./store";
import { startWebServer } from "./index";

const makeFact = (overrides: Partial<CanonicalHistoryFact>): CanonicalHistoryFact => ({
	bucketStartUtc: "2026-03-01T08:00:00.000Z",
	dimensionKind: "all",
	dimensionKey: "all",
	sessions: 1,
	messages: 2,
	toolCalls: 1,
	inputTokens: 100,
	outputTokens: 25,
	cacheReadTokens: 5,
	cacheWriteTokens: 0,
	reasoningTokens: 3,
	costUsd: 1.25,
	durationMs: 60_000,
	lastSeenAtUtc: "2026-03-01T08:45:00.000Z",
	...overrides,
});

const factsForBucket = (
	bucketStartUtc: string,
	stats: Partial<CanonicalHistoryFact> = {},
	repo = "Codex Wrapped",
): CanonicalHistoryFact[] => [
	makeFact({ bucketStartUtc, dimensionKind: "all", dimensionKey: "all", ...stats }),
	makeFact({ bucketStartUtc, dimensionKind: "source", dimensionKey: "codex", ...stats }),
	makeFact({ bucketStartUtc, dimensionKind: "model", dimensionKey: "gpt-5", ...stats }),
	makeFact({ bucketStartUtc, dimensionKind: "repo", dimensionKey: repo, ...stats }),
];

const makeSession = (overrides: Partial<Session>): Session => ({
	id: "session-1",
	source: "codex",
	filePath: "/tmp/session-1.jsonl",
	fileSizeBytes: 100,
	startTime: "2026-04-13T12:00:00.000Z",
	endTime: "2026-04-13T12:01:00.000Z",
	durationMs: 60_000,
	title: "Test session",
	model: "gpt-5",
	cwd: "/tmp/project",
	repoName: "project",
	gitBranch: "main",
	cliVersion: "1.0.0",
	eventCount: 0,
	messageCount: 0,
	totalTokens: { ...EMPTY_TOKEN_USAGE },
	totalCostUsd: null,
	toolCallCount: 0,
	isSubagent: false,
	lineageParentId: null,
	isHousekeeping: false,
	parsedAt: "2026-04-13T12:02:00.000Z",
	...overrides,
});

const makeTokenEvent = (
	sessionId: string,
	fingerprint: string,
	timestamp: string,
	tokens: NonNullable<SessionEvent["tokens"]>,
	costUsd: number,
): SessionEvent => ({
	id: `${sessionId}:${fingerprint}`,
	sessionId,
	kind: "meta",
	timestamp,
	role: "meta",
	text: null,
	toolName: null,
	toolInput: null,
	toolOutput: null,
	model: "gpt-5",
	parentId: null,
	messageId: null,
	isDelta: false,
	tokens,
	costUsd,
	tokenCountFingerprint: fingerprint,
});

let tempDirs: string[] = [];

beforeEach(() => {
	tempDirs = [];
});

afterEach(async () => {
	setDataDirOverrideForTests(null);
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true });
	}
});

const createTempDataDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), "codex-wrapped-history-test-"));
	tempDirs.push(dir);
	return dir;
};

const createStaticDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), "codex-wrapped-history-static-"));
	tempDirs.push(dir);
	await writeFile(join(dir, "index.html"), "<!doctype html><title>ok</title>\n", "utf8");
	return dir;
};

describe("history import/export", () => {
	test("export creates a manifest row with the canonical CSV schema", async () => {
		const dir = await createTempDataDir();
		setDataDirOverrideForTests(dir);
		await writeScanHistoryFacts(factsForBucket("2026-03-01T08:00:00.000Z"));

		const result = await exportBackupCsv("UTC");
		const lines = result.csv.trim().split(/\r?\n/);

		expect(result.filename.endsWith(".csv")).toBe(true);
		expect(lines[0]).toContain("schema_id,schema_version,record_type");
		expect(lines[1]).toContain(",manifest,");
		expect(result.csv).toContain("codex_wrapped_backup");
		expect(result.csv).toContain("2026-03-01");
	});

	test("import rejects unrecognized CSV files", async () => {
		const dir = await createTempDataDir();
		setDataDirOverrideForTests(dir);

		const result = await importBackupCsv("bad.csv", "hello,world\n1,2\n", "UTC");
		expect(result.recognized).toBe(false);
		expect(result.message).toBe("CSV header does not match the Codex Wrapped backup format.");
	});

	test("import hard-rejects CSVs with malformed numeric fact values", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts(factsForBucket("2026-03-01T08:00:00.000Z"));
		const exported = await exportBackupCsv("UTC");
		const malformed = exported.csv.replace(",100,25,5,0,3,1.25,60000,", ",abc,25,5,0,3,1.25,60000,");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		const result = await importBackupCsv(exported.filename, malformed, "UTC");

		expect(result.recognized).toBe(false);
		expect(result.message).toContain("invalid input_tokens");
	});

	test("importing the same CSV twice is a no-op", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts(factsForBucket("2026-03-01T08:00:00.000Z"));
		const exported = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		const first = await importBackupCsv(exported.filename, exported.csv, "UTC");
		const second = await importBackupCsv(exported.filename, exported.csv, "UTC");
		const backups = await listImportedBackups("UTC");

		expect(first.duplicate).toBe(false);
		expect(second.duplicate).toBe(true);
		expect(backups).toHaveLength(1);
		expect(backups[0]?.contributesData).toBe(true);
	});

	test("importing a CSV that matches the currently displayed history is a no-op", async () => {
		const dir = await createTempDataDir();
		setDataDirOverrideForTests(dir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }),
			...factsForBucket("2026-03-02T08:00:00.000Z", { inputTokens: 200, costUsd: 2 }),
		]);
		const exported = await exportBackupCsv("UTC");

		const imported = await importBackupCsv(exported.filename, exported.csv, "UTC");
		const backups = await listImportedBackups("UTC");
		const daily = await rematerializeDailyStoreFromHistory("UTC");

		expect(imported.recognized).toBe(true);
		expect(imported.message).toContain("already shown");
		expect(backups).toHaveLength(0);
		expect(daily["2026-03-01"]?.totals.inputTokens).toBe(100);
		expect(daily["2026-03-02"]?.totals.inputTokens).toBe(200);
	});

	test("importing a CSV with heavy overlap still succeeds when it adds a new day", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }),
			...factsForBucket("2026-03-02T08:00:00.000Z", { inputTokens: 200, costUsd: 2 }),
			...factsForBucket("2026-03-03T08:00:00.000Z", { inputTokens: 300, costUsd: 3 }),
			...factsForBucket("2026-03-04T08:00:00.000Z", { inputTokens: 400, costUsd: 4 }),
			...factsForBucket("2026-03-05T08:00:00.000Z", { inputTokens: 500, costUsd: 5 }),
			...factsForBucket("2026-03-06T08:00:00.000Z", { inputTokens: 600, costUsd: 6 }),
		]);
		const exported = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }),
			...factsForBucket("2026-03-02T08:00:00.000Z", { inputTokens: 200, costUsd: 2 }),
			...factsForBucket("2026-03-03T08:00:00.000Z", { inputTokens: 300, costUsd: 3 }),
			...factsForBucket("2026-03-04T08:00:00.000Z", { inputTokens: 400, costUsd: 4 }),
			...factsForBucket("2026-03-05T08:00:00.000Z", { inputTokens: 500, costUsd: 5 }),
		]);

		const imported = await importBackupCsv(exported.filename, exported.csv, "UTC");
		const backups = await listImportedBackups("UTC");
		const daily = await rematerializeDailyStoreFromHistory("UTC");

		expect(imported.recognized).toBe(true);
		expect(imported.duplicate).toBe(false);
		expect(imported.newDateCount).toBe(1);
		expect(imported.overlappingDateCount).toBe(5);
		expect(backups).toHaveLength(1);
		expect(backups[0]?.contributesData).toBe(true);
		expect(daily["2026-03-06"]?.totals.inputTokens).toBe(600);
	});

	test("re-importing a backup for the same covered day is rejected as already shown", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([...factsForBucket("2026-03-05T08:00:00.000Z", { inputTokens: 500, costUsd: 5 })]);
		const exported = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		await writeScanHistoryFacts([...factsForBucket("2026-03-05T15:00:00.000Z", { inputTokens: 250, costUsd: 2.5 })]);

		const imported = await importBackupCsv(exported.filename, exported.csv, "UTC");
		const backups = await listImportedBackups("UTC");

		expect(imported.recognized).toBe(true);
		expect(imported.duplicate).toBe(false);
		expect(imported.newDateCount).toBe(0);
		expect(imported.message).toContain("already shown");
		expect(backups).toHaveLength(0);
	});

	test("materialization keeps imported history as the base but lets local scan win on overlapping dates", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }),
			...factsForBucket("2026-03-02T08:00:00.000Z", { inputTokens: 200, costUsd: 2 }),
		]);
		const exported = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-02T15:00:00.000Z", { inputTokens: 500, costUsd: 5 }, "codex-wrapped"),
		]);

		const importResult = await importBackupCsv(exported.filename, exported.csv, "America/Phoenix");
		const backups = await listImportedBackups("America/Phoenix");
		const daily = await rematerializeDailyStoreFromHistory("America/Phoenix");

		expect(importResult.newDateCount).toBe(1);
		expect(importResult.overlappingDateCount).toBe(1);
		expect(backups[0]?.contributesData).toBe(true);
		expect(daily["2026-03-01"]?.totals.inputTokens).toBe(100);
		expect(daily["2026-03-01"]?.totals.costUsd).toBe(1);
		expect(daily["2026-03-02"]?.totals.inputTokens).toBe(500);
		expect(daily["2026-03-02"]?.totals.costUsd).toBe(5);

		await deleteImportedBackup(backups[0]?.backupId as string);
		const afterDelete = await rematerializeDailyStoreFromHistory("America/Phoenix");
		expect(afterDelete["2026-03-01"]).toBeUndefined();
		expect(afterDelete["2026-03-02"]?.totals.inputTokens).toBe(500);
	});

	test("newer backup from the same origin refreshes imported facts without double counting", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }, "AI Wrapped"),
		]);
		const exportedOne = await exportBackupCsv("UTC");

		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 150, costUsd: 1.5 }, "AI Wrapped"),
			...factsForBucket("2026-03-02T08:00:00.000Z", { inputTokens: 200, costUsd: 2 }, "AI Wrapped"),
		]);
		await new Promise((resolve) => setTimeout(resolve, 5));
		const exportedTwo = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		const first = await importBackupCsv(exportedOne.filename, exportedOne.csv, "UTC");
		const second = await importBackupCsv(exportedTwo.filename, exportedTwo.csv, "UTC");
		const backups = await listImportedBackups("UTC");
		const daily = await rematerializeDailyStoreFromHistory("UTC");

		expect(first.newDateCount).toBe(1);
		expect(second.newDateCount).toBe(1);
		expect(backups).toHaveLength(2);
		expect(backups.filter((backup) => backup.isActive)).toHaveLength(1);
		expect(daily["2026-03-01"]?.totals.inputTokens).toBe(150);
		expect(daily["2026-03-02"]?.totals.inputTokens).toBe(200);
		expect(daily["2026-03-01"]?.totals.costUsd).toBe(1.5);

		const latestBackup = backups.find((backup) => backup.isActive);
		await deleteImportedBackup(latestBackup?.backupId as string);
		const reverted = await rematerializeDailyStoreFromHistory("UTC");
		expect(reverted["2026-03-01"]?.totals.inputTokens).toBe(100);
		expect(reverted["2026-03-02"]).toBeUndefined();
	});

	test("older backup from same origin is rejected with a stale message", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }, "AI Wrapped"),
		]);
		const exportedOld = await exportBackupCsv("UTC");

		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 200, costUsd: 2 }, "AI Wrapped"),
		]);
		await new Promise((resolve) => setTimeout(resolve, 5));
		const exportedNew = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		const first = await importBackupCsv(exportedNew.filename, exportedNew.csv, "UTC");
		const second = await importBackupCsv(exportedOld.filename, exportedOld.csv, "UTC");

		expect(first.recognized).toBe(true);
		expect(first.duplicate).toBe(false);
		expect(second.recognized).toBe(true);
		expect(second.duplicate).toBe(false);
		expect(second.message).toContain("older than the data currently shown");
	});

	test("same-origin newer backup with covered dates refreshes facts even when no new days are added", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }, "AI Wrapped"),
		]);
		const exportedOne = await exportBackupCsv("UTC");

		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 175, costUsd: 1.75 }, "AI Wrapped"),
		]);
		await new Promise((resolve) => setTimeout(resolve, 5));
		const exportedTwo = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		const first = await importBackupCsv(exportedOne.filename, exportedOne.csv, "UTC");
		const second = await importBackupCsv(exportedTwo.filename, exportedTwo.csv, "UTC");
		const daily = await rematerializeDailyStoreFromHistory("UTC");

		expect(first.newDateCount).toBe(1);
		expect(second.recognized).toBe(true);
		expect(second.duplicate).toBe(false);
		expect(second.backup).not.toBeNull();
		expect(second.newDateCount).toBe(0);
		expect(second.message).toContain("refreshed existing covered days");
		expect(daily["2026-03-01"]?.totals.inputTokens).toBe(175);
		expect(daily["2026-03-01"]?.totals.costUsd).toBe(1.75);
	});

	test("latest imported backup is the only imported base and different-machine imports do not merge", async () => {
		const firstDir = await createTempDataDir();
		setDataDirOverrideForTests(firstDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-01T08:00:00.000Z", { inputTokens: 100, costUsd: 1 }, "Machine One"),
		]);
		const exportOne = await exportBackupCsv("UTC");

		const secondDir = await createTempDataDir();
		setDataDirOverrideForTests(secondDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-04-01T08:00:00.000Z", { inputTokens: 400, costUsd: 4 }, "Machine Two"),
		]);
		const exportTwo = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		await importBackupCsv(exportOne.filename, exportOne.csv, "UTC");
		await importBackupCsv(exportTwo.filename, exportTwo.csv, "UTC");

		const backups = await listImportedBackups("UTC");
		const daily = await rematerializeDailyStoreFromHistory("UTC");

		expect(backups.filter((backup) => backup.isActive)).toHaveLength(1);
		expect(daily["2026-03-01"]).toBeUndefined();
		expect(daily["2026-04-01"]?.totals.inputTokens).toBe(400);
	});

	test("imported history survives later local scans and timezone rematerialization", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-02T00:30:00.000Z", { inputTokens: 90, costUsd: 0.9 }, "Prem Repo"),
		]);
		const exported = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		setDataDirOverrideForTests(importDir);
		await importBackupCsv(exported.filename, exported.csv, "America/Phoenix");
		await writeScanHistoryFacts([
			...factsForBucket("2026-03-03T12:00:00.000Z", { inputTokens: 250, costUsd: 2.5 }, "Prem Repo"),
		]);

		const dailyPhoenix = await rematerializeDailyStoreFromHistory("America/Phoenix");
		const dailyUtc = await rematerializeDailyStoreFromHistory("UTC");

		expect(dailyPhoenix["2026-03-01"]?.totals.inputTokens).toBe(90);
		expect(dailyPhoenix["2026-03-03"]?.totals.inputTokens).toBe(250);
		expect(dailyUtc["2026-03-02"]?.totals.inputTokens).toBe(90);
		expect(dailyUtc["2026-03-03"]?.totals.inputTokens).toBe(250);
	});

	test("dashboard summary round-trips through export and import, including repo alias consolidation", async () => {
		const exportDir = await createTempDataDir();
		setDataDirOverrideForTests(exportDir);
		await writeScanHistoryFacts([
			...factsForBucket(
				"2026-03-01T08:00:00.000Z",
				{ inputTokens: 120, costUsd: 1.2, durationMs: 3_600_000 },
				"AI Wrapped",
			),
			...factsForBucket(
				"2026-03-02T08:00:00.000Z",
				{ inputTokens: 180, costUsd: 2.4, durationMs: 7_200_000 },
				"AI Wrapped",
			),
		]);
		const exported = await exportBackupCsv("UTC");

		const importDir = await createTempDataDir();
		const importStatic = await createStaticDir();
		setDataDirOverrideForTests(importDir);
		await importBackupCsv(exported.filename, exported.csv, "UTC");
		await writeScanHistoryFacts([
			...factsForBucket(
				"2026-03-03T08:00:00.000Z",
				{ inputTokens: 220, costUsd: 3.3, durationMs: 10_800_000 },
				"Codex Wrapped",
			),
		]);
		await writeDailyStore(await rematerializeDailyStoreFromHistory("UTC"));

		const server = await startWebServer({
			host: "127.0.0.1",
			port: 0,
			openBrowser: false,
			staticDir: importStatic,
			runScanOnLaunch: false,
			enableBackgroundScan: false,
		});

		try {
			const response = await fetch(`http://127.0.0.1:${server.port}/api/getDashboardSummary`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ dateFrom: "2026-03-01", dateTo: "2026-03-03" }),
			});
			const summary = (await response.json()) as {
				totals: { sessions: number; costUsd: number };
				topRepos: Array<{ repo: string; tokens: number }>;
			};

			expect(summary.totals.sessions).toBe(3);
			expect(summary.totals.costUsd).toBeCloseTo(6.9, 10);
			const wrappedRepo = summary.topRepos.find((repo) => repo.repo === "Codex Wrapped");
			expect(wrappedRepo).toBeDefined();
			expect(wrappedRepo?.tokens).toBe(619);
		} finally {
			server.stop(true);
		}
	});
});

describe("aggregateNormalizedSessionsToHistoryFacts", () => {
	test("dedupes mirrored parent and subagent token_count fingerprints while keeping both sessions", async () => {
		const dir = await createTempDataDir();
		setDataDirOverrideForTests(dir);

		const parent = {
			session: makeSession({
				id: "parent",
				startTime: "2026-04-13T12:00:00.000Z",
				parsedAt: "2026-04-13T12:02:00.000Z",
			}),
			events: [
				makeTokenEvent(
					"parent",
					"shared-a",
					"2026-04-13T12:05:00.000Z",
					{ inputTokens: 120, outputTokens: 20, cacheReadTokens: 400, cacheWriteTokens: 0, reasoningTokens: 10 },
					1.2,
				),
				makeTokenEvent(
					"parent",
					"shared-b",
					"2026-04-13T12:10:00.000Z",
					{ inputTokens: 80, outputTokens: 10, cacheReadTokens: 150, cacheWriteTokens: 0, reasoningTokens: 5 },
					0.8,
				),
			],
		};
		const child = {
			session: makeSession({
				id: "child",
				startTime: "2026-04-13T12:30:00.000Z",
				parsedAt: "2026-04-13T12:31:00.000Z",
				isSubagent: true,
				lineageParentId: "parent",
			}),
			events: [
				makeTokenEvent(
					"child",
					"shared-a",
					"2026-04-13T12:30:30.000Z",
					{ inputTokens: 120, outputTokens: 20, cacheReadTokens: 400, cacheWriteTokens: 0, reasoningTokens: 10 },
					1.2,
				),
				makeTokenEvent(
					"child",
					"shared-b",
					"2026-04-13T12:31:00.000Z",
					{ inputTokens: 80, outputTokens: 10, cacheReadTokens: 150, cacheWriteTokens: 0, reasoningTokens: 5 },
					0.8,
				),
				makeTokenEvent(
					"child",
					"child-only",
					"2026-04-13T12:32:00.000Z",
					{ inputTokens: 45, outputTokens: 15, cacheReadTokens: 90, cacheWriteTokens: 0, reasoningTokens: 3 },
					0.45,
				),
			],
		};

		const facts = aggregateNormalizedSessionsToHistoryFacts([parent, child]);
		const reversedFacts = aggregateNormalizedSessionsToHistoryFacts([child, parent]);
		expect(facts).toEqual(reversedFacts);

		await writeScanHistoryFacts(facts);
		const daily = await rematerializeDailyStoreFromHistory("UTC");
		const entry = daily["2026-04-13"];
		expect(entry?.totals.sessions).toBe(2);
		expect(entry?.totals.inputTokens).toBe(245);
		expect(entry?.totals.outputTokens).toBe(45);
		expect(entry?.totals.cacheReadTokens).toBe(640);
		expect(entry?.totals.reasoningTokens).toBe(18);
		expect(entry?.totals.costUsd).toBeCloseTo(2.45, 10);
	});

	test("does not dedupe identical fingerprints across unrelated sessions", async () => {
		const dir = await createTempDataDir();
		setDataDirOverrideForTests(dir);

		const first = {
			session: makeSession({ id: "first", startTime: "2026-04-13T12:00:00.000Z" }),
			events: [
				makeTokenEvent(
					"first",
					"same-fingerprint",
					"2026-04-13T12:05:00.000Z",
					{ inputTokens: 100, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 0, reasoningTokens: 5 },
					1,
				),
			],
		};
		const second = {
			session: makeSession({ id: "second", startTime: "2026-04-13T13:00:00.000Z" }),
			events: [
				makeTokenEvent(
					"second",
					"same-fingerprint",
					"2026-04-13T13:05:00.000Z",
					{ inputTokens: 100, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 0, reasoningTokens: 5 },
					1,
				),
			],
		};

		await writeScanHistoryFacts(aggregateNormalizedSessionsToHistoryFacts([first, second]));
		const daily = await rematerializeDailyStoreFromHistory("UTC");
		const entry = daily["2026-04-13"];
		expect(entry?.totals.sessions).toBe(2);
		expect(entry?.totals.inputTokens).toBe(200);
		expect(entry?.totals.costUsd).toBeCloseTo(2, 10);
	});

	test("keeps the unique child tail and fixes the April 9 versus April 13 ordering pattern", async () => {
		const dir = await createTempDataDir();
		setDataDirOverrideForTests(dir);

		const april9 = {
			session: makeSession({
				id: "april-9",
				startTime: "2026-04-09T12:00:00.000Z",
				parsedAt: "2026-04-09T12:01:00.000Z",
			}),
			events: [
				makeTokenEvent(
					"april-9",
					"april-9-usage",
					"2026-04-09T12:05:00.000Z",
					{ inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
					1,
				),
			],
		};
		const april13Parent = {
			session: makeSession({
				id: "april-13-parent",
				startTime: "2026-04-13T12:00:00.000Z",
				parsedAt: "2026-04-13T12:01:00.000Z",
			}),
			events: [
				makeTokenEvent(
					"april-13-parent",
					"shared-april-13",
					"2026-04-13T12:05:00.000Z",
					{ inputTokens: 600, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
					0.6,
				),
			],
		};
		const april13Child = {
			session: makeSession({
				id: "april-13-child",
				startTime: "2026-04-13T12:30:00.000Z",
				parsedAt: "2026-04-13T12:31:00.000Z",
				isSubagent: true,
				lineageParentId: "april-13-parent",
			}),
			events: [
				makeTokenEvent(
					"april-13-child",
					"shared-april-13",
					"2026-04-13T12:31:00.000Z",
					{ inputTokens: 600, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
					0.6,
				),
				makeTokenEvent(
					"april-13-child",
					"unique-april-13",
					"2026-04-13T12:32:00.000Z",
					{ inputTokens: 200, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
					0.2,
				),
			],
		};

		await writeScanHistoryFacts(aggregateNormalizedSessionsToHistoryFacts([april9, april13Parent, april13Child]));
		const daily = await rematerializeDailyStoreFromHistory("America/Phoenix");
		expect(daily["2026-04-09"]?.totals.inputTokens).toBe(1000);
		expect(daily["2026-04-13"]?.totals.inputTokens).toBe(800);
		expect((daily["2026-04-09"]?.totals.inputTokens ?? 0) > (daily["2026-04-13"]?.totals.inputTokens ?? 0)).toBe(true);
	});
});
