import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { SESSION_SOURCES, type SessionSource } from "@shared/schema";
import type { ImportBackupResult, ImportedBackupSummary } from "@shared/types";
import DashboardCharts from "./DashboardCharts";
import DashboardFooter from "./DashboardFooter";
import EmptyState from "./EmptyState";
import Sidebar from "./Sidebar";
import StatsCards, { AnimatedNumber } from "./StatsCards";
import DownloadableCard from "./DownloadableCard";
import { useDashboardData, type DashboardDateRange } from "../hooks/useDashboardData";
import { useRPC } from "../hooks/useRPC";
import { SOURCE_LABELS } from "../lib/constants";
import { THEME_OPTIONS, THEME_PALETTES, type ThemeName } from "../lib/themePalettes";
import { formatDate, formatDuration, formatNumber } from "../lib/formatters";

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, value));
const CARD_ANIMATION_MS = 2000;
const THEME_STORAGE_KEY = "codex-wrapped-theme";
type CostAgentFilter = "all" | SessionSource;
type CostGroupBy = "none" | "by-agent" | "by-model";

const isCostGroupBy = (value: string): value is CostGroupBy =>
  value === "none" || value === "by-agent" || value === "by-model";

const isCostAgentFilter = (value: string): value is CostAgentFilter =>
  value === "all" || SESSION_SOURCES.includes(value as SessionSource);
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
    agentBreakdown,
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
  const [costAgentFilter, setCostAgentFilter] = useState<CostAgentFilter>("all");
  const [costGroupBy, setCostGroupBy] = useState<CostGroupBy>("none");
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "purple";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored && isThemeName(stored) ? stored : "purple";
  });
  const [activeCardIndex, setActiveCardIndex] = useState<number>(1);
  const [animatingCardIndices, setAnimatingCardIndices] = useState<Record<number, boolean>>({});
  const [isUpdatingTimeZone, setIsUpdatingTimeZone] = useState(false);
  const [importedBackups, setImportedBackups] = useState<ImportedBackupSummary[]>([]);
  const [importResult, setImportResult] = useState<ImportBackupResult | null>(null);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);
  const activeCardRef = useRef<number>(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const animatedCardIndicesRef = useRef<Set<number>>(new Set());
  const animationTimeoutByCardRef = useRef<Record<number, number>>({});
  const prefersReducedMotionRef = useRef<boolean>(false);

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

  const costAgentOptions = useMemo<Array<{ value: CostAgentFilter; label: string }>>(
    () => [
      { value: "all", label: "All" },
      ...SESSION_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] })),
    ],
    [],
  );

  const costGroupOptions = useMemo<Array<{ value: CostGroupBy; label: string }>>(
    () => [
      { value: "none", label: "None" },
      { value: "by-agent", label: "By agent" },
      { value: "by-model", label: "By model" },
    ],
    [],
  );

  const handleCostAgentChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (!isCostAgentFilter(next)) return;
    setCostAgentFilter(next);
  };

  const handleCostGroupByChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (!isCostGroupBy(next)) return;
    setCostGroupBy(next);
    if (next === "by-model") {
      setCostAgentFilter("all");
    }
  };

  const handleThemeChange = (value: string) => {
    const next = value;
    if (!isThemeName(next)) return;
    setSelectedTheme(next);
  };

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

  const handleTimeZoneChange = useCallback((value: string) => {
    if (!value || value === aggregationTimeZone || isUpdatingTimeZone) return;

    setIsUpdatingTimeZone(true);

    void (async () => {
      try {
        await rpc.request.updateSettings({ aggregationTimeZone: value });
        await rpc.request.triggerScan({ fullScan: false });
        await Promise.all([refresh(), loadImportedBackups()]);
      } finally {
        setIsUpdatingTimeZone(false);
      }
    })();
  }, [aggregationTimeZone, isUpdatingTimeZone, loadImportedBackups, refresh, rpc]);
  const themePalette = THEME_PALETTES[selectedTheme];

  useEffect(() => {
    prefersReducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      for (const timeoutId of Object.values(animationTimeoutByCardRef.current)) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
  }, [selectedTheme]);

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
        setActiveCardIndex(next.index);
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
      selectedTimeZone={aggregationTimeZone}
      timeZoneOptions={timeZoneOptions}
      onTimeZoneChange={handleTimeZoneChange}
      timeZoneDisabled={isScanning || isUpdatingTimeZone}
      isScanning={isScanning}
    />
  );

  const handleImportFile = useCallback((file: File) => {
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
  }, [loadImportedBackups, refresh, rpc]);

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
        window.URL.revokeObjectURL(url);
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

  const handleDeleteBackup = useCallback((backupId: string) => {
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
  }, [loadImportedBackups, refresh, rpc]);

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

  const activeDayCoverage =
    totals.dateSpanDays > 0 ? clampPercentage((totals.activeDays / totals.dateSpanDays) * 100) : 0;
  const totalHours = totals.totalDurationMs / (60 * 60 * 1000);
  const totalDays = totals.totalDurationMs / (24 * 60 * 60 * 1000);
  const ringRadius = 58;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (activeDayCoverage / 100) * ringCircumference;
  const heroCopy = (() => {
    if (selectedRange === "last7") {
      return { kicker: "Your Last 7 Days In Code", title: "Your AI Coding Week" };
    }

    if (selectedRange === "last30") {
      return { kicker: "Your Last 30 Days In Code", title: "Your AI Coding Month" };
    }

    if (selectedRange === "last90") {
      return { kicker: "Your Last 90 Days In Code", title: "Your AI Coding Quarter" };
    }

    if (selectedRange === "last365") {
      return { kicker: "Your Last 365 Days In Code", title: "Your AI Coding Year" };
    }

    if (selectedRange.startsWith("year:")) {
      const year = Number(selectedRange.slice(5));
      if (Number.isInteger(year)) {
        const currentYear = new Date().getFullYear();
        if (year === currentYear) {
          return { kicker: "This Year In Code", title: "Your AI Coding Year" };
        }

        return { kicker: `${year} In Code`, title: `Your AI Coding ${year}` };
      }
    }

    return { kicker: "Your Time In Code", title: "Your AI Coding Story" };
  })();
  const animateCard1 = Boolean(animatingCardIndices[1]);
  const animateCard2 = Boolean(animatingCardIndices[2]);

  return (
    <>
      <div ref={scrollRef} className="wrapped-scroll">
        {sidebar}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-0 sm:px-6">
          <DownloadableCard title={heroCopy.title}>
            <section data-card-index="1" className="wrapped-card wrapped-card-hero">
              <header className="mb-6">
                <p className="wrapped-kicker" style={{ color: themePalette.medium }}>{heroCopy.kicker}</p>
                <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[#FAFAFA] sm:text-6xl">{heroCopy.title}</h1>
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

          <DownloadableCard title="Time Spent Coding with AI">
            <section data-card-index="2" className="wrapped-card wrapped-card-time">
              <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="wrapped-title">Time Spent Coding with AI</h2>
                </div>
              </header>

              <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="wrapped-tile">
                    <p className="wrapped-label">Total Hours</p>
                    <AnimatedNumber
                      value={totalHours}
                      animate={animateCard2}
                      durationMs={CARD_ANIMATION_MS}
                      format={(value) => `${value.toFixed(1)}h`}
                      className="mt-2 block text-4xl font-semibold text-[#FAFAFA]"
                    />
                    <p className="mt-2 text-xs text-[#A1A1A1]">{totalDays.toFixed(1)} total days of coding time</p>
                  </article>

                  <article className="wrapped-tile">
                    <p className="wrapped-label">Average Session</p>
                    <AnimatedNumber
                      value={totals.averageSessionDurationMs}
                      animate={animateCard2}
                      durationMs={CARD_ANIMATION_MS}
                      format={(value) => formatDuration(Math.max(0, Math.round(value)))}
                      className="mt-2 block text-3xl font-semibold text-[#FAFAFA]"
                    />
                    <p className="mt-2 text-xs text-[#A1A1A1]">Per session across the full range</p>
                  </article>

                  <article className="wrapped-tile sm:col-span-2">
                    <p className="wrapped-label">Longest Session Highlight</p>
                    <AnimatedNumber
                      value={totals.longestSessionEstimateMs}
                      animate={animateCard2}
                      durationMs={CARD_ANIMATION_MS}
                      format={(value) => formatDuration(Math.max(0, Math.round(value)))}
                      className="mt-2 block text-3xl font-semibold text-[#FAFAFA]"
                    />
                    <p className="mt-2 text-xs text-[#A1A1A1]">Estimated from daily totals and session counts</p>
                  </article>

                  <article className="wrapped-tile sm:col-span-2">
                    <p className="wrapped-label">Current Streak</p>
                    <p className="mt-2 text-3xl font-semibold text-[#FAFAFA]">
                      <AnimatedNumber
                        value={totals.currentStreakDays}
                        animate={animateCard2}
                        durationMs={CARD_ANIMATION_MS}
                        format={(value) => formatNumber(Math.max(0, Math.round(value)))}
                      />{" "}
                      {totals.currentStreakDays === 1 ? "day" : "days"}
                    </p>
                    <p className="mt-2 text-xs text-[#A1A1A1]">
                      {totals.currentStreakStartDate
                        ? `Started ${formatDate(totals.currentStreakStartDate)}`
                        : "No active streak in this range"}
                    </p>
                  </article>
                </div>

                <article className="wrapped-tile flex flex-col items-center justify-center text-center">
                  <svg width="152" height="152" viewBox="0 0 152 152" className="overflow-visible">
                    <circle
                      cx="76"
                      cy="76"
                      r={ringRadius}
                      fill="none"
                      stroke="rgba(148,163,184,0.25)"
                      strokeWidth="12"
                    />
                    <circle
                      cx="76"
                      cy="76"
                      r={ringRadius}
                      fill="none"
                      stroke="url(#ringGradient)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      style={{
                        transition: "stroke-dashoffset 1000ms cubic-bezier(0.22, 1, 0.36, 1)",
                        transformOrigin: "50% 50%",
                        transform: "rotate(-90deg)",
                      }}
                    />
                    <defs>
                      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={themePalette.veryHigh} />
                        <stop offset="100%" stopColor={themePalette.high} />
                      </linearGradient>
                    </defs>
                  </svg>

                  <AnimatedNumber
                    value={activeDayCoverage}
                    animate={animateCard2}
                    durationMs={CARD_ANIMATION_MS}
                    format={(value) => `${value.toFixed(1)}%`}
                    className="mt-4 block text-4xl font-semibold text-[#FAFAFA]"
                  />
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#A1A1A1]">Days with activity</p>
                </article>
              </div>
            </section>
          </DownloadableCard>

          <DashboardCharts
            dateFrom={dateFrom}
            dateTo={dateTo}
            modelBreakdown={modelBreakdown}
            agentBreakdown={agentBreakdown}
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
