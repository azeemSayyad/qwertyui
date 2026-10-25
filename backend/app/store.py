"""In-memory data store: seeded from the bundled snapshot, topped up from Elexon on demand.

Coverage is tracked per day so a request for a new window only downloads the days it is missing.
Days that are not finished yet (today and later) are never marked as covered, so they are
re-fetched on the next request and pick up newly published data.
"""

from __future__ import annotations

import json
import threading
from datetime import date, datetime, timedelta

import pandas as pd

from . import config, elexon

FORECAST_FILE = "windfor.csv.gz"
ACTUAL_FILE = "fuelhh_wind.csv.gz"
MANIFEST_FILE = "manifest.json"


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _merge(existing: pd.DataFrame, fresh: pd.DataFrame, key: list[str]) -> pd.DataFrame:
    if existing.empty:
        return fresh.reset_index(drop=True)
    if fresh.empty:
        return existing
    return pd.concat([existing, fresh]).drop_duplicates(key, keep="last").reset_index(drop=True)


class DataStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.forecasts = pd.DataFrame(columns=["publish_time", "start_time", "forecast"])
        self.actuals = pd.DataFrame(columns=["start_time", "actual"])
        self._forecast_days: set[date] = set()
        self._actual_days: set[date] = set()
        self._seeded = False

    def _seed(self) -> None:
        """Load the bundled snapshot once, lazily (serverless runtimes may skip ASGI lifespan)."""
        if not self._seeded:
            self._seeded = True
            self.load_snapshot()

    # ---- snapshot -------------------------------------------------------------------------
    def load_snapshot(self, directory=config.SNAPSHOT_DIR) -> bool:
        manifest_path = directory / MANIFEST_FILE
        if not manifest_path.exists():
            return False
        manifest = json.loads(manifest_path.read_text())
        forecasts = pd.read_csv(directory / FORECAST_FILE, parse_dates=["publish_time", "start_time"])
        actuals = pd.read_csv(directory / ACTUAL_FILE, parse_dates=["start_time"])
        with self._lock:
            self.forecasts = forecasts
            self.actuals = actuals
            self._forecast_days = set(_days(*map(date.fromisoformat, manifest["forecast_publish_days"])))
            self._actual_days = set(_days(*map(date.fromisoformat, manifest["actual_settlement_days"])))
        return True

    def save_snapshot(self, directory=config.SNAPSHOT_DIR) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        self.forecasts.sort_values(["publish_time", "start_time"]).to_csv(directory / FORECAST_FILE, index=False)
        self.actuals.sort_values("start_time").to_csv(directory / ACTUAL_FILE, index=False)
        manifest = {
            "source": config.ELEXON_BASE_URL,
            "created_at": datetime.now(tz=config.UK_TZ).isoformat(timespec="seconds"),
            "forecast_publish_days": [min(self._forecast_days).isoformat(), max(self._forecast_days).isoformat()],
            "actual_settlement_days": [min(self._actual_days).isoformat(), max(self._actual_days).isoformat()],
        }
        (directory / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2))

    # ---- on-demand fetch ------------------------------------------------------------------
    def ensure(self, start: date, end: date) -> None:
        """Make sure everything needed to evaluate delivery days start..end is loaded."""
        self._seed()
        today = datetime.now(tz=config.UK_TZ).date()
        # Forecasts for day D are published up to ~3 days earlier; the error band looks back further.
        publish_from = start - timedelta(days=config.BAND_LOOKBACK_DAYS + 3)
        publish_to = min(end, today)
        actual_from = start - timedelta(days=config.BAND_LOOKBACK_DAYS + 2)
        actual_to = min(end, today)

        with self._lock:
            missing_f = [d for d in _days(publish_from, publish_to) if d not in self._forecast_days]
            missing_a = [d for d in _days(actual_from, actual_to) if d not in self._actual_days]
            if missing_f:
                fresh = elexon.fetch_forecasts(missing_f[0], missing_f[-1])
                self.forecasts = _merge(self.forecasts, fresh, ["publish_time", "start_time"])
                self._forecast_days |= {d for d in missing_f if d < today}
            if missing_a:
                fresh = elexon.fetch_actuals(missing_a[0], missing_a[-1])
                self.actuals = _merge(self.actuals, fresh, ["start_time"])
                self._actual_days |= {d for d in missing_a if d < today}

    def snapshot(self) -> tuple[pd.DataFrame, pd.DataFrame]:
        self._seed()
        with self._lock:
            return self.forecasts, self.actuals


store = DataStore()
