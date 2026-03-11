import type { ChangeEvent } from "react";
import type { ThemeName, ThemePalette } from "../lib/themePalettes";

interface SidebarProps {
  selectedTheme: ThemeName;
  themeOptions: Array<{ value: ThemeName; label: string }>;
  onThemeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  themePalette: ThemePalette;
  selectedRange: string;
  rangeOptions: Array<{ value: string; label: string }>;
  onRangeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  rangeDisabled?: boolean;
  isScanning: boolean;
}

const Sidebar = ({
  selectedTheme,
  themeOptions,
  onThemeChange,
  themePalette,
  selectedRange,
  rangeOptions,
  onRangeChange,
  rangeDisabled = false,
  isScanning,
}: SidebarProps) => {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6">
      <div className="wrapped-nav-liquid pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="liquidGlass-effect" />
        <div className="liquidGlass-tint" />
        <div className="liquidGlass-shine" />

        <div className="wrapped-nav-content flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.22em] text-[#E4E4E6]">AI Wrapped</p>
          {isScanning && (
            <span className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-cyan-300/80">
              <span className="scanning-dot" style={{ background: themePalette.high }} />
              Scanning...
            </span>
          )}
        </div>

        <div className="wrapped-nav-content flex items-center gap-2 sm:gap-3">
          <label htmlFor="wrapped-theme-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-[#D1D1D3] sm:block">
            Theme
          </label>
          <select
            id="wrapped-theme-select"
            value={selectedTheme}
            onChange={onThemeChange}
            aria-label="Dashboard theme"
            className="wrapped-nav-select h-9 min-w-24 rounded-lg border px-3 text-xs font-medium outline-none transition enabled:focus:border-sky-300 sm:min-w-28 sm:text-sm"
          >
            {themeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                {option.label}
              </option>
            ))}
          </select>

          <label htmlFor="wrapped-range-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-[#D1D1D3] sm:block">
            Range
          </label>
          <select
            id="wrapped-range-select"
            value={selectedRange}
            onChange={onRangeChange}
            disabled={rangeDisabled}
            aria-label="Dashboard range"
            className="wrapped-nav-select h-9 min-w-24 rounded-lg border px-3 text-xs font-medium outline-none transition enabled:focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-36 sm:text-sm"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <svg className="wrapped-nav-filter" aria-hidden="true">
        <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.01" numOctaves="1" seed="5" result="turbulence" />
          <feComponentTransfer in="turbulence" result="mapped">
            <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
            <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
          </feComponentTransfer>
          <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
          <feSpecularLighting
            in="softMap"
            surfaceScale="5"
            specularConstant="1"
            specularExponent="100"
            lightingColor="white"
            result="specLight"
          >
            <fePointLight x="-200" y="-200" z="300" />
          </feSpecularLighting>
          <feComposite in="specLight" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage" />
          <feDisplacementMap in="SourceGraphic" in2="softMap" scale="150" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </header>
  );
};

export default Sidebar;
