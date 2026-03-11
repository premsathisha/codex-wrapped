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
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full border border-white/15 bg-slate-950/45 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.22em] text-[#E4E4E6]">AI Wrapped</p>
          {isScanning && (
            <span className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-cyan-300/80">
              <span className="scanning-dot" style={{ background: themePalette.high }} />
              Scanning...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <label htmlFor="wrapped-theme-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-[#D1D1D3] sm:block">
            Theme
          </label>
          <select
            id="wrapped-theme-select"
            value={selectedTheme}
            onChange={onThemeChange}
            aria-label="Dashboard theme"
            className="h-9 min-w-24 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition enabled:focus:border-sky-300 sm:min-w-28 sm:text-sm"
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
            className="h-9 min-w-24 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition enabled:focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-36 sm:text-sm"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                {option.label}
              </option>
            ))}
          </select>

        </div>
      </div>
    </header>
  );
};

export default Sidebar;
