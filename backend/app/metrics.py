"""Error statistics. Convention throughout: error = forecast - actual (MW).

Positive error  -> forecast too high -> less wind than planned -> desk is short, buys late.
Negative error  -> forecast too low  -> more wind than planned -> desk is long, has surplus.
"""

from __future__ import annotations

import math

import pandas as pd

from .config import UK_TZ


def _r(x: float | None, nd: int = 0) -> float | None:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), nd)


def summary(paired: pd.DataFrame) -> dict:
    if paired.empty:
        return {"n": 0}
    err = paired["error"]
    abs_err = err.abs()
    mean_actual = paired["actual"].mean()
    return {
        "n": int(len(paired)),
        "mae": _r(abs_err.mean()),
        "rmse": _r(math.sqrt((err**2).mean())),
        "bias": _r(err.mean()),
        "median_abs": _r(abs_err.median()),
        "p90_abs": _r(abs_err.quantile(0.9)),
        "max_over": _r(err.max()),
        "max_under": _r(err.min()),
        # Share of the time the forecast was too high (desk short).
        "share_over": _r((err > 0).mean(), 3),
        "mean_actual": _r(mean_actual),
        "nmae": _r(abs_err.mean() / mean_actual, 4) if mean_actual else None,
        "median_lead_hours": _r(paired["lead_hours"].median(), 1),
    }


def by_hour(paired: pd.DataFrame) -> list[dict]:
    if paired.empty:
        return []
    hours = paired["start_time"].dt.tz_convert(UK_TZ).dt.hour
    grouped = paired.assign(hour=hours, abs_error=paired["error"].abs()).groupby("hour")
    return [
        {"hour": int(h), "mae": _r(g["abs_error"].mean()), "bias": _r(g["error"].mean()), "n": int(len(g))}
        for h, g in grouped
    ]


def error_band(paired: pd.DataFrame, low_q: float = 0.1, high_q: float = 0.9) -> dict | None:
    """Empirical 80% interval of the error, used to turn a point forecast into a likely range."""
    if len(paired) < 24:
        return None
    err = paired["error"]
    return {
        "low_error": _r(err.quantile(low_q)),
        "high_error": _r(err.quantile(high_q)),
        "mae": _r(err.abs().mean()),
        "bias": _r(err.mean()),
        "n": int(len(paired)),
    }
