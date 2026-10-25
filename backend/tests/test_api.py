"""End-to-end over the bundled January snapshot (no network)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["forecast_rows"] > 0


def test_accuracy_default_window_is_complete(client):
    body = client.get("/api/accuracy").json()
    assert body["coverage"]["paired_hours"] == body["coverage"]["expected_hours"] == 31 * 24
    assert body["summary"]["mae"] > 0
    assert body["bias_corrected"]["mae"] < body["summary"]["mae"]


def test_decision_uses_run_published_before_gate(client):
    body = client.get("/api/decision", params={"delivery_date": "2026-01-15", "gate": "10:00"}).json()
    assert body["summary"]["publish_time"] == "2026-01-14T09:30:00Z"
    at_six = next(p for p in body["forecast"] if p["t"] == "2026-01-15T18:00:00Z")
    assert at_six["v"] == 9053
    assert at_six["lo"] <= at_six["v"] <= at_six["hi"]


def test_horizon_curve_errors_grow_with_lead_time(client):
    curve = client.get("/api/horizon-curve").json()
    assert curve[0]["horizon_hours"] == 1
    assert curve[0]["mae"] < curve[-1]["mae"]


def test_rejects_inverted_window(client):
    assert client.get("/api/accuracy", params={"start": "2026-01-10", "end": "2026-01-01"}).status_code == 422
