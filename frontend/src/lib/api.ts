import type { Accuracy, Decision, HorizonRow, Meta } from "./types";

// Same origin by default (Vite proxy locally, Vercel rewrite in production).
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const response = await fetch(`${BASE}/api${path}${query.size ? `?${query}` : ""}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/meta"),
  decision: (deliveryDate: string, gate: string) => get<Decision>("/decision", { delivery_date: deliveryDate, gate }),
  accuracy: (p: { start: string; end: string; rule: "gate" | "horizon"; gate: string; horizon: number }) =>
    get<Accuracy>("/accuracy", { start: p.start, end: p.end, rule: p.rule, gate: p.gate, horizon_hours: p.horizon }),
  horizonCurve: (start: string, end: string) => get<HorizonRow[]>("/horizon-curve", { start, end }),
};
