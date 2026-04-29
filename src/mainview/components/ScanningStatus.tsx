import type { CSSProperties } from "react";

interface ScanningStatusProps {
	isActive: boolean;
	duration?: number;
	repeatDelay?: number;
	spread?: number;
	color?: string;
	shimmerColor?: string;
}

export default function ScanningStatus({
	isActive,
	duration = 2,
	repeatDelay = 0.5,
	spread = 2,
	color,
	shimmerColor,
}: ScanningStatusProps) {
	const style = {
		"--scan-shimmer-duration": `${Math.max(0.9, duration + repeatDelay)}s`,
		"--scan-shimmer-spread": String(Math.max(1, spread)),
		"--scan-shimmer-base-color": color ?? "var(--scan-shimmer-start)",
		"--scan-shimmer-highlight-color": shimmerColor ?? "var(--scan-shimmer-peak)",
	} as CSSProperties;

	return (
		<span
			className="wrapped-scanning-shimmer text-[0.6rem] uppercase tracking-[0.14em]"
			aria-live={isActive ? "polite" : "off"}
			style={style}
		>
			REFRESHING...
		</span>
	);
}
