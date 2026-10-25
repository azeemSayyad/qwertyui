"""Refresh the bundled data snapshot from Elexon.

    python -m app.snapshot                         # default pilot window (January 2026 decisions)
    python -m app.snapshot 2026-02-01 2026-02-28   # any other delivery window
"""

from __future__ import annotations

import sys
from datetime import date

from . import config
from .store import DataStore


def main(argv: list[str]) -> None:
    start = date.fromisoformat(argv[0]) if argv else config.DEFAULT_START
    end = date.fromisoformat(argv[1]) if len(argv) > 1 else config.DEFAULT_END
    data = DataStore()
    data.ensure(start, end)
    data.save_snapshot()
    print(f"Saved {len(data.forecasts):,} forecast rows and {len(data.actuals):,} outturn rows to {config.SNAPSHOT_DIR}")


if __name__ == "__main__":
    main(sys.argv[1:])
