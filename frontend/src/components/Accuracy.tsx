import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Gauge, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { compact, dayTime, mw, pct, shortDate, signedMw } from "../lib/format";
import type { Palette } from "../lib/theme";
import type { Accuracy as AccuracyData, HorizonRow } from "../lib/types";
import { Card, ErrorNote, LegendItem, Segmented, Skeleton, Stat, TooltipBox } from "./ui";

type Rule = "gate" | "horizon";

export function Accuracy({ start, end, setStart, setEnd, min, max, gate, lookback, palette }: {
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  min: string;
  max: string;
  gate: string;
  lookback: number;
  palette: Palette;
}) {
  const [rule, setRule] = useState<Rule>("gate");
  const [horizon, setHorizon] = useState(24);
  const [debouncedHorizon, setDebouncedHorizon] = useState(24);
  const [data, setData] = useState<AccuracyData | null>(null);
  const [curve, setCurve] = useState<HorizonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedHorizon(horizon), 250);
    return () => clearTimeout(t);
  }, [horizon]);

  useEffect(() => {
    let live = true;
    setError(null);
    api
      .accuracy({ start, end, rule, gate, horizon: debouncedHorizon })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [start, end, rule, gate, debouncedHorizon]);

  useEffect(() => {
    let live = true;
    api
      .horizonCurve(start, end)
      .then((d) => live && setCurve(d))
      .catch(() => live && setCurve([]));
    return () => {
      live = false;
    };
  }, [start, end]);

  const s = data?.summary;
  const corrected = data?.bias_corrected;
  const series = useMemo(() => (data?.series ?? []).map((r) => ({ x: Date.parse(r.t), a: r.a, f: r.f })), [data]);
  const improvement = s && corrected?.n ? 1 - corrected.mae / s.mae : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hidden text-[12px] font-medium uppercase tracking-wider text-[var(--accent)] sm:block">Forecast accuracy</p>
          <h2 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight sm:text-[26px]">
            <span className="sm:hidden">Forecast accuracy</span>
            <span className="hidden sm:inline">How far can the forecast be trusted?</span>
          </h2>
          <p className="mt-1 hidden text-[14px] text-[var(--ink-2)] sm:block">
            Every hour from {shortDate(start)} to {shortDate(end)}, scored against metered outturn. Error = forecast − actual.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input type="date" aria-label="From" className="field h-10 min-w-0 flex-1 tabular sm:h-9 sm:flex-none" value={start} min={min} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} />
          <span className="text-[var(--muted)]">→</span>
          <input type="date" aria-label="To" className="field h-10 min-w-0 flex-1 tabular sm:h-9 sm:flex-none" value={end} min={start} max={max} onChange={(e) => e.target.value && setEnd(e.target.value)} />
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:p-4">
        <span className="hidden text-[13px] font-medium text-[var(--ink-2)] sm:inline">Score the forecast that was available</span>
        <Segmented
          label="Forecast selection rule"
          value={rule}
          onChange={setRule}
          options={[
            { value: "gate", label: `At gate closure (${gate} D-1)` },
            { value: "horizon", label: "A fixed time ahead" },
          ]}
        />
        {rule === "horizon" && (
          <label className="flex items-center gap-3 text-[13px] text-[var(--ink-2)]">
            <input type="range" min={1} max={48} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="w-40" />
            <span className="tabular w-28 font-medium text-[var(--ink)]">≥ {horizon} h before</span>
          </label>
        )}
        {s && (
          <span className="hidden text-[12px] text-[var(--muted)] sm:ml-auto sm:inline">
            {data!.coverage.paired_hours}/{data!.coverage.expected_hours} hours scored · median lead {s.median_lead_hours} h
          </span>
        )}
      </div>

      {error && <ErrorNote message={error} />}

      <div className="card tile-row p-3 sm:p-4">
        <Stat
          accent="violet"
          icon={<Gauge size={18} />}
          label="Typical miss (MAE)"
          short="Typical miss"
          value={s ? mw(s.mae) : "…"}
          hint={s && `${pct(s.nmae, 1)} of average wind output`}
          back="How far off the forecast is in a typical hour, ignoring direction. Average of |forecast − actual| over every scored hour."
        />
        <Stat
          accent="peach"
          icon={<Scale size={18} />}
          label="Bias"
          value={s ? signedMw(s.bias) : "…"}
          hint={s && `Too high in ${pct(s.share_over)} of hours — desk ends ${s.bias > 0 ? "short" : "long"}`}
          tone={s && Math.abs(s.bias) > s.mae / 2 ? "bad" : undefined}
          back="Which way the forecast leans. Average of (forecast − actual): positive means less wind than planned, so the desk buys the gap late at a higher price."
        />
        <Stat
          accent="blue"
          icon={<ShieldCheck size={18} />}
          label="Buffer for 90% of hours"
          short="90% buffer"
          value={s ? mw(s.p90_abs) : "…"}
          hint={s && `Half of hours within ${mw(s.median_abs)}`}
          back="The safety margin that covers 9 hours out of 10. The 90th percentile of |forecast − actual|."
        />
        <Stat
          accent="green"
          icon={<Sparkles size={18} />}
          label="With bias correction"
          short="Corrected"
          value={improvement != null ? <span style={{ color: "var(--good)" }}>−{pct(improvement)} error</span> : s ? "–" : "…"}
          hint={
            improvement != null && s && corrected
              ? `MAE ${mw(s.mae)} → ${mw(corrected.mae)}`
              : s && "Available for the gate-closure rule"
          }
          back={
            corrected?.n
              ? `Subtract the forecast's average error over the previous ${lookback} complete days (known at gate closure) from every hour. The 90% buffer falls to ${mw(corrected.p90_abs)}.`
              : `Subtract the forecast's average error over the previous ${lookback} complete days from every hour.`
          }
        />
      </div>

      <Card title="Forecast vs outturn" subtitle="Drag the handles below the chart to zoom into a period">
        {!data ? (
          <Skeleton h={360} />
        ) : (
          <>
            <div className="chart-box h-[260px] sm:h-[360px]">
              <ResponsiveContainer>
                <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="x"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(x) => shortDate(new Date(x).toISOString())}
                    tick={{ fill: palette.muted, fontSize: 11 }}
                    stroke={palette.axis}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis tickFormatter={compact} tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<SeriesTooltip palette={palette} />} cursor={{ stroke: palette.axis }} />
                  <Line dataKey="f" stroke={palette.forecast} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
                  <Line dataKey="a" stroke={palette.actual} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
                  <Brush
                    dataKey="x"
                    height={26}
                    stroke={palette.axis}
                    fill={palette.surface}
                    travellerWidth={8}
                    tickFormatter={(x) => shortDate(new Date(x).toISOString())}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <LegendItem color={palette.forecast} label={rule === "gate" ? `Forecast at ${gate} D-1` : `Forecast ≥ ${debouncedHorizon} h ahead`} />
              <LegendItem color={palette.actual} label="Outturn (FUELHH)" />
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Error by lead time" subtitle="Latest forecast published at least N hours before each hour">
          {!curve ? <Skeleton h={260} /> : <HorizonChart rows={curve} palette={palette} marker={s?.median_lead_hours} />}
        </Card>
        <Card title="Error by hour of day" subtitle="Mean absolute error, UK time">
          {!data ? <Skeleton h={260} /> : <HourChart rows={data.by_hour} palette={palette} />}
        </Card>
      </div>
    </div>
  );
}

