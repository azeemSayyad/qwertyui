import pandas as pd
import pytest

from app import metrics


@pytest.fixture
def paired():
    # The worked example from the README: six hours of 15 Jan.
    hours = ["00", "04", "08", "12", "18", "22"]
    forecast = [10200, 9800, 9400, 9000, 8900, 9600]
    actual = [10600, 9500, 8700, 8200, 7500, 9800]
    df = pd.DataFrame(
        {
            "start_time": [pd.Timestamp(f"2026-01-15T{h}:00Z") for h in hours],
            "forecast": forecast,
            "actual": actual,
            "lead_hours": [26.0] * 6,
        }
    )
    df["error"] = df["forecast"] - df["actual"]
    return df


def test_summary_matches_hand_calculation(paired):
    s = metrics.summary(paired)
    assert s["n"] == 6
    assert s["mae"] == 633  # 3800 / 6
    assert s["bias"] == 433  # 2600 / 6
    assert s["rmse"] == 751  # sqrt(3_380_000 / 6)
    assert s["share_over"] == pytest.approx(4 / 6, abs=1e-3)


def test_empty_input_is_safe():
    empty = pd.DataFrame(columns=["start_time", "forecast", "actual", "lead_hours", "error"])
    assert metrics.summary(empty) == {"n": 0}
    assert metrics.by_hour(empty) == []


def test_error_band_needs_a_day_of_history(paired):
    assert metrics.error_band(paired) is None
