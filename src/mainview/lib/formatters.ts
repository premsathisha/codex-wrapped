const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseInstant = (value: string): Date | null => {
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) return null;
	return new Date(parsed);
};

const parseDateOnly = (value: string): Date | null => {
	if (!ISO_DATE_ONLY_RE.test(value)) return null;
	return new Date(`${value}T00:00:00Z`);
};

export const formatNumber = (value: number): string =>
	new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export const formatCompactNumber = (value: number): string =>
	new Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);

export const formatTokens = (value: number): string => {
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return formatNumber(value);
};

export const formatUsd = (
	value: number | null | undefined,
	options?: {
		minimumFractionDigits?: number;
		maximumFractionDigits?: number;
	},
): string =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: options?.minimumFractionDigits ?? 2,
		maximumFractionDigits: options?.maximumFractionDigits ?? 4,
	}).format(value ?? 0);

export const formatSpendUsd = (value: number | null | undefined): string =>
	formatUsd(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatDate = (value: string | null): string => {
	if (!value) return "-";
	const dateOnly = parseDateOnly(value);
	if (dateOnly) {
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone: "UTC",
		}).format(dateOnly);
	}

	const parsed = parseInstant(value);
	if (!parsed) return value;
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(parsed);
};
