import { generateClipPath } from "@lisse/core/path";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useEffect } from "react";

const Toaster = ({ ...props }: ToasterProps) => {
	useEffect(() => {
		const observedElements = new Map<Element, ResizeObserver>();

		const applyLisseClip = (element: Element, radius: number) => {
			if (!(element instanceof HTMLElement) || observedElements.has(element)) return;

			const updateClipPath = () => {
				const { width, height } = element.getBoundingClientRect();
				if (width <= 0 || height <= 0) return;

				element.style.clipPath = generateClipPath(width, height, { radius, smoothing: 0.72 });
			};

			const resizeObserver = new ResizeObserver(updateClipPath);
			resizeObserver.observe(element);
			observedElements.set(element, resizeObserver);
			updateClipPath();
		};

		const applyToasterClips = () => {
			document.querySelectorAll(".lisse-toaster [data-sonner-toast]").forEach((element) => applyLisseClip(element, 8));
			document
				.querySelectorAll(".lisse-toaster [data-close-button]")
				.forEach((element) => applyLisseClip(element, 999));
		};

		const mutationObserver = new MutationObserver(applyToasterClips);
		mutationObserver.observe(document.body, { childList: true, subtree: true });
		applyToasterClips();

		return () => {
			mutationObserver.disconnect();
			observedElements.forEach((resizeObserver) => resizeObserver.disconnect());
		};
	}, []);

	return (
		<Sonner
			theme="dark"
			richColors
			closeButton
			className="toaster lisse-toaster group"
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:border group-[.toaster]:border-white/15 group-[.toaster]:bg-[#0c0f14] group-[.toaster]:text-[#FAFAFA] group-[.toaster]:shadow-lg",
					title: "text-sm font-semibold",
					description: "text-xs leading-5 text-[#E2E8F0]",
					success: "group-[.toaster]:border-emerald-400/30 group-[.toaster]:bg-emerald-500/12",
					error: "group-[.toaster]:border-amber-400/35 group-[.toaster]:bg-amber-500/12",
					closeButton:
						"group-[.toaster]:border-white/15 group-[.toaster]:bg-transparent group-[.toaster]:text-[#E2E8F0] hover:group-[.toaster]:bg-white/10",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
