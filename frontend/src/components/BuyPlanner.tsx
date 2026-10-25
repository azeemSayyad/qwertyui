import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ShoppingCart } from "lucide-react";
import { compact, gwh, mw, time } from "../lib/format";
import type { Palette } from "../lib/theme";
import type { Decision } from "../lib/types";
import { Card, LegendItem, Segmented, TooltipBox } from "./ui";

type Mode = "raw" | "balanced" | "cautious";

const MODES: { value: Mode; label: string; wind: string }[] = [
  { value: "raw", label: "Trust forecast", wind: "the raw forecast" },
  { value: "balanced", label: "Balanced", wind: "the bias-adjusted forecast" },
  { value: "cautious", label: "Cautious", wind: "the low end of the likely range" },
];

/** Wind the desk plans on for one hour under each risk preference. */
function plannedWind(p: Decision["forecast"][number], mode: Mode): number {
  if (mode === "balanced") return p.adj ?? p.v;
  if (mode === "cautious") return p.lo ?? p.v;
  return p.v;
}

/**
 * Illustrative day-ahead volume: buy = demand − planned wind, per hour.
 * Demand is the trader's own input; the brief allows no data beyond Elexon wind.
 */
export function BuyPlanner({ data, palette }: { data: Decision; palette: Palette }) {
  const [demand, setDemand] = useState(30000);
  const hasBand = data.band != null;
  const [mode, setMode] = useState<Mode>(hasBand ? "balanced" : "raw");
  const activeMode = hasBand ? mode : "raw";

  const actualAt = useMemo(() => new Map(data.actual.map((p) => [p.t, p.v])), [data]);

  const rows = data.forecast.map((p) => {
    const wind = Math.min(plannedWind(p, activeMode), demand);
    return { t: p.t, wind, buy: Math.max(0, demand - wind) };
  });
  const totalBuy = rows.reduce((sum, r) => sum + r.buy, 0);

  // Hindsight: short/surplus depends only on planned vs actual wind, so demand cancels out.
  const scored = MODES.filter((m) => hasBand || m.value === "raw").map((m) => {
    let short = 0;
    let surplus = 0;
    let bought = 0;
    for (const p of data.forecast) {
      const planned = Math.min(plannedWind(p, m.value), demand);
      bought += Math.max(0, demand - planned);
      const actual = actualAt.get(p.t);
      if (actual == null) continue;
      const gap = planned - Math.min(actual, demand);
      if (gap > 0) short += gap;
      else surplus -= gap;
    }
    return { ...m, bought, short, surplus };
  });
  const hasOutturn = data.actual.length > 0;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <ShoppingCart size={15} aria-hidden /> What to buy
        </span>
      }
      subtitle="Illustrative: enter your own expected demand. Wind here is national; a live rollout would use your portfolio's share."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-5">
          <label className="block">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[var(--muted)]">Your expected demand</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={500}
                value={demand}
                onChange={(e) => setDemand(Math.max(0, Number(e.target.value) || 0))}
                className="field tabular h-10 w-full text-[16px]"
                aria-label="Expected demand in MW"
              />
              <span className="text-[13px] text-[var(--ink-2)]">MW</span>
            </div>
            <span className="mt-1 hidden text-[12px] text-[var(--muted)] sm:block">Flat across the day, from your own demand forecast</span>
          </label>

          <div>
            <span className="text-[12px] font-medium uppercase tracking-wider text-[var(--muted)]">Plan wind on</span>
            <div className="mt-2">
              <Segmented
                label="Risk preference"
                value={activeMode}
                onChange={setMode}
                options={MODES.filter((m) => hasBand || m.value === "raw").map(({ value, label }) => ({ value, label }))}
              />
            </div>
            <span className="mt-1 hidden sm:block text-[12px] text-[var(--muted)]">
              Uses {MODES.find((m) => m.value === activeMode)!.wind}
            </span>
          </div>

          <div className="rounded-2xl bg-[var(--surface-2)] p-4">
            <p className="text-[12px] text-[var(--muted)]">Buy on the day-ahead market</p>
            <p className="tabular mt-1 text-[22px] font-semibold leading-none tracking-tight sm:text-[28px]">{gwh(totalBuy)}</p>
            <p className="mt-1.5 text-[13px] text-[var(--ink-2)]">Average {mw(totalBuy / rows.length)} per hour</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="chart-box h-[200px] sm:h-[240px]">
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                <CartesianGrid stroke={palette.grid} vertical={false} />
                <XAxis dataKey="t" tickFormatter={time} interval={2} tick={{ fill: palette.muted, fontSize: 11 }} stroke={palette.axis} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
                <Tooltip
                  cursor={{ fill: palette.grid, fillOpacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload as (typeof rows)[number];
                    return (
                      <TooltipBox
                        title={time(r.t)}
                        rows={[
                          { label: "Demand", value: mw(demand) },
                          { color: palette.adjusted, label: "Planned wind", value: mw(r.wind) },
                          { color: palette.buy, label: "Buy", value: mw(r.buy) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="wind" stackId="d" fill={palette.adjusted} fillOpacity={0.35} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="buy" stackId="d" fill={palette.buy} maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <LegendItem color={palette.adjusted} label="Covered by planned wind" wash opacity={0.35} />
            <LegendItem color={palette.buy} label="Buy" wash opacity={1} />
          </div>
        </div>
      </div>

      {hasOutturn && (
        <div className="mt-6 rounded-xl border border-[var(--ring)]">
          <ul className="divide-y divide-[var(--ring)] sm:hidden">
            {scored.map((m) => (
              <li key={m.value} className={`px-3 py-3 ${m.value === activeMode ? "bg-[var(--accent-wash)]" : ""}`}>
                <p className="text-[13px] font-semibold">
                  {m.label} <span className="font-normal text-[var(--muted)]">· bought {gwh(m.bought)}</span>
                </p>
                <div className="tabular mt-1.5 grid grid-cols-2 gap-2 text-[12px]">
                  <span className="text-[var(--ink-2)]">
                    Short <b style={{ color: m.short > m.surplus ? "var(--bad)" : "var(--ink)" }}>{gwh(m.short)}</b>
                  </span>
                  <span className="text-[var(--ink-2)]">
                    Surplus <b className="text-[var(--ink)]">{gwh(m.surplus)}</b>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <table className="tabular hidden w-full text-[13px] sm:table">
            <thead className="bg-[var(--surface-2)] text-left text-[12px] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">In hindsight, plan wind on…</th>
                <th className="px-3 py-2 text-right font-medium">Bought</th>
                <th className="px-3 py-2 text-right font-medium">Short (buy late, expensive)</th>
                <th className="px-3 py-2 text-right font-medium">Surplus (sell back, cheap)</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((m) => (
                <tr key={m.value} className={`border-t border-[var(--ring)] ${m.value === activeMode ? "font-semibold" : ""}`}>
                  <td className="px-3 py-2">{m.label}</td>
                  <td className="px-3 py-2 text-right">{gwh(m.bought)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: m.short > m.surplus ? "var(--bad)" : undefined }}>{gwh(m.short)}</td>
                  <td className="px-3 py-2 text-right">{gwh(m.surplus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hidden border-t border-[var(--ring)] px-3 py-2 text-[12px] text-[var(--muted)] sm:block">
            Scored hourly against FUELHH outturn. Short and surplus depend only on planned vs actual wind, not on the demand you enter.
          </p>
        </div>
      )}
    </Card>
  );
}
