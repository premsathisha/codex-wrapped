import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImportBackupResult, ImportedBackupSummary } from "@shared/types";
import DashboardCharts from "./DashboardCharts";
import DashboardFooter from "./DashboardFooter";
import EmptyState from "./EmptyState";
import Sidebar from "./Sidebar";
import StatsCards from "./StatsCards";
import DownloadableCard from "./DownloadableCard";
import { useDashboardData, type DashboardDateRange } from "../hooks/useDashboardData";
import { useRPC } from "../hooks/useRPC";
import { THEME_OPTIONS, THEME_PALETTES, type ThemeName } from "../lib/themePalettes";
import { getHeroCopy } from "../lib/heroCopy";

const CARD_ANIMATION_MS = 2000;
const THEME_STORAGE_KEY = "codex-wrapped-theme";
const isThemeName = (value: string): value is ThemeName =>
	value === "blue" ||
	value === "green" ||
	value === "gray" ||
	value === "red" ||
	value === "orange" ||
	value === "teal" ||
	value === "pink" ||
	value === "purple";

const TIME_ZONE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "UTC", label: "UTC" },
	{ value: "America/Los_Angeles", label: "Los Angeles" },
	{ value: "America/Denver", label: "Denver" },
	{ value: "America/Phoenix", label: "Phoenix" },
	{ value: "America/Chicago", label: "Chicago" },
	{ value: "America/New_York", label: "New York" },
	{ value: "Europe/London", label: "London" },
	{ value: "Europe/Berlin", label: "Berlin" },
	{ value: "Asia/Dubai", label: "Dubai" },
	{ value: "Asia/Kolkata", label: "Kolkata" },
	{ value: "Asia/Singapore", label: "Singapore" },
	{ value: "Asia/Tokyo", label: "Tokyo" },
	{ value: "Australia/Sydney", label: "Sydney" },
];

