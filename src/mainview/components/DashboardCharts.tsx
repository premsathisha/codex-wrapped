import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { SESSION_SOURCES, type SessionSource, type TokenUsage } from "@shared/schema";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	type BarShapeProps,
	CartesianGrid,
	Cell,
	Rectangle,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { AnimatedNumber } from "./StatsCards";
import DownloadableCard from "./DownloadableCard";
import { ChartContainer, ChartTooltip } from "@shared/components/ui/chart";
import { formatDate, formatDuration, formatNumber, formatTokens, formatUsd } from "../lib/formatters";
import { getHeatmapColor } from "../lib/heatmapColors";
import { formatHourLabel, hasHourlyActivity } from "../lib/hourly";
import { HEATMAP_GAP_PX, computeHeatmapCellSizePx } from "../lib/heatmap";
import { SOURCE_LABELS } from "../lib/constants";
import type { ThemePalette } from "../lib/themePalettes";
import type {
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
	weekendTokenPercent: number;
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

interface TopRepoRow {
	repo: string;
	sessions: number;
	tokens: number;
	costUsd: number;
	durationMs: number;
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

const buildContinuousTimeline = (timeline: TimelinePoint[], dateFrom: string, dateTo: string): TimelinePoint[] => {
	const byDate = new Map<string, TimelinePoint>();
	for (const point of timeline) byDate.set(point.date, point);

	const start = new Date(`${dateFrom}T00:00:00Z`);
	const end = new Date(`${dateTo}T00:00:00Z`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

	const rows: TimelinePoint[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		const iso = cursor.toISOString().slice(0, 10);
		const point = byDate.get(iso);
		rows.push(
			point ?? {
				date: iso,
				sessions: 0,
				tokens: 0,
				costUsd: 0,
				durationMs: 0,
				messages: 0,
				toolCalls: 0,
			},
		);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return rows;
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
const HEATMAP_TOOLTIP_HALF_WIDTH_PX = 112;
const HEATMAP_LEFT_GUTTER_PX = 36;
const HEATMAP_MONTH_ROW_HEIGHT_PX = 18;
const HEATMAP_WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;
const HEATMAP_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

const toNumericTooltipValue = (value: unknown): number => {
	if (typeof value === "number") return value;
	if (typeof value === "string") return Number(value);
	if (Array.isArray(value) && value.length > 0) {
		const first = value[0];
		return typeof first === "number" ? first : Number(first ?? 0);
	}
	return Number(value ?? 0);
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BAR_FILL_TRANSITION = "fill 180ms ease-in-out";

const lightenHexColor = (hexColor: string, amount = 0.14): string => {
	const match = /^#([0-9a-f]{6})$/i.exec(hexColor.trim());
	if (!match) return hexColor;

	const hex = match[1];
	const lightenChannel = (offset: number) => {
		const current = Number.parseInt(hex.slice(offset, offset + 2), 16);
		return Math.round(current + (255 - current) * amount);
	};
	const toHex = (value: number) => value.toString(16).padStart(2, "0");

	return `#${toHex(lightenChannel(0))}${toHex(lightenChannel(2))}${toHex(lightenChannel(4))}`.toUpperCase();
};

const buildBarTransitionStyle = (style?: CSSProperties): CSSProperties => {
	const transition =
		typeof style?.transition === "string" && style.transition.length > 0
			? `${style.transition}, ${BAR_FILL_TRANSITION}`
			: BAR_FILL_TRANSITION;

	return {
		...style,
		transition,
	};
};

const renderAnimatedBarShape = (props: BarShapeProps, fill: string) => (
	<Rectangle {...props} fill={fill} style={buildBarTransitionStyle(props.style)} />
);

const HourlyTooltipCard = ({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload?: HourlyDataPoint }>;
}) => {
	const row = payload?.[0]?.payload;
	if (!active || !row) return null;

	return (
		<div className="rounded-xl border border-slate-400/45 bg-black px-3 py-2 shadow-2xl">
			<p className="text-sm font-semibold text-slate-100">{row.label}</p>
			<p className="mt-1 text-xs text-[#A1A1A1]">
				Tokens: {formatTokens(row.tokens)} ({formatNumber(row.tokens)})
			</p>
			<p className="text-xs text-[#A1A1A1]">Cost: {formatUsd(row.costUsd)}</p>
			<p className="text-xs text-[#A1A1A1]">Sessions: {formatNumber(row.sessions)}</p>
			{row.byAgent.length > 0 && (
				<div className="mt-1.5 border-t border-slate-700/60 pt-1.5">
					{row.byAgent.map((a) => (
						<p key={a.source} className="flex items-center justify-between gap-3 text-xs text-[#A1A1A1]">
							<span className="text-[#A1A1A1]">{a.label}</span>
							<span className="text-[#A1A1A1]">
								{formatTokens(a.tokens)} · {formatUsd(a.costUsd)} · {formatNumber(a.sessions)}s
							</span>
						</p>
					))}
				</div>
			)}
		</div>
	);
};

const CostTooltipCard = ({
	active,
	label,
	payload,
}: {
	active?: boolean;
	label?: string | number;
	payload?: Array<{ name?: string | number; value?: unknown }>;
}) => {
	if (!active || !label || !payload || payload.length === 0) return null;

	const entries = payload
		.map((entry) => ({
			label: String(entry.name ?? "Cost"),
			value: toNumericTooltipValue(entry.value),
		}))
		.filter((entry) => Number.isFinite(entry.value));

	if (entries.length === 0) return null;

	return (
		<div className="rounded-xl border border-slate-400/45 bg-black px-3 py-2 shadow-2xl">
			<p className="text-sm font-semibold text-[#FAFAFA]">{formatShortDate(String(label))}</p>
			<div className="mt-1.5 space-y-1">
				{entries.map((entry) => (
					<p key={entry.label} className="flex items-center justify-between gap-3 text-xs text-[#A1A1A1]">
						<span>{entry.label}</span>
						<span>{formatUsd(entry.value)}</span>
					</p>
				))}
			</div>
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

	const lines = SESSION_SOURCES.map((source) => ({
		source,
		tokens: agentTotals?.[source] ?? 0,
	}))
		.filter((entry) => entry.tokens > 0)
		.sort((left, right) => right.tokens - left.tokens)
		.map((entry) => `- ${SOURCE_LABELS[entry.source as SessionSource]} - ${formatTokens(entry.tokens)}`);

	if (lines.length === 0) {
		lines.push(`- ${SOURCE_LABELS.codex} - ${formatTokens(cell.tokens)}`);
	}

	return `${formatDate(cell.date)}\n${lines.join("\n")}`;
};

const buildHeatmapAgentTokenRows = (
	cell: HeatmapCell,
	dailyAgentTokensByDate: DailyAgentTokensByDate,
	sourceColorMap: Record<SessionSource, string>,
): HeatmapAgentTokenRow[] => {
	const agentTotals = dailyAgentTokensByDate[cell.date];

	const rows = SESSION_SOURCES.map((source) => ({
		label: SOURCE_LABELS[source],
		tokens: agentTotals?.[source] ?? 0,
		color: sourceColorMap[source] ?? "#94a3b8",
	}))
		.filter((entry) => entry.tokens > 0)
		.sort((left, right) => right.tokens - left.tokens);

	if (rows.length > 0) return rows;

	return [
		{
			label: SOURCE_LABELS.codex,
			tokens: cell.tokens,
			color: sourceColorMap.codex ?? "#60a5fa",
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

const renderTopReposTooltip = ({ active, payload, label }: TooltipContentProps<any, any>) => {
	const row = payload?.[0]?.payload as TopRepoRow | undefined;
	if (!active || !row) return null;

	return (
		<div className="rounded-xl border border-white/20 bg-black px-3 py-2 text-xs text-slate-100 shadow-xl">
			<p className="mb-1 text-sm font-semibold text-[#FAFAFA]">{typeof label === "string" ? label : "Repository"}</p>
			<p>Sessions: {formatNumber(row.sessions)}</p>
			<p>
				Tokens: {formatTokens(row.tokens)} ({formatNumber(row.tokens)})
			</p>
			<p>Spend: {formatUsd(row.costUsd)}</p>
			<p>Time active: {formatDuration(row.durationMs)}</p>
		</div>
	);
};

const DashboardCharts = ({
	dateFrom,
	dateTo,
	modelBreakdown,
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
	weekendTokenPercent,
	busiestDayOfWeek,
	busiestSingleDay,
}: DashboardChartsProps) => {
	const animateCard3 = Boolean(cardAnimations[3]);
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
	const topReposChartConfig = {
		tokens: {
			label: "Tokens",
			color: themePalette.medium,
		},
	};
	const sourceColorMap: Record<SessionSource, string> = {
		codex: themePalette.high,
	};
	const hasHourlyData = hasHourlyActivity(hourlyBreakdown);
	const heatmapViewportRef = useRef<HTMLDivElement | null>(null);
	const heatmapTooltipHostRef = useRef<HTMLDivElement | null>(null);
	const [heatmapTargetWidthPx, setHeatmapTargetWidthPx] = useState<number | undefined>(undefined);
	const [heatmapHoverState, setHeatmapHoverState] = useState<HeatmapHoverState | null>(null);
	const renderBarShape = useCallback(
		(props: BarShapeProps) => {
			const fill = typeof props.fill === "string" ? props.fill : themePalette.medium;
			return renderAnimatedBarShape(props, fill);
		},
		[themePalette.medium],
	);
	const renderActiveBarShape = useCallback(
		(props: BarShapeProps) => {
			const fill = typeof props.fill === "string" ? props.fill : themePalette.medium;
			return renderAnimatedBarShape(props, lightenHexColor(fill));
		},
		[themePalette.medium],
	);

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

	const visibleModelBreakdown = modelBreakdown.filter((row) => row.model !== "<synthetic>");
	const totalModelTokens = visibleModelBreakdown.reduce((sum, row) => sum + row.tokens, 0);
	const modelRows = visibleModelBreakdown.map((row, index) => ({
		...row,
		color: modelColors[index % modelColors.length],
		percentage: totalModelTokens > 0 ? (row.tokens / totalModelTokens) * 100 : 0,
	}));
	const topModelRows = modelRows.slice(0, 5);
	const chartModelRows = topModelRows;

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
		heatmapHoverState === null
			? []
			: buildHeatmapAgentTokenRows(heatmapHoverState.cell, dailyAgentTokensByDate, sourceColorMap);
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

	const continuousTimeline = useMemo<TimelinePoint[]>(
		() => buildContinuousTimeline(timeline, dateFrom, dateTo),
		[dateFrom, dateTo, timeline],
	);

	const costTimeline = useMemo<TimelinePoint[]>(() => {
		if (costAgentFilter === "all") return continuousTimeline;

		return continuousTimeline.map((point) => ({
			...point,
			costUsd: dailyAgentCostsByDate[point.date]?.[costAgentFilter] ?? 0,
		}));
	}, [continuousTimeline, costAgentFilter, dailyAgentCostsByDate]);

	const selectedTotalCostUsd =
		costAgentFilter === "all" ? totalCostUsd : costTimeline.reduce((sum, point) => sum + point.costUsd, 0);

	const selectedDailyAverageCostUsd =
		costAgentFilter === "all" ? dailyAverageCostUsd : dateSpanDays > 0 ? selectedTotalCostUsd / dateSpanDays : 0;

	const selectedMostExpensiveDay =
		costAgentFilter === "all"
			? mostExpensiveDay
			: (() => {
					const daysWithSpend = costTimeline.filter((point) => point.costUsd > 0);
					if (daysWithSpend.length === 0) return null;
					return daysWithSpend.reduce((max, point) => (point.costUsd > max.costUsd ? point : max), daysWithSpend[0]);
				})();

	const groupedAgentSeries = useMemo<Array<{ key: string; label: string; color: string }>>(() => {
		const sources = costAgentFilter === "all" ? SESSION_SOURCES : [costAgentFilter];
		return sources.map((source) => ({
			key: source,
			label: SOURCE_LABELS[source],
			color: sourceColorMap[source] ?? themePalette.medium,
		}));
	}, [costAgentFilter, sourceColorMap, themePalette.medium]);

	const groupedAgentTimeline = useMemo<CostSeriesPoint[]>(
		() =>
			continuousTimeline.map((point) => {
				const row: CostSeriesPoint = { date: point.date };
				const bySource = dailyAgentCostsByDate[point.date] ?? {};
				const sources = costAgentFilter === "all" ? SESSION_SOURCES : [costAgentFilter];

				for (const source of sources) {
					row[source] = bySource[source] ?? 0;
				}

				return row;
			}),
		[continuousTimeline, costAgentFilter, dailyAgentCostsByDate],
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
			continuousTimeline.map((point) => {
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
		[continuousTimeline, dailyModelCostsByDate, groupedModelSeries],
	);

	const effectiveCostGroupBy = costGroupBy === "by-model" && groupedModelSeries.length === 0 ? "none" : costGroupBy;
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

					{topModelRows.length === 0 ? (
						<p className="text-sm text-[#A1A1A1]">No model activity found in this range.</p>
					) : (
						<div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
							<div
								className={`h-72 sm:h-80 ${animateCard3 ? chartRevealClass : ""} self-center lg:-translate-x-[60px]`}
							>
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={chartModelRows} layout="vertical" margin={{ left: 12, right: 16 }}>
										<CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="2 5" />
										<XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
										<YAxis
											dataKey="model"
											type="category"
											tick={{ fill: "#e2e8f0", fontSize: 12 }}
											tickLine={false}
											axisLine={false}
											width={208}
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

							<div className="space-y-2 pr-1" data-export-expand="vertical">
								{topModelRows.map((row) => (
									<article
										key={row.model}
										className="wrapped-tile"
										title={`${row.model}: ${formatNumber(row.tokens)} tokens (${row.percentage.toFixed(1)}%)`}
									>
										<div className="flex items-center justify-between text-sm text-[#A1A1A1]">
											<span className="truncate pr-3">{row.model}</span>
											<span>{row.percentage.toFixed(1)}%</span>
										</div>
										<div className="mt-2 h-2 rounded-full bg-slate-700/45">
											<div
												className="h-full rounded-full transition-all duration-700"
												style={{ width: `${row.percentage}%`, backgroundColor: row.color }}
											/>
										</div>
										<p className="mt-2 text-xs text-[#A1A1A1]">
											{formatTokens(row.tokens)} ({formatNumber(row.tokens)})
										</p>
									</article>
								))}
							</div>
						</div>
					)}
				</section>
			</DownloadableCard>

			<DownloadableCard title="Codex">
				<section data-card-index="5" className="wrapped-card wrapped-card-activity">
					<div className="rounded-3xl border border-white/10 bg-black px-5 py-5 sm:px-8 sm:py-7">
						<div className="mb-5 flex flex-wrap items-start justify-between gap-4">
							<h2 className="text-[1.9rem] font-semibold tracking-tight text-[#FAFAFA]">Codex</h2>
							<div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-3 sm:gap-10">
								<div className="text-right">
									<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Input Tokens</p>
									<p className="text-2xl font-semibold text-[#FAFAFA]">{formatTokens(inputTokens)}</p>
								</div>
								<div className="text-right">
									<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Output Tokens</p>
									<p className="text-2xl font-semibold text-[#FAFAFA]">{formatTokens(outputTokens)}</p>
								</div>
								<div className="text-right">
									<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Total Tokens</p>
									<p className="text-2xl font-semibold text-[#FAFAFA]">{formatTokens(totalTokens)}</p>
								</div>
							</div>
						</div>

						{heatmap.length === 0 ? (
							<p className="text-sm text-[#A1A1A1]">No activity timeline available.</p>
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
											<div
												className="relative"
												style={{ width: heatmapGridWidthPx, height: HEATMAP_MONTH_ROW_HEIGHT_PX }}
											>
												{heatmapMonthLabels.map((month) => (
													<span
														key={`month-${month.weekIndex}-${month.label}`}
														className="absolute top-0 text-[11px] leading-none text-[#A1A1A1]"
														style={{ left: month.weekIndex * (heatmapCellSizePx + HEATMAP_GAP_PX) }}
													>
														{month.label}
													</span>
												))}
											</div>

											<div
												className="grid grid-rows-7 gap-1 pr-1 text-[11px] leading-none text-[#A1A1A1]"
												style={{ width: HEATMAP_LEFT_GUTTER_PX }}
											>
												{HEATMAP_WEEKDAY_LABELS.map((label, dayIndex) => (
													<div
														key={`day-label-${dayIndex}`}
														className="flex items-center justify-end"
														style={{ height: heatmapCellSizePx }}
													>
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
											style={{
												left: heatmapTooltipLeftPx,
												top: heatmapTooltipTopPx,
												transform: "translate(-50%, -100%)",
											}}
										>
											<p className="text-sm font-semibold text-[#FAFAFA]">{formatDate(heatmapHoverState.cell.date)}</p>
											<p className="mt-1 text-xs text-[#A1A1A1]">
												Tokens: {formatTokens(heatmapHoverState.cell.tokens)} (
												{formatNumber(heatmapHoverState.cell.tokens)})
											</p>
											<p className="text-xs text-[#A1A1A1]">
												Sessions: {formatNumber(heatmapHoverState.cell.sessions)}
											</p>
											<p className="text-xs text-[#A1A1A1]">Spend: {formatUsd(heatmapHoverState.cell.costUsd)}</p>
											<div className="mt-1.5 border-t border-slate-700/60 pt-1.5">
												{heatmapTooltipAgentRows.map((entry) => (
													<p
														key={entry.label}
														className="flex items-center justify-between gap-2 text-xs text-[#A1A1A1]"
													>
														<span style={{ color: entry.color }}>{entry.label}</span>
														<span>{formatTokens(entry.tokens)}</span>
													</p>
												))}
											</div>
										</div>
									)}
								</div>

								<div className="mt-4 mr-auto flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#A1A1A1]">
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
										<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Most Used Model</p>
										<p className="mt-1 text-2xl font-semibold text-[#FAFAFA]">
											{mostUsedModel ? mostUsedModel.model : "-"}
										</p>
									</article>
									<article className="min-w-0 max-w-[22%] overflow-hidden flex flex-col items-center">
										<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Recent Use (Last 30 Days)</p>
										<p className="mt-1 w-full text-center text-2xl font-semibold text-[#FAFAFA]">
											{recentModelUsage ? recentModelUsage.model : "-"}
										</p>
									</article>
									<article className="min-w-0 flex flex-col items-center text-center">
										<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Longest Streak</p>
										<p className="mt-1 w-full text-center text-2xl font-semibold text-[#FAFAFA]">
											{formatNumber(longestStreakDays)} {longestStreakDays === 1 ? "day" : "days"}
										</p>
									</article>
									<article className="min-w-0 flex flex-col items-end">
										<p className="text-xs uppercase tracking-[0.14em] text-[#A1A1A1]">Current Streak</p>
										<p className="mt-1 text-2xl font-semibold text-[#FAFAFA]">
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
								className="mt-2 block text-4xl font-semibold text-[#FAFAFA]"
							/>
						</article>
						<article className="wrapped-tile">
							<p className="wrapped-label">Daily Average</p>
							<AnimatedNumber
								value={selectedDailyAverageCostUsd}
								animate={animateCard6}
								durationMs={CHART_ANIMATION_MS}
								format={formatUsd}
								className="mt-2 block text-3xl font-semibold text-[#FAFAFA]"
							/>
						</article>
						<article className="wrapped-tile">
							<p className="wrapped-label">Most Expensive Day</p>
							<p className="mt-2 block text-3xl font-semibold text-[#FAFAFA]">
								{selectedMostExpensiveDay ? formatShortDate(selectedMostExpensiveDay.date) : "-"}
							</p>
						</article>
					</div>

					<div className={`relative mt-6 h-56 sm:h-64 ${animateCard6 ? chartRevealClass : ""}`}>
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
									<XAxis
										dataKey="date"
										tick={{ fill: "#cbd5e1", fontSize: 11 }}
										tickLine={false}
										axisLine={false}
										tickFormatter={(value) => formatShortDate(String(value))}
										minTickGap={18}
										interval="preserveStartEnd"
									/>
									<YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
									<ChartTooltip
										cursor={false}
										wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
										content={<CostTooltipCard />}
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
									<XAxis
										dataKey="date"
										tick={{ fill: "#cbd5e1", fontSize: 11 }}
										tickLine={false}
										axisLine={false}
										tickFormatter={(value) => formatShortDate(String(value))}
										minTickGap={18}
										interval="preserveStartEnd"
									/>
									<YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
									<ChartTooltip
										cursor={false}
										wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
										content={<CostTooltipCard />}
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
						<p className="text-sm text-[#A1A1A1]">No repository usage found.</p>
					) : (
						<div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
							<div className="space-y-2">
								{topRepos.map((repo) => (
									<article key={repo.repo} className="wrapped-tile" title={buildRepoHoverDetails(repo)}>
										<p className="truncate text-sm font-semibold text-[#FAFAFA]">{repo.repo}</p>
										<div className="mt-2 flex items-center justify-between text-xs text-[#A1A1A1]">
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

							<ChartContainer
								config={topReposChartConfig}
								className={`${chartWrapperClass} ${animateCard7 ? chartRevealClass : ""} self-center lg:-translate-x-[15px]`}
							>
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
									<ChartTooltip
										cursor={false}
										wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
										content={renderTopReposTooltip}
									/>
									<Bar
										dataKey="tokens"
										radius={[0, 10, 10, 0]}
										isAnimationActive={animateCard7}
										animationDuration={CHART_ANIMATION_MS}
										animationBegin={0}
										animationEasing="ease-in-out"
										shape={renderBarShape}
										activeBar={renderActiveBarShape}
									>
										{topRepos.map((repo, index) => (
											<Cell key={repo.repo} fill={topRepoBarColors[Math.min(index, topRepoBarColors.length - 1)]} />
										))}
									</Bar>
								</BarChart>
							</ChartContainer>
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
						<p className="text-sm text-[#A1A1A1]">No hourly activity found in this range.</p>
					) : (
						(() => {
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
							const hourlyChartConfig = {
								tokens: {
									label: "Tokens",
									color: themePalette.medium,
								},
							};

							return (
								<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
									<ChartContainer
										config={hourlyChartConfig}
										className={`${chartWrapperClass} ${animateCard8 ? chartRevealClass : ""} self-center`}
									>
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
											<ChartTooltip
												cursor={false}
												allowEscapeViewBox={{ x: true, y: true }}
												wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
												content={<HourlyTooltipCard />}
											/>
											<Bar
												dataKey="tokens"
												name="Tokens"
												radius={[6, 6, 0, 0]}
												isAnimationActive={animateCard8}
												animationDuration={CHART_ANIMATION_MS}
												animationBegin={0}
												animationEasing="ease-in-out"
												shape={renderBarShape}
												activeBar={renderActiveBarShape}
											>
												{hourlyBreakdown.map((row) => (
													<Cell
														key={row.hour}
														fill={row.hour === peakHour ? themePalette.veryHigh : themePalette.slightlyLess}
													/>
												))}
											</Bar>
										</BarChart>
									</ChartContainer>

									<div className="flex flex-col gap-3">
										<article className="wrapped-tile py-6 text-left">
											<p className="text-5xl">{personality.emoji}</p>
											<p className="mt-3 text-2xl font-semibold text-[#FAFAFA]">{personality.label}</p>
											<p className="mt-2 text-sm text-[#A1A1A1]">{personality.description}</p>
										</article>

										<article className="wrapped-tile">
											<p className="wrapped-label">Peak Hour</p>
											<AnimatedNumber
												value={peakHour}
												animate={animateCard8}
												durationMs={CHART_ANIMATION_MS}
												format={(v) => formatHourLabel(Math.round(v))}
												className="mt-2 block text-3xl font-semibold text-[#FAFAFA]"
											/>
											<p className="mt-1 text-xs text-[#A1A1A1]">
												{formatTokens(peakTokens)} tokens in your busiest hour
											</p>
										</article>

										<article className="wrapped-tile">
											<p className="wrapped-label">Fun Stats</p>
											<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[#A1A1A1]">
												<li>{formatNumber(nightSessions)} sessions after midnight</li>
												<li>{weekendTokenPercent}% of tokens on weekends</li>
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
						})()
					)}
				</section>
			</DownloadableCard>
		</>
	);
};

export default DashboardCharts;