const axisProps = (palette: Palette) => ({
  tick: { fill: palette.muted, fontSize: 11 },
  tickLine: false,
});

function HorizonChart({ rows, palette, marker }: { rows: HorizonRow[]; palette: Palette; marker?: number }) {
  return (
    <>
      <div className="chart-box h-[200px] sm:h-[260px]">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis dataKey="horizon_hours" type="number" domain={[0, 48]} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]} unit="h" stroke={palette.axis} {...axisProps(palette)} />
            <YAxis tickFormatter={compact} axisLine={false} width={38} domain={[0, "auto"]} {...axisProps(palette)} />
            {marker != null && (
              <ReferenceLine x={marker} stroke={palette.muted} strokeDasharray="3 3" label={{ value: "gate closure", position: "insideTopRight", fill: palette.muted, fontSize: 11 }} />
            )}
            <Tooltip
              cursor={{ stroke: palette.axis }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as HorizonRow;
                return (
                  <TooltipBox
                    title={`Published ≥ ${r.horizon_hours} h ahead`}
                    rows={[
                      { color: palette.forecast, label: "MAE", value: mw(r.mae) },
                      { color: palette.over, label: "Bias", value: signedMw(r.bias) },
                      { label: "90% buffer", value: mw(r.p90_abs) },
                      { label: "Hours", value: String(r.n) },
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="mae" stroke={palette.forecast} strokeWidth={2} dot={{ r: 3.5, fill: palette.forecast, stroke: palette.surface, strokeWidth: 2 }} isAnimationActive={false} />
            <Line dataKey="bias" stroke={palette.over} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <LegendItem color={palette.forecast} label="MAE" />
        <LegendItem color={palette.over} label="Bias" dashed />
      </div>
    </>
  );
}

function HourChart({ rows, palette }: { rows: AccuracyData["by_hour"]; palette: Palette }) {
  const worst = Math.max(...rows.map((r) => r.mae));
  return (
    <div className="chart-box h-[200px] sm:h-[260px]">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, "0")}`} interval={2} stroke={palette.axis} {...axisProps(palette)} />
          <YAxis tickFormatter={compact} axisLine={false} width={38} {...axisProps(palette)} />
          <Tooltip
            cursor={{ fill: palette.grid, fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as AccuracyData["by_hour"][number];
              return (
                <TooltipBox
                  title={`${String(r.hour).padStart(2, "0")}:00 – ${String(r.hour).padStart(2, "0")}:59`}
                  rows={[
                    { color: palette.actual, label: "MAE", value: mw(r.mae) },
                    { label: "Bias", value: signedMw(r.bias) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="mae" maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.hour} fill={palette.actual} fillOpacity={r.mae === worst ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SeriesTooltip({ active, payload, label, palette }: {
  active?: boolean;
  payload?: { payload: { a: number | null; f: number | null } }[];
  label?: number;
  palette: Palette;
}) {
  if (!active || !payload?.length || label == null) return null;
  const { a, f } = payload[0].payload;
  const rows = [];
  if (f != null) rows.push({ color: palette.forecast, label: "Forecast", value: mw(f) });
  if (a != null) rows.push({ color: palette.actual, label: "Outturn", value: mw(a) });
  if (a != null && f != null) rows.push({ label: "Error", value: signedMw(f - a) });
  return <TooltipBox title={dayTime(new Date(label).toISOString())} rows={rows} />;
}