const Dashboard = () => {
	const rpc = useRPC();
	const {
		dateFrom,
		dateTo,
		aggregationTimeZone,
		summary,
		timeline,
		loading,
		error,
		refresh,
		isScanning,
		totals,
		modelBreakdown,
		topRepos,
		selectedRange,
		setSelectedRange,
		rangeOptions,
		dailyAgentTokensByDate,
		dailyAgentCostsByDate,
		dailyModelCostsByDate,
		dailyModelTokensByDate,
		hourlyBreakdown,
		weekendTokenPercent,
		busiestDayOfWeek,
		busiestSingleDay,
	} = useDashboardData();
	const costAgentFilter = "all" as const;
	const costGroupBy = "none" as const;
	const [selectedTheme, setSelectedTheme] = useState<ThemeName>(() => {
		if (typeof window === "undefined") return "purple";
		const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
		return stored && isThemeName(stored) ? stored : "purple";
	});
	const [animatingCardIndices, setAnimatingCardIndices] = useState<Record<number, boolean>>({});
	const [isUpdatingTimeZone, setIsUpdatingTimeZone] = useState(false);
	const [importedBackups, setImportedBackups] = useState<ImportedBackupSummary[]>([]);
	const [importResult, setImportResult] = useState<ImportBackupResult | null>(null);
	const [isImportingBackup, setIsImportingBackup] = useState(false);
	const [isExportingBackup, setIsExportingBackup] = useState(false);
	const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);
	const [isRefreshScanPending, setIsRefreshScanPending] = useState(false);
	const [pendingTimeZoneSelection, setPendingTimeZoneSelection] = useState<string | null>(null);
	const activeCardRef = useRef<number>(1);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const animatedCardIndicesRef = useRef<Set<number>>(new Set());
	const animationTimeoutByCardRef = useRef<Record<number, number>>({});
	const prefersReducedMotionRef = useRef<boolean>(false);
	const isUpdatingTimeZoneRef = useRef(false);
	const refreshPendingTimeoutRef = useRef<number | null>(null);
	const effectiveIsScanning = isScanning || isRefreshScanPending;
	const displayedTimeZone = pendingTimeZoneSelection ?? aggregationTimeZone;

	const startCardAnimation = useCallback((index: number) => {
		if (index <= 0 || prefersReducedMotionRef.current) return;

		const existingTimeoutId = animationTimeoutByCardRef.current[index];
		if (existingTimeoutId) {
			window.clearTimeout(existingTimeoutId);
		}

		setAnimatingCardIndices((current) => ({ ...current, [index]: true }));
		animationTimeoutByCardRef.current[index] = window.setTimeout(() => {
			setAnimatingCardIndices((current) => {
				if (!current[index]) return current;
				const nextAnimations = { ...current };
				delete nextAnimations[index];
				return nextAnimations;
			});
			delete animationTimeoutByCardRef.current[index];
		}, CARD_ANIMATION_MS);
	}, []);

	const handleRangeChange = (value: string) => {
		const next = value as DashboardDateRange;
		if (!rangeOptions.some((option) => option.value === next)) return;
		setSelectedRange(next);
	};

	const handleThemeChange = (value: string) => {
		const next = value;
		if (!isThemeName(next)) return;
		setSelectedTheme(next);
	};

	const handleHardRefresh = useCallback(() => {
		if (effectiveIsScanning || isUpdatingTimeZoneRef.current) return;

		void (async () => {
			setIsRefreshScanPending(true);
			if (refreshPendingTimeoutRef.current !== null) {
				window.clearTimeout(refreshPendingTimeoutRef.current);
			}
			refreshPendingTimeoutRef.current = window.setTimeout(() => {
				setIsRefreshScanPending(false);
				void refresh();
				refreshPendingTimeoutRef.current = null;
			}, 12_000);

			try {
				const scanResult = await rpc.request.triggerScan({ fullScan: true });
				if (!scanResult.started) {
					if (refreshPendingTimeoutRef.current !== null) {
						window.clearTimeout(refreshPendingTimeoutRef.current);
						refreshPendingTimeoutRef.current = null;
					}
					setIsRefreshScanPending(false);
					await refresh();
				}
			} catch (error) {
				if (refreshPendingTimeoutRef.current !== null) {
					window.clearTimeout(refreshPendingTimeoutRef.current);
					refreshPendingTimeoutRef.current = null;
				}
				setIsRefreshScanPending(false);
				await rpc.send.log({
					level: "error",
					msg: error instanceof Error ? error.message : "Hard refresh failed.",
				});
			}
		})();
	}, [effectiveIsScanning, refresh, rpc]);

	const timeZoneOptions = useMemo(() => {
		if (TIME_ZONE_OPTIONS.some((option) => option.value === aggregationTimeZone)) {
			return TIME_ZONE_OPTIONS;
		}
		const city = aggregationTimeZone.split("/").pop()?.replaceAll("_", " ") ?? aggregationTimeZone;
		return [{ value: aggregationTimeZone, label: city }, ...TIME_ZONE_OPTIONS];
	}, [aggregationTimeZone]);

	const loadImportedBackups = useCallback(async () => {
		const backups = await rpc.request.listImportedBackups({});
		setImportedBackups(backups);
	}, [rpc]);

	const handleTimeZoneChange = useCallback(
		(value: string) => {
			if (
				!value ||
				value === aggregationTimeZone ||
				value === pendingTimeZoneSelection ||
				isUpdatingTimeZoneRef.current ||
				effectiveIsScanning
			) {
				return;
			}

			isUpdatingTimeZoneRef.current = true;
			setIsUpdatingTimeZone(true);
			setPendingTimeZoneSelection(value);

			void (async () => {
				try {
					await rpc.request.updateSettings({ aggregationTimeZone: value });
					const scanResult = await rpc.request.triggerScan({ fullScan: false });
					if (!scanResult.started) {
						await refresh();
					}
					await loadImportedBackups();
				} catch (error) {
					setPendingTimeZoneSelection(null);
					await rpc.send.log({
						level: "error",
						msg: error instanceof Error ? error.message : "Time zone update failed.",
					});
				} finally {
					setPendingTimeZoneSelection(null);
					isUpdatingTimeZoneRef.current = false;
					setIsUpdatingTimeZone(false);
				}
			})();
		},
		[aggregationTimeZone, pendingTimeZoneSelection, effectiveIsScanning, loadImportedBackups, refresh, rpc],
	);
	const themePalette = THEME_PALETTES[selectedTheme];

	useEffect(() => {
		if (pendingTimeZoneSelection === null) return;
		if (aggregationTimeZone === pendingTimeZoneSelection) {
			setPendingTimeZoneSelection(null);
		}
	}, [aggregationTimeZone, pendingTimeZoneSelection]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateReducedMotionPreference = (matches: boolean) => {
			prefersReducedMotionRef.current = matches;
		};
		const onPreferenceChange = (event: MediaQueryListEvent) => {
			updateReducedMotionPreference(event.matches);
		};

		updateReducedMotionPreference(mediaQuery.matches);

		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", onPreferenceChange);
		} else {
			mediaQuery.addListener(onPreferenceChange);
		}

		return () => {
			if (typeof mediaQuery.removeEventListener === "function") {
				mediaQuery.removeEventListener("change", onPreferenceChange);
			} else {
				mediaQuery.removeListener(onPreferenceChange);
			}
			for (const timeoutId of Object.values(animationTimeoutByCardRef.current)) {
				window.clearTimeout(timeoutId);
			}
		};
	}, []);

	useEffect(() => {
		window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
	}, [selectedTheme]);

	useEffect(() => {
		return () => {
			if (refreshPendingTimeoutRef.current !== null) {
				window.clearTimeout(refreshPendingTimeoutRef.current);
				refreshPendingTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!isScanning) return;
		if (refreshPendingTimeoutRef.current !== null) {
			window.clearTimeout(refreshPendingTimeoutRef.current);
			refreshPendingTimeoutRef.current = null;
		}
		setIsRefreshScanPending(false);
	}, [isScanning]);

	useEffect(() => {
		void loadImportedBackups();
	}, [loadImportedBackups]);

	useEffect(() => {
		const root = scrollRef.current;
		if (!root) return;

		const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card-index]"));
		if (cards.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;

					const index = Number((entry.target as HTMLElement).dataset.cardIndex ?? 0);
					if (index <= 0 || animatedCardIndicesRef.current.has(index)) continue;

					animatedCardIndicesRef.current.add(index);
					startCardAnimation(index);
				}

				const next = entries
					.filter((entry) => entry.isIntersecting)
					.map((entry) => ({
						index: Number((entry.target as HTMLElement).dataset.cardIndex ?? 0),
						ratio: entry.intersectionRatio,
					}))
					.filter((entry) => entry.index > 0)
					.sort((left, right) => right.ratio - left.ratio)[0];

				if (!next || next.index === activeCardRef.current) return;

				activeCardRef.current = next.index;
			},
			{
				root,
				threshold: [0.25, 0.45, 0.65, 0.85],
			},
		);

		for (const card of cards) {
			observer.observe(card);
		}

		return () => observer.disconnect();
	}, [summary, error, startCardAnimation]);

	useEffect(() => {
		const root = scrollRef.current;
		if (!root) return;
		document.documentElement.style.setProperty("--wrapped-scroll-y", "0px");
		document.documentElement.style.setProperty("--wrapped-scroll-progress", "0");
		return () => {
			document.documentElement.style.setProperty("--wrapped-scroll-y", "0px");
			document.documentElement.style.setProperty("--wrapped-scroll-progress", "0");
		};
	}, [summary, error]);

	useEffect(() => {
		animatedCardIndicesRef.current.clear();

		for (const timeoutId of Object.values(animationTimeoutByCardRef.current)) {
			window.clearTimeout(timeoutId);
		}
		animationTimeoutByCardRef.current = {};
		setAnimatingCardIndices({});

		const currentCardIndex = activeCardRef.current > 0 ? activeCardRef.current : 1;
		if (currentCardIndex > 0) {
			animatedCardIndicesRef.current.add(currentCardIndex);
			startCardAnimation(currentCardIndex);
		}
	}, [selectedRange, costGroupBy, costAgentFilter, startCardAnimation]);

	const sidebar = (
		<Sidebar
			selectedTheme={selectedTheme}
			themeOptions={THEME_OPTIONS}
			onThemeChange={handleThemeChange}
			selectedRange={selectedRange}
			rangeOptions={rangeOptions}
			onRangeChange={handleRangeChange}
			selectedTimeZone={displayedTimeZone}
			timeZoneOptions={timeZoneOptions}
			onTimeZoneChange={handleTimeZoneChange}
			onHardRefresh={handleHardRefresh}
			hardRefreshDisabled={effectiveIsScanning || isUpdatingTimeZone}
			timeZoneDisabled={effectiveIsScanning || isUpdatingTimeZone}
			isScanning={effectiveIsScanning}
			themePalette={themePalette}
		/>
	);

	const handleImportFile = useCallback(
		(file: File) => {
			setIsImportingBackup(true);

			void (async () => {
				try {
					const csv = await file.text();
					const result = await rpc.request.importBackupCsv({ filename: file.name, csv });
					setImportResult(result);
					await Promise.all([refresh(), loadImportedBackups()]);
				} catch (error) {
					setImportResult({
						recognized: false,
						duplicate: false,
						backup: null,
						activeCoverageStartDateUtc: null,
						activeCoverageEndDateUtc: null,
						newDateCount: 0,
						overlappingDateCount: 0,
						skippedOverlappingDates: [],
						message: error instanceof Error ? error.message : "Import failed.",
					});
				} finally {
					setIsImportingBackup(false);
				}
			})();
		},
		[loadImportedBackups, refresh, rpc],
	);

	const handleExportBackup = useCallback(() => {
		setIsExportingBackup(true);

		void (async () => {
			try {
				const result = await rpc.request.exportBackupCsv({});
				const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
				const url = window.URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = result.filename;
				document.body.append(anchor);
				anchor.click();
				anchor.remove();
				window.setTimeout(() => {
					window.URL.revokeObjectURL(url);
				}, 0);
			} catch (error) {
				await rpc.send.log({
					level: "error",
					msg: error instanceof Error ? error.message : "Backup export failed.",
				});
			} finally {
				setIsExportingBackup(false);
			}
		})();
	}, [rpc]);

	const handleDeleteBackup = useCallback(
		(backupId: string) => {
			setDeletingBackupId(backupId);

			void (async () => {
				try {
					await rpc.request.deleteImportedBackup({ backupId });
					setImportResult(null);
					await Promise.all([refresh(), loadImportedBackups()]);
				} catch (error) {
					await rpc.send.log({
						level: "error",
						msg: error instanceof Error ? error.message : "Delete backup failed.",
					});
				} finally {
					setDeletingBackupId(null);
				}
			})();
		},
		[loadImportedBackups, refresh, rpc],
	);

	if (loading && !summary) {
		return (
			<>
				<div ref={scrollRef} className="wrapped-scroll">
					{sidebar}
					<DownloadableCard title="Building your coding story">
						<section data-card-index="1" className="wrapped-card wrapped-card-loading">
							<EmptyState title="Building your coding story" description="Loading annual summary and timeline." />
						</section>
					</DownloadableCard>
				</div>
			</>
		);
	}

	if (error && !summary) {
		return (
			<>
				<div ref={scrollRef} className="wrapped-scroll">
					{sidebar}
					<div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
						<section data-card-index="1" className="wrapped-card wrapped-card-loading wrapped-card-error">
							<div className="w-full">
								<p className="wrapped-kicker">Something Went Wrong</p>
								<h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-[#FAFAFA] sm:text-4xl">
									Unable to build wrapped view
								</h1>
								<p className="mt-3 break-words text-sm text-[#A1A1A1]">{error}</p>
								<div className="mt-5">
									<button type="button" onClick={() => void refresh()} className="export-btn">
										Retry
									</button>
								</div>
							</div>
						</section>
					</div>
				</div>
			</>
		);
	}

	const heroCopy = getHeroCopy(selectedRange, aggregationTimeZone);
	const animateCard1 = Boolean(animatingCardIndices[1]);

	return (
		<>
			<div ref={scrollRef} className="wrapped-scroll">
				{sidebar}
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-0 sm:px-6">
					<DownloadableCard title={heroCopy.title}>
						<section data-card-index="1" className="wrapped-card wrapped-card-hero">
							<header className="mb-6">
								<p className="wrapped-kicker" style={{ color: themePalette.medium }}>
									{heroCopy.kicker}
								</p>
								<h1 className="text-4xl font-semibold tracking-[-0.03em] text-[#FAFAFA] sm:text-6xl">
									{heroCopy.title}
								</h1>
							</header>

							<StatsCards
								totalSessions={totals.totalSessions}
								totalCostUsd={totals.totalCostUsd}
								totalTokens={totals.totalTokens}
								totalToolCalls={summary?.totals.toolCalls ?? 0}
								animateOnMount={animateCard1}
							/>
						</section>
					</DownloadableCard>

					<DashboardCharts
						dateFrom={dateFrom}
						dateTo={dateTo}
						modelBreakdown={modelBreakdown}
						timeline={timeline}
						dailyAgentTokensByDate={dailyAgentTokensByDate}
						dailyAgentCostsByDate={dailyAgentCostsByDate}
						dailyModelCostsByDate={dailyModelCostsByDate}
						dailyModelTokensByDate={dailyModelTokensByDate}
						totalTokenUsage={summary?.totals.tokens ?? null}
						currentStreakDays={totals.currentStreakDays}
						longestStreakDays={totals.longestStreakDays}
						topRepos={topRepos}
						totalCostUsd={totals.totalCostUsd}
						dailyAverageCostUsd={totals.dailyAverageCostUsd}
						mostExpensiveDay={totals.mostExpensiveDay}
						themePalette={themePalette}
						costAgentFilter={costAgentFilter}
						costGroupBy={costGroupBy}
						cardAnimations={animatingCardIndices}
						hourlyBreakdown={hourlyBreakdown}
						weekendTokenPercent={weekendTokenPercent}
						busiestDayOfWeek={busiestDayOfWeek}
						busiestSingleDay={busiestSingleDay}
						selectedRange={selectedRange}
					/>
				</div>
				<DashboardFooter
					importedBackups={importedBackups}
					importResult={importResult}
					isImporting={isImportingBackup}
					isExporting={isExportingBackup}
					deletingBackupId={deletingBackupId}
					onImportFile={handleImportFile}
					onExport={handleExportBackup}
					onDeleteBackup={handleDeleteBackup}
				/>
			</div>
		</>
	);
};

export default Dashboard;
