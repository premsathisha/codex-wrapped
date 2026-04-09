import type { DailyAggregate, DashboardSummary, SessionSource, TrayStats } from "./schema";

export interface AppSettings {
	scanOnLaunch: boolean;
	scanIntervalMinutes: number;
	theme: "system" | "light" | "dark";
	aggregationTimeZone: string;
	customPaths: Partial<Record<SessionSource, string>>;
}

export interface ImportedBackupSummary {
	backupId: string;
	exportId: string;
	originInstallId: string;
	originalFilename: string;
	checksum: string;
	importedAtUtc: string;
	coverageStartDateUtc: string | null;
	coverageEndDateUtc: string | null;
	earliestKnownUsageDateUtc: string | null;
	exportTimeZone: string;
	schemaVersion: number;
	factCount: number;
	isActive: boolean;
	contributesData: boolean;
}

export interface ImportBackupResult {
	recognized: boolean;
	duplicate: boolean;
	backup: ImportedBackupSummary | null;
	activeCoverageStartDateUtc: string | null;
	activeCoverageEndDateUtc: string | null;
	newDateCount: number;
	overlappingDateCount: number;
	skippedOverlappingDates: string[];
	message: string;
}

export type AIStatsRPC = {
	bun: {
		requests: {
			getDashboardSummary: {
				params: { dateFrom?: string; dateTo?: string };
				response: DashboardSummary;
			};
			getDailyTimeline: {
				params: { dateFrom: string; dateTo: string; source?: SessionSource; model?: string };
				response: DailyAggregate[];
			};
			triggerScan: {
				params: { fullScan?: boolean };
				response: { scanned: number; total: number; started: boolean };
			};
			getScanStatus: {
				params: {};
				response: { isScanning: boolean; lastScanAt: string | null; sessionCount: number };
			};
			getTrayStats: {
				params: {};
				response: TrayStats;
			};
			getSettings: {
				params: {};
				response: AppSettings;
			};
			exportFullSharePdf: {
				params: { url: string };
				response: { path: string; browser: string };
			};
			exportBackupCsv: {
				params: {};
				response: { filename: string; csv: string };
			};
			importBackupCsv: {
				params: { filename: string; csv: string };
				response: ImportBackupResult;
			};
			listImportedBackups: {
				params: {};
				response: ImportedBackupSummary[];
			};
			deleteImportedBackup: {
				params: { backupId: string };
				response: { ok: boolean };
			};
			updateSettings: {
				params: Partial<AppSettings>;
				response: boolean;
			};
		};
		messages: {
			log: { msg: string; level?: "info" | "warn" | "error" };
			openExternal: { url: string };
		};
	};

	webview: {
		requests: {};
		messages: {
			sessionsUpdated: { scanResult: { scanned: number; total: number } };
			scanProgress: { phase: string; current: number; total: number };
			scanStarted: {};
			scanCompleted: { scanned: number; total: number };
			navigate: { view: "dashboard" | "settings" };
			themeChanged: { theme: AppSettings["theme"] };
		};
	};
};
