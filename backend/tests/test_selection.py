from datetime import date, time

import pandas as pd

from app.selection import gate_closure_utc, pair_with_actuals, select_at_gate_closure, select_at_horizon


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def forecasts(rows):
    return pd.DataFrame(
        [{"publish_time": ts(p), "start_time": ts(s), "forecast": f} for p, s, f in rows],
    )


# The real runs for 15 Jan 2026 18:00 around the 10:00 gate on 14 Jan.
RUNS = forecasts(
    [
        ("2026-01-13T09:30Z", "2026-01-15T18:00Z", 10005),
        ("2026-01-14T07:30Z", "2026-01-15T18:00Z", 8962),
        ("2026-01-14T09:30Z", "2026-01-15T18:00Z", 9053),
        ("2026-01-14T11:30Z", "2026-01-15T18:00Z", 9151),
        ("2026-01-15T15:30Z", "2026-01-15T18:00Z", 8302),
    ]
)


def test_gate_closure_is_previous_day_uk_time():
    assert gate_closure_utc(date(2026, 1, 15), time(10)) == ts("2026-01-14T10:00Z")
    # Summer: 10:00 BST is 09:00 UTC.
    assert gate_closure_utc(date(2026, 7, 15), time(10)) == ts("2026-07-14T09:00Z")


def test_gate_rule_takes_latest_run_before_cutoff_and_never_a_later_one():
    chosen = select_at_gate_closure(RUNS, time(10))
    assert len(chosen) == 1
    row = chosen.iloc[0]
    assert row["forecast"] == 9053
    assert row["publish_time"] == ts("2026-01-14T09:30Z")
    assert row["lead_hours"] == 32.5


def test_gate_exactly_at_publish_time_is_eligible():
    chosen = select_at_gate_closure(RUNS, time(9, 30))
    assert chosen.iloc[0]["forecast"] == 9053


def test_horizon_rule_respects_minimum_lead():
    assert select_at_horizon(RUNS, 2).iloc[0]["forecast"] == 8302  # published 2.5h before
    assert select_at_horizon(RUNS, 3).iloc[0]["forecast"] == 9151  # 30.5h before
    assert select_at_horizon(RUNS, 40).iloc[0]["forecast"] == 10005


def test_target_with_no_eligible_run_is_dropped():
    late_only = RUNS[RUNS["publish_time"] > ts("2026-01-14T10:00Z")]
    assert select_at_gate_closure(late_only, time(10)).empty


def test_pairing_joins_hourly_forecast_to_half_hour_starting_on_the_hour():
    chosen = select_at_gate_closure(RUNS, time(10))
    actuals = pd.DataFrame(
        {"start_time": [ts("2026-01-15T18:00Z"), ts("2026-01-15T18:30Z")], "actual": [7672, 7593]}
    )
    paired = pair_with_actuals(chosen, actuals)
    assert len(paired) == 1
    assert paired.iloc[0]["error"] == 9053 - 7672
