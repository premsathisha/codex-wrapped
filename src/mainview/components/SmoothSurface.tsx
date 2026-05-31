import { SmoothCorners, type SmoothCornerOptions } from "@lisse/react";
import { generateClipPath } from "@lisse/core/path";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const SMOOTHING = 0.72;

export const smoothCorners = (radius: number): SmoothCornerOptions => ({ radius, smoothing: SMOOTHING });

export const smoothCornerSet = (
	topLeft: number,
	topRight: number,
	bottomRight: number,
	bottomLeft: number,
): SmoothCornerOptions => ({
	topLeft: topLeft > 0 ? { radius: topLeft, smoothing: SMOOTHING } : 0,
	topRight: topRight > 0 ? { radius: topRight, smoothing: SMOOTHING } : 0,
	bottomRight: bottomRight > 0 ? { radius: bottomRight, smoothing: SMOOTHING } : 0,
	bottomLeft: bottomLeft > 0 ? { radius: bottomLeft, smoothing: SMOOTHING } : 0,
});

interface SmoothSurfaceProps {
	children: ReactNode;
	radius: number;
}

const SmoothSurface = ({ children, radius }: SmoothSurfaceProps) => (
	<SmoothCorners asChild corners={smoothCorners(radius)} shadowStrategy="box-shadow">
		{children}
	</SmoothCorners>
);

interface SmoothClippedBoxProps {
	children?: ReactNode;
	className?: string;
	radius: number;
	style?: CSSProperties;
}

export const SmoothClippedBox = ({ children, className, radius, style }: SmoothClippedBoxProps) => {
	const ref = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		const updateSize = () => {
			const rect = node.getBoundingClientRect();
			setSize((current) => {
				const width = Math.max(0, Math.round(rect.width * 100) / 100);
				const height = Math.max(0, Math.round(rect.height * 100) / 100);
				return current.width === width && current.height === height ? current : { width, height };
			});
		};

		updateSize();
		if (typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(updateSize);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const clipPath =
		size.width > 0 && size.height > 0 ? generateClipPath(size.width, size.height, smoothCorners(radius)) : undefined;

	return (
		<div ref={ref} className={className} style={{ ...style, clipPath }}>
			{children}
		</div>
	);
};

export default SmoothSurface;
