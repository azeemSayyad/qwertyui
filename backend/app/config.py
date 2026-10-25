"""Runtime settings. Everything is overridable through environment variables."""

from __future__ import annotations

import os
from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")
ELEXON_TIMEOUT_S = float(os.getenv("ELEXON_TIMEOUT_S", "30"))

# Bundled snapshot of the pilot window, so the app works offline and cold starts are instant.
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_DIR", Path(__file__).resolve().parent.parent / "data"))

# Pilot scope: purchase decisions made in January 2026 -> delivery days 2 Jan .. 1 Feb.
DEFAULT_START = date(2026, 1, 2)
DEFAULT_END = date(2026, 2, 1)

# GB day-ahead auctions close late morning on D-1; the trader's cut-off is configurable per request.
DEFAULT_GATE_CLOSURE = time(10, 0)

# Trailing window (in delivery days) used to estimate the error band shown on the decision desk.
BAND_LOOKBACK_DAYS = 14

MAX_WINDOW_DAYS = 62

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
