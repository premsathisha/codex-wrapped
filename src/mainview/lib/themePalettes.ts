export type ThemeName = "blue" | "green" | "gray" | "red" | "orange" | "teal" | "pink" | "purple";

export interface ThemePalette {
  none: string;
  less: string;
  slightlyLess: string;
  medium: string;
  high: string;
  veryHigh: string;
}

export const THEME_PALETTES: Record<ThemeName, ThemePalette> = {
  blue: {
    none: "#0F1A2B",
    less: "#17345A",
    slightlyLess: "#255A94",
    medium: "#3A84D8",
    high: "#73B1FF",
    veryHigh: "#D9ECFF",
  },
  green: {
    none: "#101F18",
    less: "#1A4330",
    slightlyLess: "#28704C",
    medium: "#3FA56A",
    high: "#78D89C",
    veryHigh: "#DDF8E7",
  },
  gray: {
    none: "#111216",
    less: "#242733",
    slightlyLess: "#3B4154",
    medium: "#636C85",
    high: "#A0A8BC",
    veryHigh: "#E6EAF2",
  },
  red: {
    none: "#2A1116",
    less: "#5A1C28",
    slightlyLess: "#943040",
    medium: "#D84A5F",
    high: "#FF7D95",
    veryHigh: "#FFDCE3",
  },
  orange: {
    none: "#2A1109",
    less: "#5A2412",
    slightlyLess: "#973715",
    medium: "#C14215",
    high: "#F87215",
    veryHigh: "#FFB971",
  },
  teal: {
    none: "#0F2224",
    less: "#1A4A4E",
    slightlyLess: "#28797D",
    medium: "#3FB0B3",
    high: "#78DDE0",
    veryHigh: "#D9F7F8",
  },
  pink: {
    none: "#25111F",
    less: "#4F1E42",
    slightlyLess: "#82306D",
    medium: "#C148A0",
    high: "#F07BCB",
    veryHigh: "#FFDDF3",
  },
  purple: {
    none: "#11132A",
    less: "#1F245E",
    slightlyLess: "#30368F",
    medium: "#4B4FD1",
    high: "#777BF8",
    veryHigh: "#D8DDFF",
  },
};

export const THEME_OPTIONS: Array<{ value: ThemeName; label: string }> = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "gray", label: "Gray" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "teal", label: "Teal" },
  { value: "pink", label: "Pink" },
  { value: "purple", label: "Purple" },
];
