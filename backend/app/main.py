"""FastAPI entry point. Routes validate input and delegate to `service`."""

from __future__ import annotations

from datetime import date, time
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import config, service
from .store import store

app = FastAPI(title="Windsight API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])


def _window(start: date, end: date) -> None:
    if end < start:
        raise HTTPException(422, "end must be on or after start")
    if (end - start).days + 1 > config.MAX_WINDOW_DAYS:
        raise HTTPException(422, f"window is limited to {config.MAX_WINDOW_DAYS} days")


@app.get("/api/health")
def health() -> dict:
    forecasts, actuals = store.snapshot()
    return {"status": "ok", "forecast_rows": len(forecasts), "actual_rows": len(actuals)}


@app.get("/api/meta")
def meta() -> dict:
    return {
        "default_start": config.DEFAULT_START.isoformat(),
        "default_end": config.DEFAULT_END.isoformat(),
        "default_gate": config.DEFAULT_GATE_CLOSURE.strftime("%H:%M"),
        "band_lookback_days": config.BAND_LOOKBACK_DAYS,
        "max_window_days": config.MAX_WINDOW_DAYS,
        "source": "Elexon BMRS: WINDFOR (forecast) and FUELHH fuelType=WIND (outturn)",
    }


@app.get("/api/decision")
def decision(
    delivery_date: date = Query(..., description="Delivery day (UK). The decision is taken on the day before."),
    gate: time = Query(config.DEFAULT_GATE_CLOSURE, description="Gate closure on D-1, UK local time"),
) -> dict:
    return service.decision(delivery_date, gate)


@app.get("/api/accuracy")
def accuracy(
    start: date = Query(config.DEFAULT_START),
    end: date = Query(config.DEFAULT_END),
    rule: Literal["gate", "horizon"] = Query("gate"),
    gate: time = Query(config.DEFAULT_GATE_CLOSURE),
    horizon_hours: float = Query(24, ge=0, le=72),
) -> dict:
    _window(start, end)
    return service.accuracy(start, end, rule, gate, horizon_hours)


@app.get("/api/horizon-curve")
def horizon_curve(start: date = Query(config.DEFAULT_START), end: date = Query(config.DEFAULT_END)) -> list[dict]:
    _window(start, end)
    return service.horizon_curve(start, end)
