export type Point = { t: string; v: number };

export type Meta = {
  default_start: string;
  default_end: string;
  default_gate: string;
  band_lookback_days: number;
  max_window_days: number;
  source: string;
};

export type Band = {
  low_error: number;
  high_error: number;
  mae: number;
  bias: number;
  n: number;
  from: string;
  to: string;
};

export type Decision = {
  delivery_date: string;
  gate_closure: string;
  forecast: (Point & { lo?: number; hi?: number; adj?: number })[];
  actual: Point[];
  band: Band | null;
  summary: {
    hours: number;
    publish_time?: string;
    energy_mwh?: number;
    mean_mw?: number;
    peak?: Point;
    trough?: Point;
    outturn?: { energy_mwh: number; mae: number; bias: number; complete: boolean };
  };
};

export type Summary = {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  median_abs: number;
  p90_abs: number;
  max_over: number;
  max_under: number;
  share_over: number;
  mean_actual: number;
  nmae: number;
  median_lead_hours: number;
};

export type Accuracy = {
  window: { start: string; end: string };
  rule: { kind: "gate" | "horizon"; gate: string; horizon_hours: number };
  summary: Summary;
  bias_corrected: Summary | null;
  coverage: { expected_hours: number; paired_hours: number };
  series: { t: string; a: number | null; f: number | null }[];
  by_hour: { hour: number; mae: number; bias: number; n: number }[];
};

export type HorizonRow = { horizon_hours: number; mae: number; rmse: number; bias: number; p90_abs: number; n: number };
