"""Thin client for the two Elexon BMRS stream endpoints used by the app.

WINDFOR  - wind generation forecasts, filtered by *publish* time.
FUELHH   - half-hourly outturn generation by fuel type, filtered by settlement date.
"""

from __future__ import annotations

import time as _time
from datetime import date, timedelta

import httpx
import pandas as pd

from . import config

CHUNK_DAYS = 7


def _get(path: str, params: dict) -> list[dict]:
    url = f"{config.ELEXON_BASE_URL}{path}"
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = httpx.get(url, params=params, timeout=config.ELEXON_TIMEOUT_S)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            _time.sleep(0.5 * 2**attempt)
    raise RuntimeError(f"Elexon request failed: {url} {params}") from last_error


def _chunks(start: date, end: date):
    """Yield inclusive [from, to] date pairs of at most CHUNK_DAYS days."""
    cursor = start
    while cursor <= end:
        stop = min(cursor + timedelta(days=CHUNK_DAYS - 1), end)
        yield cursor, stop
        cursor = stop + timedelta(days=1)


def fetch_forecasts(publish_from: date, publish_to: date) -> pd.DataFrame:
    """All WINDFOR rows published on days publish_from..publish_to (UTC, inclusive)."""
    rows: list[dict] = []
    for lo, hi in _chunks(publish_from, publish_to):
        rows += _get(
            "/datasets/WINDFOR/stream",
            {
                "publishDateTimeFrom": f"{lo.isoformat()}T00:00:00Z",
                "publishDateTimeTo": f"{(hi + timedelta(days=1)).isoformat()}T00:00:00Z",
            },
        )
    return normalise_forecasts(rows)


def fetch_actuals(settlement_from: date, settlement_to: date) -> pd.DataFrame:
    """FUELHH WIND outturn for settlement days settlement_from..settlement_to (inclusive)."""
    rows: list[dict] = []
    for lo, hi in _chunks(settlement_from, settlement_to):
        rows += _get(
            "/datasets/FUELHH/stream",
            {"settlementDateFrom": lo.isoformat(), "settlementDateTo": hi.isoformat(), "fuelType": "WIND"},
        )
    return normalise_actuals(rows)


def normalise_forecasts(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    df = df.dropna().drop_duplicates(["publishTime", "startTime"], keep="last")
    return df.rename(columns={"publishTime": "publish_time", "startTime": "start_time", "generation": "forecast"})


def normalise_actuals(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["startTime", "fuelType", "generation"])
    df = df[df["fuelType"] == "WIND"].copy()
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    df = df.dropna().drop_duplicates("startTime", keep="last")
    return df[["startTime", "generation"]].rename(columns={"startTime": "start_time", "generation": "actual"})
