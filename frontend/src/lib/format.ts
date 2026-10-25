const UK = "Europe/London";

export const mw = (v: number | null | undefined, digits = 0) =>
  v == null ? "–" : `${v.toLocaleString("en-GB", { maximumFractionDigits: digits })} MW`;

export const signedMw = (v: number | null | undefined) =>
  v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-GB", { maximumFractionDigits: 0 })} MW`;

export const gwh = (mwh: number | null | undefined) =>
  mwh == null ? "–" : `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} GWh`;

export const compact = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k` : `${v}`;

export const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? "–" : `${(v * 100).toLocaleString("en-GB", { maximumFractionDigits: digits })}%`;

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: UK });

export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: UK,
  });

export const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: UK,
  });

export const longDate = (isoDay: string) =>
  new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: UK,
  });

export const dayLabel = (isoDay: string) =>
  new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: UK });

export const addDays = (isoDay: string, n: number) => {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
