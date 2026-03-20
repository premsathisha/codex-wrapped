import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { SESSION_SOURCES, type SessionSource, type TokenUsage } from "@shared/schema";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { AnimatedNumber } from "./StatsCards";
import DownloadableCard from "./DownloadableCard";
import { formatDate, formatDuration, formatNumber, formatTokens, formatUsd } from "../lib/formatters";
import { getHeatmapColor } from "../lib/heatmapColors";
import { formatHourLabel, hasHourlyActivity } from "../lib/hourly";
import { HEATMAP_GAP_PX, computeHeatmapCellSizePx } from "../lib/heatmap";
import { SOURCE_LABELS } from "../lib/constants";
import type { ThemePalette } from "../lib/themePalettes";
import type {
  AgentBreakdown,
  BusiestSingleDay,
  DailyAgentCostsByDate,
  DailyModelCostsByDate,
  DailyModelTokensByDate,
  DailyAgentTokensByDate,
  HourlyDataPoint,
  ModelBreakdown,
  TimelinePoint,
} from "../hooks/useDashboardData";

type CostSourceFilter = "all" | SessionSource;
type CostGroupBy = "none" | "by-agent" | "by-model";

interface DashboardChartsProps {
  dateFrom: string;
  dateTo: string;
  modelBreakdown: ModelBreakdown[];
  agentBreakdown: AgentBreakdown[];
  timeline: TimelinePoint[];
  dailyAgentTokensByDate: DailyAgentTokensByDate;
  dailyAgentCostsByDate: DailyAgentCostsByDate;
  dailyModelCostsByDate: DailyModelCostsByDate;
  dailyModelTokensByDate: DailyModelTokensByDate;
  totalTokenUsage: TokenUsage | null;
  currentStreakDays: number;
  longestStreakDays: number;
  themePalette: ThemePalette;
  topRepos: TopRepoRow[];
  totalCostUsd: number;
  dailyAverageCostUsd: number;
  mostExpensiveDay: TimelinePoint | null;
  costAgentFilter: CostSourceFilter;
  costGroupBy: CostGroupBy;
  cardAnimations: Record<number, boolean>;
  hourlyBreakdown: HourlyDataPoint[];
  weekendSessionPercent: number;
  busiestDayOfWeek: string;
  busiestSingleDay: BusiestSingleDay | null;
}

interface HeatmapCell {
  date: string;
  sessions: number;
  tokens: number;
  costUsd: number;
  intensity: number;
}

interface HeatmapHoverState {
  cell: HeatmapCell;
  leftPx: number;
  topPx: number;
}

interface HeatmapMonthLabel {
  label: string;
  weekIndex: number;
}

interface HeatmapAgentTokenRow {
  label: string;
  tokens: number;
  color: string;
}

type HeatmapWeek = Array<HeatmapCell | null>;
type CostSeriesPoint = { date: string } & Record<string, string | number>;
type AgentChartSource = SessionSource | "other";

interface AgentChartRow {
  source: AgentChartSource;
  label: string;
  sessions: number;
  tokens: number;
  costUsd: number;
  color: string;
  percentage: number;
  icon: ReactNode;
}

interface AgentTooltipPayloadItem {
  payload?: AgentChartRow;
}

interface AgentPieTooltipProps {
  active?: boolean;
  payload?: AgentTooltipPayloadItem[];
}

interface TopRepoRow {
  repo: string;
  sessions: number;
  tokens: number;
  costUsd: number;
  durationMs: number;
}

interface ChartPlotOffset {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CodingPersonality {
  label: string;
  emoji: string;
  description: string;
}

const classifyCodingPersonality = (peakHour: number): CodingPersonality => {
  if (peakHour >= 22 || peakHour <= 3) {
    return { label: "Night Owl", emoji: "\uD83E\uDD89", description: "You do your best work when the world sleeps." };
  }
  if (peakHour <= 8) {
    return { label: "Early Bird", emoji: "\uD83C\uDF05", description: "You catch bugs before others catch coffee." };
  }
  if (peakHour <= 11) {
    return { label: "Morning Grinder", emoji: "\u2600\uFE0F", description: "Peak productivity in the morning hours." };
  }
  if (peakHour <= 17) {
    return { label: "Afternoon Warrior", emoji: "\u2615", description: "Post-lunch is when your focus peaks." };
  }
  if (peakHour <= 21) {
    return { label: "Evening Hacker", emoji: "\uD83C\uDF19", description: "Sunset coding sessions are your thing." };
  }
  return { label: "Night Owl", emoji: "\uD83E\uDD89", description: "You do your best work when the world sleeps." };
};

const AgentIconSvg = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="inline-block align-[-0.125em]">
    <path fill="currentColor" d={d} />
  </svg>
);

