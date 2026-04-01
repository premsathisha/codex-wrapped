import type { ThemeName } from "../lib/themePalettes";
import { ChevronDown } from "lucide-react";
import { Spinner } from "@shared/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";

interface SidebarProps {
  selectedTheme: ThemeName;
  themeOptions: Array<{ value: ThemeName; label: string }>;
  onThemeChange: (value: ThemeName) => void;
  selectedRange: string;
  rangeOptions: Array<{ value: string; label: string }>;
  onRangeChange: (value: string) => void;
  selectedTimeZone: string;
  timeZoneOptions: Array<{ value: string; label: string }>;
  onTimeZoneChange: (value: string) => void;
  timeZoneDisabled?: boolean;
  rangeDisabled?: boolean;
  isScanning: boolean;
}

const Sidebar = ({
  selectedTheme,
  themeOptions,
  onThemeChange,
  selectedRange,
  rangeOptions,
  onRangeChange,
  selectedTimeZone,
  timeZoneOptions,
  onTimeZoneChange,
  timeZoneDisabled = false,
  rangeDisabled = false,
  isScanning,
}: SidebarProps) => {
  return (
    <header className="w-full">
      <div className="wrapped-nav-solid w-full px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[68rem] items-center justify-between gap-3">
          <div className="wrapped-nav-content flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[#E4E4E6]">Codex Wrapped</p>
            {isScanning && (
              <span className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-[#BBC4CF]">
                <Spinner className="size-3.5 text-[#BBC4CF]" />
                Scanning...
              </span>
            )}
          </div>

          <div className="wrapped-nav-content flex items-center gap-2 sm:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Theme and range settings"
                className="wrapped-nav-select inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition enabled:focus:border-sky-300 sm:text-sm"
              >
                Display
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="min-w-48 rounded-lg border border-white/12 bg-[#171717] p-1 text-[#FAFAFA] shadow-xl ring-0"
              >
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="rounded-md px-2 py-1.5 text-sm text-[#FAFAFA] focus:bg-white/10 focus:text-[#FAFAFA]">
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-40 rounded-lg border border-white/12 bg-[#171717] p-1 text-[#FAFAFA] ring-0">
                    <DropdownMenuRadioGroup
                      value={selectedTheme}
                      onValueChange={(value) => {
                        onThemeChange(value as ThemeName);
                      }}
                    >
                      {themeOptions.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          value={option.value}
                          className="rounded-md px-2 py-1.5 text-sm text-[#FAFAFA] focus:bg-white/10 focus:text-[#FAFAFA]"
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    disabled={rangeDisabled}
                    className="rounded-md px-2 py-1.5 text-sm text-[#FAFAFA] focus:bg-white/10 focus:text-[#FAFAFA] data-disabled:opacity-45"
                  >
                    Range
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-40 rounded-lg border border-white/12 bg-[#171717] p-1 text-[#FAFAFA] ring-0">
                    <DropdownMenuRadioGroup
                      value={selectedRange}
                      onValueChange={(value) => {
                        onRangeChange(value);
                      }}
                    >
                      {rangeOptions.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          value={option.value}
                          className="rounded-md px-2 py-1.5 text-sm text-[#FAFAFA] focus:bg-white/10 focus:text-[#FAFAFA]"
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    disabled={timeZoneDisabled}
                    className="rounded-md px-2 py-1.5 text-sm text-[#FAFAFA] focus:bg-white/10 focus:text-[#FAFAFA] data-disabled:opacity-45"
                  >
                    Time Zone
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-44 rounded-lg border border-white/12 bg-[#171717] p-1 text-[#FAFAFA] ring-0">
                    <DropdownMenuRadioGroup
                      value={selectedTimeZone}
                      onValueChange={(value) => {
                        onTimeZoneChange(value);
                      }}
                    >
                      {timeZoneOptions.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          value={option.value}
                          className="rounded-md px-2 py-1.5 text-sm text-[#FAFAFA] focus:bg-white/10 focus:text-[#FAFAFA]"
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Sidebar;
