import type { DashboardDateRange } from "../hooks/useDashboardData";
import { getCurrentYearInTimeZone } from "../hooks/useDashboardData";

export interface HeroCopy {
	kicker: string;
	title: string;
}

export const getHeroCopy = (
	selectedRange: DashboardDateRange,
	aggregationTimeZone: string,
	now = new Date(),
): HeroCopy => {
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
			const currentYear = getCurrentYearInTimeZone(aggregationTimeZone, now);
			if (year === currentYear) {
				return { kicker: "This Year In Code", title: "Your AI Coding Year" };
			}

			return { kicker: `${year} In Code`, title: `Your AI Coding ${year}` };
		}
	}

	return { kicker: "Your Time In Code", title: "Your AI Coding Story" };
};
