import { useEffect, useState } from "react";

export type Mode = "light" | "dark";

// SVG presentation attributes can't resolve CSS variables reliably, so charts get resolved hexes.
// Categorical slots + diverging poles validated with the dataviz palette checker (light & dark steps).
const PALETTES = {
  light: {
    actual: "#6c47d9",
    forecast: "#eb6834",
    adjusted: "#1baf7a",
    buy: "#2a78d6",
    over: "#e34948",
    grid: "#eceaf4",
    axis: "#d9d6e6",
    muted: "#8a879a",
    surface: "#ffffff",
    ink: "#0b0b0b",
  },
  dark: {
    actual: "#9085e9",
    forecast: "#d95926",
    adjusted: "#199e70",
    buy: "#3987e5",
    over: "#e66767",
    grid: "#2b2938",
    axis: "#3a374a",
    muted: "#8f8ca3",
    surface: "#1b1a24",
    ink: "#f0efec",
  },
};

export type Palette = (typeof PALETTES)["light"];

function initialMode(): Mode {
  try {
    const saved = localStorage.getItem("windsight-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem("windsight-theme", mode);
    } catch {
      /* storage unavailable */
    }
  }, [mode]);
  return { mode, palette: PALETTES[mode], toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")) };
}