const AGENT_ICONS: Record<string, ReactNode> = {
  codex: <AgentIconSvg d="M20.562 10.188c.25-.688.313-1.376.25-2.063c-.062-.687-.312-1.375-.625-2c-.562-.937-1.375-1.687-2.312-2.125c-1-.437-2.063-.562-3.125-.312c-.5-.5-1.063-.938-1.688-1.25S11.687 2 11 2a5.17 5.17 0 0 0-3 .938c-.875.624-1.5 1.5-1.813 2.5c-.75.187-1.375.5-2 .875c-.562.437-1 1-1.375 1.562c-.562.938-.75 2-.625 3.063a5.44 5.44 0 0 0 1.25 2.874a4.7 4.7 0 0 0-.25 2.063c.063.688.313 1.375.625 2c.563.938 1.375 1.688 2.313 2.125c1 .438 2.062.563 3.125.313c.5.5 1.062.937 1.687 1.25S12.312 22 13 22a5.17 5.17 0 0 0 3-.937c.875-.625 1.5-1.5 1.812-2.5a4.54 4.54 0 0 0 1.938-.875c.562-.438 1.062-.938 1.375-1.563c.562-.937.75-2 .625-3.062c-.125-1.063-.5-2.063-1.188-2.876m-7.5 10.5c-1 0-1.75-.313-2.437-.875c0 0 .062-.063.125-.063l4-2.312a.5.5 0 0 0 .25-.25a.57.57 0 0 0 .062-.313V11.25l1.688 1v4.625a3.685 3.685 0 0 1-3.688 3.813M5 17.25c-.438-.75-.625-1.625-.438-2.5c0 0 .063.063.125.063l4 2.312a.56.56 0 0 0 .313.063c.125 0 .25 0 .312-.063l4.875-2.812v1.937l-4.062 2.375A3.7 3.7 0 0 1 7.312 19c-1-.25-1.812-.875-2.312-1.75M3.937 8.563a3.8 3.8 0 0 1 1.938-1.626v4.751c0 .124 0 .25.062.312a.5.5 0 0 0 .25.25l4.875 2.813l-1.687 1l-4-2.313a3.7 3.7 0 0 1-1.75-2.25c-.25-.937-.188-2.062.312-2.937M17.75 11.75l-4.875-2.812l1.687-1l4 2.312c.625.375 1.125.875 1.438 1.5s.5 1.313.437 2.063a3.7 3.7 0 0 1-.75 1.937c-.437.563-1 1-1.687 1.25v-4.75c0-.125 0-.25-.063-.312c0 0-.062-.126-.187-.188m1.687-2.5s-.062-.062-.125-.062l-4-2.313c-.125-.062-.187-.062-.312-.062s-.25 0-.313.062L9.812 9.688V7.75l4.063-2.375c.625-.375 1.312-.5 2.062-.5c.688 0 1.375.25 2 .688c.563.437 1.063 1 1.313 1.625s.312 1.375.187 2.062m-10.5 3.5l-1.687-1V7.063c0-.688.187-1.438.562-2C8.187 4.438 8.75 4 9.375 3.688a3.37 3.37 0 0 1 2.062-.313c.688.063 1.375.375 1.938.813c0 0-.063.062-.125.062l-4 2.313a.5.5 0 0 0-.25.25c-.063.125-.063.187-.063.312zm.875-2L12 9.5l2.187 1.25v2.5L12 14.5l-2.188-1.25z" />,
};

const formatShortDate = (value: string): string => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(parsed));
};

