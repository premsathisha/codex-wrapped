import { type ReactNode, useRef, useState } from "react";
import { toPng } from "html-to-image";

interface DownloadableCardProps {
  title: string;
  children: ReactNode;
}

const sanitizeFilenamePart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "card";

const formatLocalDatePart = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const triggerFileDownload = (href: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
};

const DownloadableCard = ({ title, children }: DownloadableCardProps) => {
  const cardTargetRef = useRef<HTMLDivElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading || !cardTargetRef.current) return;
    setIsDownloading(true);

    const cardTarget = cardTargetRef.current;
    const exportAnchors = Array.from(
      cardTarget.querySelectorAll<HTMLElement>('[data-export-scroll-anchor="end"]'),
    );
    const previousExportState = exportAnchors.map((element) => {
      const content = element.firstElementChild as HTMLElement | null;
      return {
        element,
        content,
        scrollLeft: element.scrollLeft,
        overflowX: element.style.overflowX,
        contentTransform: content?.style.transform ?? "",
        contentTransition: content?.style.transition ?? "",
      };
    });
    const exportExpandElements = Array.from(
      cardTarget.querySelectorAll<HTMLElement>('[data-export-expand="vertical"]'),
    );
    const previousExpandState = exportExpandElements.map((element) => ({
      element,
      overflowY: element.style.overflowY,
      maxHeight: element.style.maxHeight,
      height: element.style.height,
    }));

    try {
      for (const state of previousExportState) {
        const shiftPx = Math.max(0, state.element.scrollWidth - state.element.clientWidth);
        state.element.style.overflowX = "hidden";
        state.element.scrollLeft = 0;
        if (state.content) {
          state.content.style.transition = "none";
          state.content.style.transform = `translateX(-${shiftPx}px)`;
        }
      }
      for (const state of previousExpandState) {
        state.element.style.overflowY = "visible";
        state.element.style.maxHeight = "none";
        state.element.style.height = `${state.element.scrollHeight}px`;
      }

      await nextFrame();
      await nextFrame();

      const imageDataUrl = await toPng(cardTarget, {
        backgroundColor: "#171717",
        cacheBust: true,
        pixelRatio: Math.max(2, window.devicePixelRatio || 1),
      });

      const datePart = formatLocalDatePart(new Date());
      const fileName = `codex-wrapped-${sanitizeFilenamePart(title)}-${datePart}.png`;
      triggerFileDownload(imageDataUrl, fileName);
    } finally {
      for (const { element, content, scrollLeft, overflowX, contentTransform, contentTransition } of previousExportState) {
        element.style.overflowX = overflowX;
        element.scrollLeft = scrollLeft;
        if (content) {
          content.style.transform = contentTransform;
          content.style.transition = contentTransition;
        }
      }
      for (const { element, overflowY, maxHeight, height } of previousExpandState) {
        element.style.overflowY = overflowY;
        element.style.maxHeight = maxHeight;
        element.style.height = height;
      }
      setIsDownloading(false);
    }
  };

  return (
    <div className="wrapped-card-shell">
      <div ref={cardTargetRef}>{children}</div>
      <div className="wrapped-card-download-hotspot" aria-hidden="true" />
      <button
        type="button"
        className="wrapped-card-download"
        aria-label={`Save ${title} card`}
        title={`Save ${title}`}
        disabled={isDownloading}
        onClick={() => void handleDownload()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-download-icon lucide-download"
          aria-hidden="true"
        >
          <path d="M12 15V3" />
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
    </div>
  );
};

export default DownloadableCard;
