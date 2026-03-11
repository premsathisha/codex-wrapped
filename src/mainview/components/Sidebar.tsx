import type { ChangeEvent } from "react";

interface SidebarProps {
  selectedRange: string;
  rangeOptions: Array<{ value: string; label: string }>;
  onRangeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  rangeDisabled?: boolean;
  showCostControls: boolean;
  costAgentFilter: string;
  costAgentOptions: Array<{ value: string; label: string }>;
  onCostAgentChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  costGroupBy: string;
  costGroupOptions: Array<{ value: string; label: string }>;
  onCostGroupByChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  costAgentDisabled: boolean;
  isScanning: boolean;
}

const Sidebar = ({
  selectedRange,
  rangeOptions,
  onRangeChange,
  rangeDisabled = false,
  showCostControls,
  costAgentFilter,
  costAgentOptions,
  onCostAgentChange,
  costGroupBy,
  costGroupOptions,
  onCostGroupByChange,
  costAgentDisabled,
  isScanning,
}: SidebarProps) => {

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full border border-white/15 bg-slate-950/45 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/90">AI Wrapped</p>
          {isScanning && (
            <span className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-cyan-300/80">
              <span className="scanning-dot" />
              Scanning...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <label htmlFor="wrapped-range-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-slate-300 sm:block">
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

          {showCostControls ? (
            <>
              <label htmlFor="wrapped-cost-agent-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-slate-300 sm:block">
                Agent
              </label>
              <select
                id="wrapped-cost-agent-select"
                value={costAgentFilter}
                onChange={onCostAgentChange}
                disabled={costAgentDisabled}
                aria-label="Cost agent filter"
                className="h-9 min-w-20 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition enabled:focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-28 sm:text-sm"
              >
                {costAgentOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                    {option.label}
                  </option>
                ))}
              </select>

              <label htmlFor="wrapped-cost-group-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-slate-300 sm:block">
                Group by
              </label>
              <select
                id="wrapped-cost-group-select"
                value={costGroupBy}
                onChange={onCostGroupByChange}
                aria-label="Cost chart grouping"
                className="h-9 min-w-20 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition focus:border-sky-300 sm:min-w-28 sm:text-sm"
              >
                {costGroupOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}

        </div>
      </div>
    </header>
  );
};

export default Sidebar;
