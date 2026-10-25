import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ChevronLeft, ChevronRight, Clock3, Crosshair, SlidersHorizontal, Wind } from "lucide-react";
import { api } from "../lib/api";
import { addDays, compact, dayLabel, dayTime, gwh, longDate, mw, signedMw, time } from "../lib/format";
import type { Palette } from "../lib/theme";
import type { Decision } from "../lib/types";
import { BuyPlanner } from "./BuyPlanner";
import { Card, ErrorNote, LegendItem, Skeleton, Stat, TooltipBox } from "./ui";

type Row = { x: number; f?: number; band?: [number, number]; adj?: number; a?: number };

export function DecisionDesk({ day, setDay, gate, min, max, palette }: {
  day: string;
  setDay: (d: string) => void;
  gate: string;
  min: string;
  max: string;
  palette: Palette;
}) {
  const [data, setData] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    api
      .decision(day, gate)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [day, gate]);

  const rows = useMemo(() => buildRows(data), [data]);
  const s = data?.summary;
  const band = data?.band;
  const adjEnergy = s?.energy_mwh != null && band ? s.energy_mwh - band.bias * s.hours : undefined;
  const loading = !data || data.delivery_date !== day;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hidden text-[12px] font-medium uppercase tracking-wider text-[var(--accent)] sm:block">Decision desk</p>
          <h2 className="text-[20px] font-semibold leading-tight tracking-tight sm:mt-1 sm:text-[26px]">
            <span className="sm:hidden">Delivery {dayLabel(day)}</span>
            <span className="hidden sm:inline">Delivery {longDate(day)}</span>
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)] sm:hidden">
            <Clock3 size={12} aria-hidden className="mr-1 inline -translate-y-px" />
            Buy at {gate} {dayLabel(addDays(day, -1))}
            {s?.publish_time && <> · forecast {time(s.publish_time)}</>}
          </p>
          <p className="mt-1 hidden text-[14px] leading-relaxed text-[var(--ink-2)] sm:block">
            <Clock3 size={14} aria-hidden className="mr-1.5 inline -translate-y-px" />
            Buy decision at {gate} on {longDate(addDays(day, -1))}
            {s?.publish_time && <span> · using the forecast published {dayTime(s.publish_time)}</span>}
          </p>
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <button
            aria-label="Previous day"
            disabled={day <= min}
            onClick={() => setDay(addDays(day, -1))}
            className="field grid h-10 w-10 shrink-0 place-items-center p-0 disabled:opacity-40 sm:h-9 sm:w-9"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            aria-label="Delivery day"
            className="field h-10 min-w-0 flex-1 tabular sm:h-9 sm:flex-none"
            value={day}
            min={min}
            max={max}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
          <button
            aria-label="Next day"
            disabled={day >= max}
            onClick={() => setDay(addDays(day, 1))}
            className="field grid h-10 w-10 shrink-0 place-items-center p-0 disabled:opacity-40 sm:h-9 sm:w-9"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="card tile-row p-3 sm:p-4">
        <Stat
          accent="violet"
          icon={<Wind size={18} />}
          label="Forecast wind energy"
          short="Wind energy"
          back="Total wind energy forecast for the delivery day: the 24 hourly values of the run published before gate closure, added up."
          value={loading ? "…" : gwh(s?.energy_mwh)}
          hint={s?.mean_mw != null && `Average ${mw(s.mean_mw)} across the day`}
        />
        <Stat
          accent="blue"
          icon={<Activity size={18} />}
          label="Peak · trough"
          short="Peak · low"
          back="Highest and lowest hourly forecast of the day. Low-wind hours are where the desk has to buy the most."
          value={loading ? "…" : s?.peak ? `${compact(s.peak.v)} · ${compact(s.trough!.v)}` : "–"}
          hint={s?.peak && `MW at ${time(s.peak.t)} and ${time(s.trough!.t)}`}
        />
        <Stat
          accent="peach"
          icon={<Crosshair size={18} />}
          label="Likely actual vs forecast"
          short="Likely range"
          value={
            loading ? "…" : band ? (
              <>
                <span className="sm:hidden">
                  −{compact(Math.round(band.high_error))} / +{compact(Math.round(-band.low_error))}
                </span>
                <span className="hidden sm:inline">{relative(-band.high_error)}</span>{" "}
                <span className="hidden text-[15px] font-semibold text-[var(--ink-2)] sm:inline">to {relative(-band.low_error)}</span>
              </>
            ) : (
              "–"
            )
          }
          back={
            band
              ? `In 80% of hours over the last ${band.n / 24} days, the actual landed between ${compact(Math.round(band.high_error))} MW below and ${compact(Math.round(-band.low_error))} MW above the forecast.`
              : "Needs at least a day of history before this delivery day."
          }
          hint={
            band
              ? `MW, in 80% of hours over the last ${band.n / 24} days — forecast usually runs ${band.bias > 0 ? "high" : "low"}`
              : "Not enough history"
          }
        />
        <Stat
          accent="green"
          icon={<SlidersHorizontal size={18} />}
          label="Bias-adjusted plan"
          short="Adjusted plan"
          value={loading ? "…" : gwh(adjEnergy)}
          back={
            band
              ? `The forecast with its recent habit removed: every hour ${band.bias > 0 ? "minus" : "plus"} its average error over the last ${band.n / 24} complete days (${mw(Math.abs(band.bias))}).`
              : "Needs at least a day of history before this delivery day."
          }
          hint={band && `Forecast ${band.bias > 0 ? "minus" : "plus"} recent bias of ${mw(Math.abs(band.bias))}`}
        />
      </div>

      <Card
        title="Wind generation for the delivery day"
        subtitle="What the desk could see at gate closure, with the outturn revealed afterwards"
      >
        {loading ? (
          <Skeleton h={340} />
        ) : (
          <>
            <div className="chart-box h-[240px] sm:h-[340px]">
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickFormatter={(x) => time(new Date(x).toISOString())}
                    tick={{ fill: palette.muted, fontSize: 11 }}
                    stroke={palette.axis}
                    tickLine={false}
                    minTickGap={36}
                  />
                  <YAxis
                    tickFormatter={compact}
                    tick={{ fill: palette.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                    domain={[0, "auto"]}
                  />
                  <Tooltip content={<DayTooltip palette={palette} />} cursor={{ stroke: palette.axis }} />
                  {band && <Area dataKey="band" stroke="none" fill={palette.forecast} fillOpacity={0.12} isAnimationActive={false} connectNulls />}
                  {band && (
                    <Line dataKey="adj" stroke={palette.adjusted} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
                  )}
                  <Line dataKey="f" stroke={palette.forecast} strokeWidth={2.25} dot={false} connectNulls isAnimationActive={false} />
                  <Line dataKey="a" stroke={palette.actual} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  {s?.peak && (
                    <ReferenceDot x={Date.parse(s.peak.t)} y={s.peak.v} r={4} fill={palette.forecast} stroke={palette.surface} strokeWidth={2} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <LegendItem color={palette.forecast} label="Forecast at gate closure" />
              {band && <LegendItem color={palette.forecast} label="80% likely range" wash />}
              {band && <LegendItem color={palette.adjusted} label="Bias-adjusted" dashed />}
              <LegendItem color={palette.actual} label="Outturn (FUELHH)" />
            </div>
          </>
        )}
      </Card>

      {!loading && data && data.forecast.length > 0 && <BuyPlanner data={data} palette={palette} />}

      {!loading && s?.outturn && s.energy_mwh != null && (
        <Hindsight forecast={s.energy_mwh} adjusted={adjEnergy} outturn={s.outturn.energy_mwh} mae={s.outturn.mae} complete={s.outturn.complete} />
      )}
    </div>
  );
}

function Hindsight({ forecast, adjusted, outturn, mae, complete }: {
  forecast: number;
  adjusted?: number;
  outturn: number;
  mae: number;
  complete: boolean;
}) {
  const miss = forecast - outturn;
  const adjMiss = adjusted != null ? adjusted - outturn : null;
  const better = adjMiss != null && Math.abs(adjMiss) < Math.abs(miss);
  return (
    <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-[1.2fr_1fr_1fr_1fr] sm:items-center sm:p-5">
      <div className="col-span-2 sm:col-span-1">
        <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--muted)]">In hindsight</p>
        <p className="mt-1 hidden text-[14px] text-[var(--ink-2)] sm:block">
          {complete ? "Full-day outturn" : "Partial outturn"} vs what was planned at gate closure
        </p>
      </div>
      <Figure label="Actual wind energy" value={gwh(outturn)} />
      <Figure
        label="Forecast missed by"
        value={`${miss > 0 ? "+" : "−"}${gwh(Math.abs(miss))}`}
        note={`hourly MAE ${mw(mae)}`}
      />
      {adjMiss != null && (
        <Figure
          label="Bias-adjusted missed by"
          value={`${adjMiss > 0 ? "+" : "−"}${gwh(Math.abs(adjMiss))}`}
          note={better ? "closer than the raw forecast" : "raw forecast was closer"}
          tone={better ? "good" : "bad"}
        />
      )}
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]">{label}</p>
      <p className="tabular mt-0.5 text-[17px] font-semibold tracking-tight sm:text-[20px]">{value}</p>
      {note && (
        <p className="text-[12px]" style={{ color: tone ? `var(--${tone})` : "var(--ink-2)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

// Where the actual lands relative to the forecast, e.g. -4750 -> "4.8k lower".
const relative = (mwDelta: number) => `${compact(Math.abs(Math.round(mwDelta)))} ${mwDelta < 0 ? "lower" : "higher"}`;

function buildRows(data: Decision | null): Row[] {
  if (!data) return [];
  const byX = new Map<number, Row>();
  const at = (t: string) => {
    const x = Date.parse(t);
    let row = byX.get(x);
    if (!row) byX.set(x, (row = { x }));
    return row;
  };
  for (const p of data.forecast) {
    const row = at(p.t);
    row.f = p.v;
    if (p.lo != null && p.hi != null) row.band = [p.lo, p.hi];
    if (p.adj != null) row.adj = p.adj;
  }
  for (const p of data.actual) at(p.t).a = p.v;
  return [...byX.values()].sort((a, b) => a.x - b.x);
}

function DayTooltip({ active, payload, label, palette }: {
  active?: boolean;
  payload?: { payload: Row }[];
  label?: number;
  palette: Palette;
}) {
  if (!active || !payload?.length || label == null) return null;
  const row = payload[0].payload;
  const rows = [];
  if (row.f != null) rows.push({ color: palette.forecast, label: "Forecast", value: mw(row.f) });
  if (row.band) rows.push({ label: "Likely range", value: `${compact(Math.round(row.band[0]))}–${compact(Math.round(row.band[1]))}` });
  if (row.adj != null) rows.push({ color: palette.adjusted, label: "Bias-adjusted", value: mw(row.adj) });
  if (row.a != null) rows.push({ color: palette.actual, label: "Outturn", value: mw(row.a) });
  if (row.f != null && row.a != null) rows.push({ label: "Error", value: signedMw(row.f - row.a) });
  return <TooltipBox title={dayTime(new Date(label).toISOString())} rows={rows} />;
}
