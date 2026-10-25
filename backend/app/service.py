"""Use cases behind the HTTP endpoints. Pure functions of the store's data plus request params."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pandas as pd

from . import config, metrics
from .config import UK_TZ
from .selection import gate_closure_utc, pair_with_actuals, select_at_gate_closure, select_at_horizon
from .store import store

HORIZONS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48]


def _day_bounds(start: date, end: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    lo = pd.Timestamp(datetime.combine(start, time(0), tzinfo=UK_TZ)).tz_convert("UTC")
    hi = pd.Timestamp(datetime.combine(end + timedelta(days=1), time(0), tzinfo=UK_TZ)).tz_convert("UTC")
    return lo, hi


def _within(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    lo, hi = _day_bounds(start, end)
    return df[(df["start_time"] >= lo) & (df["start_time"] < hi)]


def _iso(ts) -> str | None:
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts).isoformat().replace("+00:00", "Z")


def _points(df: pd.DataFrame, value: str) -> list[dict]:
    return [{"t": _iso(t), "v": float(v)} for t, v in zip(df["start_time"], df[value])]


def _trailing_bias(paired: pd.DataFrame, day: date) -> float | None:
    """Mean error over the lookback window whose outturn was fully known at gate closure (<= D-2)."""
    days = paired["start_time"].dt.tz_convert(UK_TZ).dt.date
    lo, hi = day - timedelta(days=config.BAND_LOOKBACK_DAYS + 1), day - timedelta(days=2)
    window = paired[(days >= lo) & (days <= hi)]
    return float(window["error"].mean()) if len(window) >= 24 else None


def _bias_corrected(forecasts: pd.DataFrame, actuals: pd.DataFrame, start: date, end: date, gate: time) -> dict:
    """Backtest of a simple desk rule: subtract the trailing bias known at gate closure."""
    history_start = start - timedelta(days=config.BAND_LOOKBACK_DAYS + 1)
    paired = pair_with_actuals(
        select_at_gate_closure(_within(forecasts, history_start, end), gate), _within(actuals, history_start, end)
    )
    if paired.empty:
        return {"n": 0}
    days = paired["start_time"].dt.tz_convert(UK_TZ).dt.date
    corrected = []
    for day in sorted(d for d in days.unique() if start <= d <= end):
        bias = _trailing_bias(paired, day)
        if bias is not None:
            today = paired[days == day]
            corrected.append(today.assign(error=today["error"] - bias))
    return metrics.summary(pd.concat(corrected)) if corrected else {"n": 0}


def _select(forecasts: pd.DataFrame, rule: str, gate: time, horizon: float) -> pd.DataFrame:
    return select_at_gate_closure(forecasts, gate) if rule == "gate" else select_at_horizon(forecasts, horizon)


# ---- decision desk ------------------------------------------------------------------------
def decision(delivery: date, gate: time) -> dict:
    store.ensure(delivery, delivery)
    forecasts, actuals = store.snapshot()
    cutoff = gate_closure_utc(delivery, gate)

    day_forecasts = _within(forecasts, delivery, delivery)
    chosen = select_at_gate_closure(day_forecasts, gate)
    day_actuals = _within(actuals, delivery, delivery).sort_values("start_time")

    # Error band from the trailing delivery days whose outturn was fully known at gate closure (<= D-2).
    band_start = delivery - timedelta(days=config.BAND_LOOKBACK_DAYS + 1)
    band_end = delivery - timedelta(days=2)
    history = pair_with_actuals(
        select_at_gate_closure(_within(forecasts, band_start, band_end), gate), _within(actuals, band_start, band_end)
    )
    band = metrics.error_band(history)

    points = []
    for t, v in zip(chosen["start_time"], chosen["forecast"]):
        point = {"t": _iso(t), "v": float(v)}
        if band:
            point["lo"] = max(0.0, float(v) - band["high_error"])
            point["hi"] = float(v) - band["low_error"]
            point["adj"] = max(0.0, float(v) - band["bias"])
        points.append(point)

    summary: dict = {"hours": int(len(chosen))}
    if not chosen.empty:
        peak = chosen.loc[chosen["forecast"].idxmax()]
        trough = chosen.loc[chosen["forecast"].idxmin()]
        summary |= {
            "publish_time": _iso(chosen["publish_time"].max()),
            "energy_mwh": float(chosen["forecast"].sum()),
            "mean_mw": float(chosen["forecast"].mean()),
            "peak": {"t": _iso(peak["start_time"]), "v": float(peak["forecast"])},
            "trough": {"t": _iso(trough["start_time"]), "v": float(trough["forecast"])},
        }
    hindsight = pair_with_actuals(chosen, day_actuals)
    if not hindsight.empty:
        summary["outturn"] = {
            # Half-hourly MW -> MWh.
            "energy_mwh": float(day_actuals["actual"].sum() / 2),
            "mae": float(hindsight["error"].abs().mean()),
            "bias": float(hindsight["error"].mean()),
            "complete": len(day_actuals) >= 46,
        }

    return {
        "delivery_date": delivery.isoformat(),
        "gate_closure": _iso(cutoff),
        "forecast": points,
        "actual": _points(day_actuals, "actual"),
        "band": band and {**band, "from": band_start.isoformat(), "to": band_end.isoformat()},
        "summary": summary,
    }


# ---- accuracy over a window ---------------------------------------------------------------
def accuracy(start: date, end: date, rule: str, gate: time, horizon: float) -> dict:
    store.ensure(start, end)
    forecasts, actuals = store.snapshot()
    window_actuals = _within(actuals, start, end).sort_values("start_time")
    chosen = _select(_within(forecasts, start, end), rule, gate, horizon)
    paired = pair_with_actuals(chosen, window_actuals)

    stats = metrics.summary(paired)
    hours = metrics.by_hour(paired)

    series = window_actuals.merge(chosen[["start_time", "forecast"]], on="start_time", how="outer").sort_values(
        "start_time"
    )
    expected_hours = int((_day_bounds(start, end)[1] - _day_bounds(start, end)[0]).total_seconds() // 3600)

    return {
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "rule": {"kind": rule, "gate": gate.strftime("%H:%M"), "horizon_hours": horizon},
        "summary": stats,
        "bias_corrected": _bias_corrected(forecasts, actuals, start, end, gate) if rule == "gate" else None,
        "coverage": {"expected_hours": expected_hours, "paired_hours": stats["n"]},
        "series": [
            {
                "t": _iso(t),
                "a": None if pd.isna(a) else float(a),
                "f": None if pd.isna(f) else float(f),
            }
            for t, a, f in zip(series["start_time"], series["actual"], series["forecast"])
        ],
        "by_hour": hours,
    }


def horizon_curve(start: date, end: date) -> list[dict]:
    store.ensure(start, end)
    forecasts, actuals = store.snapshot()
    window_forecasts = _within(forecasts, start, end)
    window_actuals = _within(actuals, start, end)
    out = []
    for h in HORIZONS:
        stats = metrics.summary(pair_with_actuals(select_at_horizon(window_forecasts, h), window_actuals))
        if stats["n"]:
            out.append({"horizon_hours": h, **{k: stats[k] for k in ("mae", "rmse", "bias", "p90_abs", "n")}})
    return out
