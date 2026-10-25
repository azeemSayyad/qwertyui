"""Choosing *which* forecast counts for each target hour.

Every target hour is forecast many times (8 runs a day, each ~3 days ahead). Evaluating a
forecast that was published after the trader had to commit would leak hindsight into the
numbers, so every rule here keeps only runs whose publish time is at or before a cut-off and
then takes the latest of those.

Two cut-off rules are supported:

* gate closure  - the cut-off is a fixed clock time on the day before delivery (UK time).
                  This is what the day-ahead desk actually experiences.
* fixed horizon - the cut-off is `horizon_hours` before each target hour. Used to show how
                  accuracy changes with lead time.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pandas as pd

from .config import UK_TZ


def delivery_day(ts: pd.Series) -> pd.Series:
    """UK calendar day each UTC timestamp belongs to (handles GMT/BST)."""
    return ts.dt.tz_convert(UK_TZ).dt.date


def gate_closure_utc(day: date, gate: time) -> pd.Timestamp:
    """UTC instant of the cut-off for delivery day `day`: `gate` o'clock UK time on day-1."""
    local = datetime.combine(day - timedelta(days=1), gate, tzinfo=UK_TZ)
    return pd.Timestamp(local).tz_convert("UTC")


def _latest_per_target(eligible: pd.DataFrame) -> pd.DataFrame:
    idx = eligible.groupby("start_time")["publish_time"].idxmax()
    chosen = eligible.loc[idx].sort_values("start_time").reset_index(drop=True)
    chosen["lead_hours"] = (chosen["start_time"] - chosen["publish_time"]).dt.total_seconds() / 3600
    return chosen[["start_time", "publish_time", "forecast", "lead_hours"]]


def select_at_gate_closure(forecasts: pd.DataFrame, gate: time) -> pd.DataFrame:
    """Latest forecast per target hour published no later than gate closure on D-1."""
    if forecasts.empty:
        return _empty()
    df = forecasts.copy()
    days = delivery_day(df["start_time"])
    cutoffs = {d: gate_closure_utc(d, gate) for d in days.unique()}
    df["cutoff"] = days.map(cutoffs)
    return _latest_per_target(df[df["publish_time"] <= df["cutoff"]])


def select_at_horizon(forecasts: pd.DataFrame, horizon_hours: float) -> pd.DataFrame:
    """Latest forecast per target hour published at least `horizon_hours` before it."""
    if forecasts.empty:
        return _empty()
    cutoff = forecasts["start_time"] - pd.Timedelta(hours=horizon_hours)
    return _latest_per_target(forecasts[forecasts["publish_time"] <= cutoff])


def pair_with_actuals(chosen: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Join on the exact target time.

    WINDFOR is hourly and FUELHH half-hourly, so each forecast meets the outturn of the
    half-hour starting on the hour. Hours with either side missing are dropped.
    """
    paired = chosen.merge(actuals, on="start_time", how="inner")
    paired["error"] = paired["forecast"] - paired["actual"]
    return paired


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=["start_time", "publish_time", "forecast", "lead_hours"])