const buildHeatmap = (timeline: TimelinePoint[], dateFrom: string, dateTo: string): HeatmapCell[] => {
  const byDate = new Map<string, TimelinePoint>();
  for (const point of timeline) byDate.set(point.date, point);

  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const maxTokens = timeline.reduce((max, point) => Math.max(max, point.tokens), 0);
  const cells: HeatmapCell[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const point = byDate.get(iso);
    const tokens = point?.tokens ?? 0;
    cells.push({
      date: iso,
      sessions: point?.sessions ?? 0,
      tokens,
      costUsd: point?.costUsd ?? 0,
      intensity: maxTokens > 0 ? tokens / maxTokens : 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return cells;
};

const buildHeatmapWeeks = (cells: HeatmapCell[]): HeatmapWeek[] => {
  const weeks: HeatmapWeek[] = [];

  for (const cell of cells) {
    const parsed = Date.parse(`${cell.date}T00:00:00Z`);
    if (Number.isNaN(parsed)) continue;
    const dayIndex = new Date(parsed).getUTCDay();

    if (weeks.length === 0 || dayIndex === 0) {
      weeks.push(Array<HeatmapCell | null>(7).fill(null));
    }

    weeks[weeks.length - 1][dayIndex] = cell;
  }

  return weeks;
};

const chartWrapperClass = "h-56 w-full sm:h-64";
const chartRevealClass = "wrapped-chart-reveal";
const CHART_ANIMATION_MS = 2000;
const COST_LINE_FALLBACK_TOP_PX = 8;
const COST_LINE_FALLBACK_BOTTOM_PX = 34;
const HEATMAP_TOOLTIP_HALF_WIDTH_PX = 112;
const HEATMAP_LEFT_GUTTER_PX = 36;
const HEATMAP_MONTH_ROW_HEIGHT_PX = 18;
const HEATMAP_WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;
const HEATMAP_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

const formatUsdTooltip = (value: number | string | undefined) =>
  formatUsd(typeof value === "number" ? value : Number(value ?? 0));

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const AgentPieTooltip = ({ active, payload }: AgentPieTooltipProps) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const averageTokensPerSession = row.sessions > 0 ? row.tokens / row.sessions : 0;

  return (
    <div className="rounded-xl border border-slate-400/45 bg-black px-3 py-2 shadow-2xl">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <span className="text-base leading-none" style={{ color: row.color }}>
          {row.icon}
        </span>
        <span>{row.label}</span>
      </p>
      <p className="mt-1 text-xs text-slate-200">Tokens: {formatTokens(row.tokens)} ({formatNumber(row.tokens)})</p>
      <p className="text-xs text-slate-300">
        Sessions: {formatNumber(row.sessions)} · Token share: {row.percentage.toFixed(1)}%
      </p>
      <p className="text-xs text-slate-300">Spend: {formatUsd(row.costUsd)}</p>
      <p className="text-xs text-slate-400">Avg/session: {formatTokens(averageTokensPerSession)}</p>
    </div>
  );
};

const HourlyBarTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload?: HourlyDataPoint }> }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="rounded-xl border border-slate-400/45 bg-black px-3 py-2 shadow-2xl">
      <p className="text-sm font-semibold text-slate-100">{row.label}</p>
      <p className="mt-1 text-xs text-slate-200">Tokens: {formatTokens(row.tokens)} ({formatNumber(row.tokens)})</p>
      <p className="text-xs text-slate-300">Cost: {formatUsd(row.costUsd)}</p>
      <p className="text-xs text-slate-300">Sessions: {formatNumber(row.sessions)}</p>
      {row.byAgent.length > 0 && (
        <div className="mt-1.5 border-t border-slate-700/60 pt-1.5">
          {row.byAgent.map((a) => (
            <p key={a.source} className="flex items-center justify-between gap-3 text-xs text-slate-300">
              <span className="text-slate-300">{a.label}</span>
              <span className="text-slate-400">{formatTokens(a.tokens)} · {formatUsd(a.costUsd)} · {formatNumber(a.sessions)}s</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const rangeLengthDays = (dateFrom: string, dateTo: string): number => {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / ONE_DAY_MS) + 1;
};

const buildActivityTooltip = (cell: HeatmapCell, dailyAgentTokensByDate: DailyAgentTokensByDate): string => {
  const agentTotals = dailyAgentTokensByDate[cell.date];

  const lines = SESSION_SOURCES
    .map((source) => ({
      source,
      tokens: agentTotals?.[source] ?? 0,
    }))
    .filter((entry) => entry.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens)
    .map(
      (entry) =>
        `- ${SOURCE_LABELS[entry.source as SessionSource]} - ${formatTokens(entry.tokens)}`,
    );

  if (lines.length === 0) {
    lines.push(`- All agents - ${formatTokens(cell.tokens)}`);
  }

  return `${formatDate(cell.date)}\n${lines.join("\n")}`;
};

const buildHeatmapAgentTokenRows = (
  cell: HeatmapCell,
  dailyAgentTokensByDate: DailyAgentTokensByDate,
  sourceColorMap: Record<SessionSource, string>,
): HeatmapAgentTokenRow[] => {
  const agentTotals = dailyAgentTokensByDate[cell.date];

  const rows = SESSION_SOURCES
    .map((source) => ({
      label: SOURCE_LABELS[source],
      tokens: agentTotals?.[source] ?? 0,
      color: sourceColorMap[source] ?? "#94a3b8",
    }))
    .filter((entry) => entry.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens);

  if (rows.length > 0) return rows;

  return [
    {
      label: "All agents",
      tokens: cell.tokens,
      color: "#94a3b8",
    },
  ];
};

const buildHeatmapMonthLabels = (weeks: HeatmapWeek[]): HeatmapMonthLabel[] => {
  const labels: HeatmapMonthLabel[] = [];
  let previousMonth: number | null = null;
  let previousLabelWeekIndex = -100;

  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
    const week = weeks[weekIndex];
    const firstCell = week.find((cell): cell is HeatmapCell => cell !== null);
    if (!firstCell) continue;

    const parsed = Date.parse(`${firstCell.date}T00:00:00Z`);
    if (Number.isNaN(parsed)) continue;
    const monthDate = new Date(parsed);
    const month = monthDate.getUTCMonth();

    if (month === previousMonth) continue;
    previousMonth = month;

    if (weekIndex - previousLabelWeekIndex < 2) continue;
    previousLabelWeekIndex = weekIndex;
    labels.push({
      label: HEATMAP_MONTH_FORMATTER.format(monthDate),
      weekIndex,
    });
  }

  return labels;
};

const buildRepoHoverDetails = (repo: TopRepoRow): string =>
  [
    repo.repo,
    `Sessions: ${formatNumber(repo.sessions)}`,
    `Tokens: ${formatTokens(repo.tokens)} (${formatNumber(repo.tokens)})`,
    `Spend: ${formatUsd(repo.costUsd)}`,
    `Time active: ${formatDuration(repo.durationMs)}`,
  ].join("\n");

const renderTopReposTooltip = ({ active, payload, label }: TooltipContentProps<number, string>) => {
  const row = payload?.[0]?.payload as TopRepoRow | undefined;
  if (!active || !row) return null;

  return (
    <div className="rounded-xl border border-white/20 bg-black px-3 py-2 text-xs text-slate-100 shadow-xl">
      <p className="mb-1 text-sm font-semibold text-white">{typeof label === "string" ? label : "Repository"}</p>
      <p>Sessions: {formatNumber(row.sessions)}</p>
      <p>Tokens: {formatTokens(row.tokens)} ({formatNumber(row.tokens)})</p>
      <p>Spend: {formatUsd(row.costUsd)}</p>
      <p>Time active: {formatDuration(row.durationMs)}</p>
    </div>
  );
};

const DashboardCharts = ({
  dateFrom,
  dateTo,
  modelBreakdown,
  agentBreakdown,
  timeline,
  dailyAgentTokensByDate,
  dailyAgentCostsByDate,
  dailyModelCostsByDate,
  dailyModelTokensByDate,
  totalTokenUsage,
  currentStreakDays,
  longestStreakDays,
  themePalette,
  topRepos,
  totalCostUsd,
  dailyAverageCostUsd,
  mostExpensiveDay,
  costAgentFilter,
  costGroupBy,
  cardAnimations,
  hourlyBreakdown,
  weekendSessionPercent,
  busiestDayOfWeek,
  busiestSingleDay,
}: DashboardChartsProps) => {
  const animateCard3 = Boolean(cardAnimations[3]);
  const animateCard4 = Boolean(cardAnimations[4]);
  const animateCard5 = Boolean(cardAnimations[5]);
  const animateCard6 = Boolean(cardAnimations[6]);
  const animateCard7 = Boolean(cardAnimations[7]);
  const animateCard8 = Boolean(cardAnimations[8]);
  const modelColors = [
    themePalette.veryHigh,
    themePalette.high,
    themePalette.medium,
    themePalette.slightlyLess,
    themePalette.less,
    themePalette.slightlyLess,
    themePalette.medium,
    themePalette.high,
  ];
  const topRepoBarColors = [
    themePalette.veryHigh,
    themePalette.high,
    themePalette.medium,
    themePalette.slightlyLess,
    themePalette.less,
    themePalette.none,
  ];
  const sourceColorMap: Record<SessionSource, string> = {
    codex: themePalette.high,
  };
  const hasHourlyData = hasHourlyActivity(hourlyBreakdown);
  const heatmapViewportRef = useRef<HTMLDivElement | null>(null);
  const heatmapTooltipHostRef = useRef<HTMLDivElement | null>(null);
  const costChartHoverRef = useRef<HTMLDivElement | null>(null);
  const costHoverTargetXRef = useRef<number | null>(null);
  const costHoverAnimFrameRef = useRef<number | null>(null);
  const [heatmapTargetWidthPx, setHeatmapTargetWidthPx] = useState<number | undefined>(undefined);
  const [heatmapHoverState, setHeatmapHoverState] = useState<HeatmapHoverState | null>(null);
  const [costHoverLineX, setCostHoverLineX] = useState<number | null>(null);
  const [costPlotOffset, setCostPlotOffset] = useState<ChartPlotOffset | null>(null);

  useEffect(() => {
    const viewport = heatmapViewportRef.current;
    if (!viewport) return;

    const updateWidth = (nextWidth: number) => {
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
      const rounded = Math.floor(nextWidth);
      setHeatmapTargetWidthPx((current) => (current === rounded ? current : rounded));
    };

    updateWidth(viewport.clientWidth);

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateWidth(entry.contentRect.width);
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = heatmapViewportRef.current;
    if (!viewport) return;

    const syncToLatestWeek = () => {
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = maxScrollLeft;
    };

    const frameId = window.requestAnimationFrame(syncToLatestWeek);
    return () => window.cancelAnimationFrame(frameId);
  }, [dateFrom, dateTo, heatmapTargetWidthPx, timeline.length]);

  const clearHeatmapHover = useCallback(() => {
    setHeatmapHoverState((current) => (current === null ? current : null));
  }, []);

  const updateHeatmapHover = useCallback((event: MouseEvent<HTMLDivElement>, cell: HeatmapCell) => {
    const tooltipHost = heatmapTooltipHostRef.current;
    if (!tooltipHost) return;
    const hostRect = tooltipHost.getBoundingClientRect();
    const cellRect = event.currentTarget.getBoundingClientRect();

    setHeatmapHoverState({
      cell,
      leftPx: cellRect.left - hostRect.left + cellRect.width / 2,
      topPx: cellRect.top - hostRect.top,
    });
  }, []);

  const clearCostHoverLine = useCallback(() => {
    costHoverTargetXRef.current = null;
    if (costHoverAnimFrameRef.current !== null) {
      window.cancelAnimationFrame(costHoverAnimFrameRef.current);
      costHoverAnimFrameRef.current = null;
    }
    setCostHoverLineX((current) => (current === null ? current : null));
  }, []);

  const updateCostHoverLine = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const hoverHost = costChartHoverRef.current;
    if (!hoverHost) return;
    const rect = hoverHost.getBoundingClientRect();
    const nextX = event.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rect.width, nextX));
    costHoverTargetXRef.current = clampedX;

    const svg = hoverHost.querySelector("svg");
    const clipRect = hoverHost.querySelector("svg clipPath rect");
    if (svg instanceof SVGSVGElement && clipRect instanceof SVGRectElement) {
      const svgRect = svg.getBoundingClientRect();
      const x = Number(clipRect.getAttribute("x"));
      const y = Number(clipRect.getAttribute("y"));
      const width = Number(clipRect.getAttribute("width"));
      const height = Number(clipRect.getAttribute("height"));
      if ([x, y, width, height].every((value) => Number.isFinite(value))) {
        setCostPlotOffset((current) => {
          const next = {
            left: svgRect.left - rect.left + x,
            top: svgRect.top - rect.top + y,
            width,
            height,
          };
          if (
            current &&
            current.left === next.left &&
            current.top === next.top &&
            current.width === next.width &&
            current.height === next.height
          ) {
            return current;
          }
          return next;
        });
      }
    }

    if (costHoverAnimFrameRef.current !== null) {
      return;
    }

    const tick = () => {
      const target = costHoverTargetXRef.current;
      if (target === null) {
        costHoverAnimFrameRef.current = null;
        return;
      }

      setCostHoverLineX((current) => {
        if (current === null) return target;
        const next = current + (target - current) * 0.22;
        if (Math.abs(target - next) < 0.1) {
          return target;
        }
        return next;
      });

      costHoverAnimFrameRef.current = window.requestAnimationFrame(tick);
    };

    costHoverAnimFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (costHoverAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(costHoverAnimFrameRef.current);
      }
    },
    [],
  );
  const visibleModelBreakdown = modelBreakdown.filter((row) => row.model !== "<synthetic>");
  const totalModelTokens = visibleModelBreakdown.reduce((sum, row) => sum + row.tokens, 0);
  const modelRows = visibleModelBreakdown.map((row, index) => ({
    ...row,
    color: modelColors[index % modelColors.length],
    percentage: totalModelTokens > 0 ? (row.tokens / totalModelTokens) * 100 : 0,
  }));
  const chartModelRows = modelRows.slice(0, 8);

  const totalAgentTokens = agentBreakdown.reduce((sum, row) => sum + row.tokens, 0);
  const agentRows: AgentChartRow[] = (() => {
    const mapped = agentBreakdown.map((row) => ({
      source: row.source,
      label: row.label,
      sessions: row.sessions,
      tokens: row.tokens,
      costUsd: row.costUsd,
      color: sourceColorMap[row.source] ?? themePalette.medium,
      percentage: totalAgentTokens > 0 ? (row.tokens / totalAgentTokens) * 100 : 0,
      icon: AGENT_ICONS[row.source] ?? ("🤝" as ReactNode),
    }));
    const major = mapped.filter((r) => r.percentage >= 1);
    const minor = mapped.filter((r) => r.percentage < 1 && r.percentage > 0);
    if (minor.length === 0) return major;
    const otherTokens = minor.reduce((s, r) => s + r.tokens, 0);
    const otherSessions = minor.reduce((s, r) => s + r.sessions, 0);
    const otherCost = minor.reduce((s, r) => s + r.costUsd, 0);
    return [
      ...major,
      {
        source: "other",
        label: "Others",
        sessions: otherSessions,
        tokens: otherTokens,
        costUsd: otherCost,
        color: "#94a3b8",
        percentage: totalAgentTokens > 0 ? (otherTokens / totalAgentTokens) * 100 : 0,
        icon: "🤝" as ReactNode,
      },
    ];
  })();

  const heatmap = buildHeatmap(timeline, dateFrom, dateTo);
  const heatmapWeeks = buildHeatmapWeeks(heatmap);
  const heatmapGridTargetWidthPx =
    typeof heatmapTargetWidthPx === "number"
      ? Math.max(HEATMAP_GAP_PX, heatmapTargetWidthPx - HEATMAP_LEFT_GUTTER_PX)
      : undefined;
  const heatmapCellSizePx = computeHeatmapCellSizePx(heatmapWeeks.length, heatmapGridTargetWidthPx, HEATMAP_GAP_PX);
  const heatmapGridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${Math.max(heatmapWeeks.length, 1)}, ${heatmapCellSizePx}px)`,
  };
  const heatmapMonthLabels = useMemo(() => buildHeatmapMonthLabels(heatmapWeeks), [heatmapWeeks]);
  const heatmapGridWidthPx =
    Math.max(heatmapWeeks.length, 1) * heatmapCellSizePx + Math.max(0, heatmapWeeks.length - 1) * HEATMAP_GAP_PX;
  const heatmapTooltipHostWidthPx = heatmapTooltipHostRef.current?.clientWidth ?? 0;
  const heatmapTooltipLeftPx =
    heatmapHoverState === null
      ? 0
      : Math.max(
          HEATMAP_TOOLTIP_HALF_WIDTH_PX,
          Math.min(
            heatmapHoverState.leftPx,
            Math.max(HEATMAP_TOOLTIP_HALF_WIDTH_PX, heatmapTooltipHostWidthPx - HEATMAP_TOOLTIP_HALF_WIDTH_PX),
          ),
        );
  const heatmapTooltipTopPx = heatmapHoverState === null ? 0 : Math.max(12, heatmapHoverState.topPx - 8);
  const heatmapTooltipAgentRows =
    heatmapHoverState === null ? [] : buildHeatmapAgentTokenRows(heatmapHoverState.cell, dailyAgentTokensByDate, sourceColorMap);
  const dateSpanDays = rangeLengthDays(dateFrom, dateTo);
  const inputTokens = totalTokenUsage?.inputTokens ?? 0;
  const outputTokens = totalTokenUsage?.outputTokens ?? 0;
  const totalTokens =
    (totalTokenUsage?.inputTokens ?? 0) +
    (totalTokenUsage?.outputTokens ?? 0) +
    (totalTokenUsage?.cacheReadTokens ?? 0) +
    (totalTokenUsage?.cacheWriteTokens ?? 0) +
    (totalTokenUsage?.reasoningTokens ?? 0);
  const mostUsedModel = visibleModelBreakdown[0] ?? null;
  const recentModelUsage = useMemo(() => {
    const end = Date.parse(`${dateTo}T00:00:00Z`);
    if (Number.isNaN(end)) return null;
    const start = end - 29 * ONE_DAY_MS;
    const byModel = new Map<string, number>();

    for (const [date, modelTokenMap] of Object.entries(dailyModelTokensByDate)) {
      const parsed = Date.parse(`${date}T00:00:00Z`);
      if (Number.isNaN(parsed) || parsed < start || parsed > end) continue;
      for (const [model, tokens] of Object.entries(modelTokenMap)) {
        byModel.set(model, (byModel.get(model) ?? 0) + tokens);
      }
    }

    if (byModel.size === 0) return null;
    const sorted = [...byModel.entries()].sort((a, b) => b[1] - a[1]);
    return { model: sorted[0]?.[0] ?? "-", tokens: sorted[0]?.[1] ?? 0 };
  }, [dailyModelTokensByDate, dateTo]);

  const costTimeline = useMemo<TimelinePoint[]>(() => {
    if (costAgentFilter === "all") return timeline;

    return timeline.map((point) => ({
      ...point,
      costUsd: dailyAgentCostsByDate[point.date]?.[costAgentFilter] ?? 0,
    }));
  }, [costAgentFilter, dailyAgentCostsByDate, timeline]);

  const selectedTotalCostUsd =
    costAgentFilter === "all"
      ? totalCostUsd
      : costTimeline.reduce((sum, point) => sum + point.costUsd, 0);

  const selectedDailyAverageCostUsd =
    costAgentFilter === "all"
      ? dailyAverageCostUsd
      : dateSpanDays > 0
        ? selectedTotalCostUsd / dateSpanDays
        : 0;

  const selectedMostExpensiveDay =
    costAgentFilter === "all"
      ? mostExpensiveDay
      : (() => {
          const daysWithSpend = costTimeline.filter((point) => point.costUsd > 0);
          if (daysWithSpend.length === 0) return null;
          return daysWithSpend.reduce((max, point) => (point.costUsd > max.costUsd ? point : max), daysWithSpend[0]);
        })();

  const groupedAgentSeries = useMemo<Array<{ key: string; label: string; color: string }>>(
    () => {
      const sources = costAgentFilter === "all" ? SESSION_SOURCES : [costAgentFilter];
      return sources.map((source) => ({
        key: source,
        label: SOURCE_LABELS[source],
        color: sourceColorMap[source] ?? themePalette.medium,
      }));
    },
    [costAgentFilter, sourceColorMap, themePalette.medium],
  );

  const groupedAgentTimeline = useMemo<CostSeriesPoint[]>(
    () =>
      timeline.map((point) => {
        const row: CostSeriesPoint = { date: point.date };
        const bySource = dailyAgentCostsByDate[point.date] ?? {};
        const sources = costAgentFilter === "all" ? SESSION_SOURCES : [costAgentFilter];

        for (const source of sources) {
          row[source] = bySource[source] ?? 0;
        }

        return row;
      }),
    [costAgentFilter, dailyAgentCostsByDate, timeline],
  );

  const groupedModelSeries = useMemo<Array<{ key: string; label: string; color: string }>>(() => {
    const sorted = [...modelBreakdown].sort((left, right) => right.costUsd - left.costUsd);
    const topSeries = sorted.slice(0, 6).map((row, index) => ({
      key: row.model,
      label: row.model,
      color: modelColors[index % modelColors.length],
    }));

    if (sorted.length <= 6) return topSeries;

    return [
      ...topSeries,
      {
        key: "Others",
        label: "Others",
        color: "#94a3b8",
      },
    ];
  }, [modelBreakdown, modelColors]);

  const groupedModelTimeline = useMemo<CostSeriesPoint[]>(
    () =>
      timeline.map((point) => {
        const row: CostSeriesPoint = { date: point.date };
        const byModel = dailyModelCostsByDate[point.date] ?? {};
        let topModelCostTotal = 0;

        for (const series of groupedModelSeries) {
          if (series.key === "Others") continue;
          const costValue = byModel[series.key] ?? 0;
          row[series.key] = costValue;
          topModelCostTotal += costValue;
        }

        if (groupedModelSeries.some((series) => series.key === "Others")) {
          row.Others = Math.max(0, point.costUsd - topModelCostTotal);
        }

        return row;
      }),
    [dailyModelCostsByDate, groupedModelSeries, timeline],
  );

  const effectiveCostGroupBy =
    costGroupBy === "by-model" && groupedModelSeries.length === 0 ? "none" : costGroupBy;
  const groupedCostSeries = effectiveCostGroupBy === "by-agent" ? groupedAgentSeries : groupedModelSeries;
  const groupedCostTimeline = effectiveCostGroupBy === "by-agent" ? groupedAgentTimeline : groupedModelTimeline;

  return (
    <>
      <DownloadableCard title="Your Top Models">
        <section data-card-index="3" className="wrapped-card wrapped-card-models">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="wrapped-title">Your Top Models</h2>
            </div>
          </header>

          {modelRows.length === 0 ? (
            <p className="text-sm text-slate-300">No model activity found in this range.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className={`${chartWrapperClass} ${animateCard3 ? chartRevealClass : ""} self-center lg:-translate-x-[43px]`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartModelRows} layout="vertical" margin={{ left: 18, right: 16 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="2 5" />
                    <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      dataKey="model"
                      type="category"
                      tick={{ fill: "#e2e8f0", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={188}
                    />
                    <Bar
                      dataKey="tokens"
                      name="Tokens"
                      radius={[0, 10, 10, 0]}
                      isAnimationActive={animateCard3}
                      animationDuration={CHART_ANIMATION_MS}
                      animationBegin={0}
                      animationEasing="ease-in-out"
                    >
                      {chartModelRows.map((row) => (
                        <Cell key={row.model} fill={row.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {modelRows.map((row) => (
                  <article
                    key={row.model}
                    className="wrapped-tile"
                    title={`${row.model}: ${formatNumber(row.tokens)} tokens (${row.percentage.toFixed(1)}%)`}
                  >
                    <div className="flex items-center justify-between text-sm text-slate-200">
                      <span className="truncate pr-3">{row.model}</span>
                      <span>{row.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-700/45">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${row.percentage}%`, backgroundColor: row.color }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-300">{formatTokens(row.tokens)} ({formatNumber(row.tokens)})</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </DownloadableCard>

      <DownloadableCard title="Codex">
        <section data-card-index="5" className="wrapped-card wrapped-card-activity">
          <div className={`rounded-3xl border border-white/10 bg-black px-5 py-5 sm:px-8 sm:py-7 ${animateCard5 ? chartRevealClass : ""}`}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <h2 className="text-[1.9rem] font-semibold tracking-tight text-white">Codex</h2>
              <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-3 sm:gap-10">
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Input Tokens</p>
                  <p className="text-2xl font-semibold text-white">{formatTokens(inputTokens)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Output Tokens</p>
                  <p className="text-2xl font-semibold text-white">{formatTokens(outputTokens)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total Tokens</p>
                  <p className="text-2xl font-semibold text-white">{formatTokens(totalTokens)}</p>
                </div>
              </div>
            </div>

            {heatmap.length === 0 ? (
              <p className="text-sm text-slate-300">No activity timeline available.</p>
            ) : (
              <>
                <div ref={heatmapTooltipHostRef} className="relative">
                  <div
                    ref={heatmapViewportRef}
                    className="overflow-x-auto pb-1"
                    data-export-scroll-anchor="end"
                    onMouseLeave={clearHeatmapHover}
                  >
                    <div className="inline-grid grid-cols-[auto_auto] gap-x-2 gap-y-2">
                      <div style={{ width: HEATMAP_LEFT_GUTTER_PX }} />
                      <div className="relative" style={{ width: heatmapGridWidthPx, height: HEATMAP_MONTH_ROW_HEIGHT_PX }}>
                        {heatmapMonthLabels.map((month) => (
                          <span
                            key={`month-${month.weekIndex}-${month.label}`}
                            className="absolute top-0 text-[11px] leading-none text-slate-400"
                            style={{ left: month.weekIndex * (heatmapCellSizePx + HEATMAP_GAP_PX) }}
                          >
                            {month.label}
                          </span>
                        ))}
                      </div>

                      <div
                        className="grid grid-rows-7 gap-1 pr-1 text-[11px] leading-none text-slate-400"
                        style={{ width: HEATMAP_LEFT_GUTTER_PX }}
                      >
                        {HEATMAP_WEEKDAY_LABELS.map((label, dayIndex) => (
                          <div key={`day-label-${dayIndex}`} className="flex items-center justify-end" style={{ height: heatmapCellSizePx }}>
                            {label}
                          </div>
                        ))}
                      </div>

                      <div className="inline-grid gap-1" style={heatmapGridStyle}>
                        {heatmapWeeks.map((week, weekIndex) => (
                          <div key={`week-${weekIndex}`} className="grid grid-rows-7 gap-1">
                            {week.map((cell, dayIndex) => {
                              if (!cell) {
                                return (
                                  <div
                                    key={`empty-${weekIndex}-${dayIndex}`}
                                    className="rounded-[4px] opacity-0"
                                    style={{ width: heatmapCellSizePx, height: heatmapCellSizePx }}
                                    onMouseEnter={clearHeatmapHover}
                                  />
                                );
                              }

                              const background = getHeatmapColor(themePalette, cell.intensity, cell.tokens > 0);

                              return (
                                <div
                                  key={cell.date}
                                  className="rounded-[4px]"
                                  style={{ width: heatmapCellSizePx, height: heatmapCellSizePx, background }}
                                  aria-label={buildActivityTooltip(cell, dailyAgentTokensByDate)}
                                  onMouseEnter={(event) => updateHeatmapHover(event, cell)}
                                  onMouseMove={(event) => updateHeatmapHover(event, cell)}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {heatmapHoverState !== null && (
                    <div
                      className="pointer-events-none absolute z-20 w-56 rounded-xl border border-white/20 bg-black px-3 py-2 text-xs text-slate-100 shadow-xl"
                      style={{ left: heatmapTooltipLeftPx, top: heatmapTooltipTopPx, transform: "translate(-50%, -100%)" }}
                    >
                      <p className="text-sm font-semibold text-white">{formatDate(heatmapHoverState.cell.date)}</p>
                      <p className="mt-1 text-xs text-slate-200">
                        Tokens: {formatTokens(heatmapHoverState.cell.tokens)} ({formatNumber(heatmapHoverState.cell.tokens)})
                      </p>
                      <p className="text-xs text-slate-300">Sessions: {formatNumber(heatmapHoverState.cell.sessions)}</p>
                      <p className="text-xs text-slate-300">Spend: {formatUsd(heatmapHoverState.cell.costUsd)}</p>
                      <div className="mt-1.5 border-t border-slate-700/60 pt-1.5">
                        {heatmapTooltipAgentRows.map((entry) => (
                          <p key={entry.label} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                            <span style={{ color: entry.color }}>{entry.label}</span>
                            <span>{formatTokens(entry.tokens)}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 mr-auto flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                  <span>Less</span>
                  <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: themePalette.less }} />
                  <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: themePalette.slightlyLess }} />
                  <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: themePalette.medium }} />
                  <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: themePalette.high }} />
                  <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: themePalette.veryHigh }} />
                  <span>More</span>
                </div>

                <div className="mt-6 flex flex-col gap-y-6 sm:grid sm:grid-cols-2 sm:gap-y-6 lg:flex lg:flex-row lg:items-start lg:justify-between lg:gap-y-0">
                  <article className="min-w-0 max-w-[22%] overflow-hidden flex flex-col items-start">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Most Used Model</p>
                    <p className="mt-1 text-2xl font-semibold leading-tight text-white">
                      {mostUsedModel ? mostUsedModel.model : "-"}
                    </p>
                  </article>
                  <article className="min-w-0 max-w-[22%] overflow-hidden flex flex-col items-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent Use (Last 30 Days)</p>
                    <p className="mt-1 w-full text-center text-2xl font-semibold leading-tight text-white">
                      {recentModelUsage ? recentModelUsage.model : "-"}
                    </p>
                  </article>
                  <article className="min-w-0 flex flex-col items-center text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Longest Streak</p>
                    <p className="mt-1 w-full text-center text-2xl font-semibold leading-tight text-white">
                      {formatNumber(longestStreakDays)} {longestStreakDays === 1 ? "day" : "days"}
                    </p>
                  </article>
                  <article className="min-w-0 flex flex-col items-end">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current Streak</p>
                    <p className="mt-1 text-2xl font-semibold leading-tight text-white">
                      {formatNumber(currentStreakDays)} {currentStreakDays === 1 ? "day" : "days"}
                    </p>
                  </article>
                </div>
              </>
            )}
          </div>
        </section>
      </DownloadableCard>

      <DownloadableCard title="Cost Breakdown">
        <section data-card-index="6" className="wrapped-card wrapped-card-cost">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="wrapped-title">Cost Breakdown</h2>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="wrapped-tile">
              <p className="wrapped-label">Total Spend</p>
              <AnimatedNumber
                value={selectedTotalCostUsd}
                animate={animateCard6}
                durationMs={CHART_ANIMATION_MS}
                format={formatUsd}
                className="mt-2 block text-4xl font-semibold text-white"
              />
            </article>
            <article className="wrapped-tile">
              <p className="wrapped-label">Daily Average</p>
              <AnimatedNumber
                value={selectedDailyAverageCostUsd}
                animate={animateCard6}
                durationMs={CHART_ANIMATION_MS}
                format={formatUsd}
                className="mt-2 block text-3xl font-semibold text-white"
              />
            </article>
            <article className="wrapped-tile">
              <p className="wrapped-label">Most Expensive Day</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {selectedMostExpensiveDay ? formatShortDate(selectedMostExpensiveDay.date) : "-"}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {selectedMostExpensiveDay ? (
                  <AnimatedNumber
                    value={selectedMostExpensiveDay.costUsd}
                    animate={animateCard6}
                    durationMs={CHART_ANIMATION_MS}
                    format={formatUsd}
                  />
                ) : (
                  "No cost data"
                )}
              </p>
            </article>
          </div>

          <div
            ref={costChartHoverRef}
            className={`relative mt-6 h-56 sm:h-64 ${animateCard6 ? chartRevealClass : ""}`}
            onMouseMove={updateCostHoverLine}
            onMouseLeave={clearCostHoverLine}
          >
            {effectiveCostGroupBy === "none" ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={costTimeline}>
                  <defs>
                    <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={themePalette.high} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={themePalette.high} stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="2 5" />
                  <XAxis dataKey="date" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: "#000000",
                      border: "1px solid rgba(148,163,184,0.35)",
                      borderRadius: "12px",
                    }}
                    formatter={formatUsdTooltip}
                    labelFormatter={(value) => formatDate(String(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="costUsd"
                    name="Cost"
                    stroke={themePalette.medium}
                    fill="url(#costFill)"
                    strokeWidth={2.5}
                    activeDot={false}
                    isAnimationActive={animateCard6}
                    animationDuration={CHART_ANIMATION_MS}
                    animationBegin={0}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={groupedCostTimeline}>
                  <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="2 5" />
                  <XAxis dataKey="date" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: "#000000",
                      border: "1px solid rgba(148,163,184,0.35)",
                      borderRadius: "12px",
                    }}
                    formatter={(value: number | string | undefined, name?: string) => [
                      formatUsd(typeof value === "number" ? value : Number(value ?? 0)),
                      name ?? "Cost",
                    ]}
                    labelFormatter={(value) => formatDate(String(value))}
                  />
                  {groupedCostSeries.map((series) => (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stackId="cost"
                      stroke={series.color}
                      fill={series.color}
                      fillOpacity={0.22}
                      strokeWidth={2}
                      activeDot={false}
                      isAnimationActive={animateCard6}
                      animationDuration={CHART_ANIMATION_MS}
                      animationBegin={0}
                      animationEasing="ease-in-out"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
            {costHoverLineX !== null && (
              <div
                className="pointer-events-none absolute z-10 border-l border-white"
                style={
                  costPlotOffset !== null
                    ? {
                        left: Math.max(
                          costPlotOffset.left,
                          Math.min(costPlotOffset.left + costPlotOffset.width, costHoverLineX),
                        ),
                        top: costPlotOffset.top,
                        height: costPlotOffset.height,
                        borderLeftWidth: "2.5px",
                      }
                    : {
                        left: costHoverLineX,
                        top: COST_LINE_FALLBACK_TOP_PX,
                        bottom: COST_LINE_FALLBACK_BOTTOM_PX,
                        borderLeftWidth: "2.5px",
                      }
                }
              />
            )}
          </div>
        </section>
      </DownloadableCard>

      <DownloadableCard title="Your Top Repos">
        <section data-card-index="7" className="wrapped-card wrapped-card-repos">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="wrapped-title">Your Top Repos</h2>
            </div>
          </header>

          {topRepos.length === 0 ? (
            <p className="text-sm text-slate-300">No repository usage found.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="space-y-2">
                {topRepos.map((repo) => (
                  <article key={repo.repo} className="wrapped-tile" title={buildRepoHoverDetails(repo)}>
                    <p className="truncate text-sm font-semibold text-white">{repo.repo}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                      <span>
                        <AnimatedNumber
                          value={repo.tokens}
                          animate={animateCard7}
                          durationMs={CHART_ANIMATION_MS}
                          format={(value) => formatTokens(Math.max(0, Math.round(value)))}
                        />{" "}
                        tokens
                      </span>
                      <span>
                        <AnimatedNumber
                          value={repo.costUsd}
                          animate={animateCard7}
                          durationMs={CHART_ANIMATION_MS}
                          format={formatUsd}
                        />
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <div className={`${chartWrapperClass} ${animateCard7 ? chartRevealClass : ""} self-center lg:-translate-x-[15px]`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topRepos} layout="vertical" margin={{ left: 12, right: 16 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="2 5" />
                    <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      dataKey="repo"
                      type="category"
                      tick={{ fill: "#e2e8f0", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={140}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#000000",
                        border: "1px solid rgba(148,163,184,0.35)",
                        borderRadius: "12px",
                      }}
                      content={renderTopReposTooltip}
                    />
                    <Bar
                      dataKey="tokens"
                      radius={[0, 10, 10, 0]}
                      isAnimationActive={animateCard7}
                      animationDuration={CHART_ANIMATION_MS}
                      animationBegin={0}
                      animationEasing="ease-in-out"
                    >
                      {topRepos.map((repo, index) => (
                        <Cell key={repo.repo} fill={topRepoBarColors[Math.min(index, topRepoBarColors.length - 1)]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      </DownloadableCard>

      <DownloadableCard title="Your Coding Hours">
        <section data-card-index="8" className="wrapped-card wrapped-card-hours">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="wrapped-title">Your Coding Hours</h2>
            </div>
          </header>

          {!hasHourlyData ? (
            <p className="text-sm text-slate-300">No hourly activity found in this range.</p>
          ) : (() => {
            const peakEntry = hourlyBreakdown.reduce(
              (max, entry) => (entry.tokens > max.tokens ? entry : max),
              hourlyBreakdown[0] as HourlyDataPoint,
            );
            const peakHour = peakEntry.hour;
            const peakTokens = peakEntry.tokens;
            const personality = classifyCodingPersonality(peakHour);
            const nightSessions = hourlyBreakdown
              .filter((h) => h.hour >= 0 && h.hour < 6)
              .reduce((sum, h) => sum + h.sessions, 0);

            return (
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className={`${chartWrapperClass} ${animateCard8 ? chartRevealClass : ""} self-center`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyBreakdown}>
                      <CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="2 5" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#cbd5e1", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval={2}
                      />
                      <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        content={<HourlyBarTooltip />}
                        allowEscapeViewBox={{ x: true, y: true }}
                        wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
                      />
                      <Bar
                        dataKey="tokens"
                        name="Tokens"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={animateCard8}
                        animationDuration={CHART_ANIMATION_MS}
                        animationBegin={0}
                        animationEasing="ease-in-out"
                      >
                        {hourlyBreakdown.map((row) => (
                          <Cell
                            key={row.hour}
                            fill={row.hour === peakHour ? themePalette.veryHigh : themePalette.slightlyLess}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-col gap-3">
                  <article className="wrapped-tile py-6 text-left">
                    <p className="text-5xl">{personality.emoji}</p>
                    <p className="mt-3 text-2xl font-semibold text-white">{personality.label}</p>
                    <p className="mt-2 text-sm text-slate-300">{personality.description}</p>
                  </article>

                  <article className="wrapped-tile">
                    <p className="wrapped-label">Peak Hour</p>
                    <AnimatedNumber
                      value={peakHour}
                      animate={animateCard8}
                      durationMs={CHART_ANIMATION_MS}
                      format={(v) => formatHourLabel(Math.round(v))}
                      className="mt-2 block text-3xl font-semibold text-white"
                    />
                    <p className="mt-1 text-xs text-slate-300">
                      {formatTokens(peakTokens)} tokens in your busiest hour
                    </p>
                  </article>

                  <article className="wrapped-tile">
                    <p className="wrapped-label">Fun Stats</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-200">
                      <li>{formatNumber(nightSessions)} sessions after midnight</li>
                      <li>{weekendSessionPercent}% of coding on weekends</li>
                      {busiestDayOfWeek && <li>{busiestDayOfWeek}s are your power day</li>}
                      {busiestSingleDay && (
                        <li>
                          Busiest day: {formatDate(busiestSingleDay.date)} ({formatTokens(busiestSingleDay.tokens)})
                        </li>
                      )}
                    </ol>
                  </article>
                </div>
              </div>
            );
          })()}
        </section>
      </DownloadableCard>
    </>
  );
};

export default DashboardCharts;
