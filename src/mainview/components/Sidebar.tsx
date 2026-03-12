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
    <header className="w-full">
      <div className="wrapped-nav-solid w-full px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
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
      </div>
    </header>
  );
};

export default Sidebar;
