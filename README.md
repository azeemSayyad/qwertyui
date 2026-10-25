# Windsight: GB day-ahead wind forecast desk

A web app for a UK utility's day-ahead trading desk. It shows **the national wind forecast the desk
actually had at gate closure** and **how accurate that forecast is**, so the volume bought from the
day-ahead market can account for the forecast's error.

**Live app:** _<add Vercel URL here>_  ·  **Video walkthrough:** _<add YouTube link here>_

> **AI tools were used to build this project.** See [Use of AI tools](#use-of-ai-tools) for exactly how.

Data comes only from Elexon BMRS:
[`WINDFOR`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) (forecasts)
and [`FUELHH`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) with
`fuelType=WIND` (outturn). The scope is purchase decisions made in **January 2026**, i.e. delivery days
**2 Jan to 1 Feb 2026**.

---

## What the app does

| Section | Question it answers |
|---|---|
| **Decision desk** | "For tomorrow, what does the forecast say, and how wrong is it likely to be?" Pick a delivery day and see the forecast at gate closure, an 80% likely range, a bias-adjusted plan, then the outturn and the miss in hindsight. A **What to buy** card turns this into a volume: the trader enters their own expected demand (no external data), picks *Trust forecast / Balanced / Cautious*, and gets `buy = demand − planned wind` per hour, plus, for past days, how short or long each choice would have left them. |
| **Forecast accuracy** | "How far can the forecast be trusted?" MAE, bias, 90% buffer and the bias-correction gain (each tile flips to explain itself), forecast vs outturn, error vs lead time and error by hour of day across any window. |

The gate closure time (default **10:00 UK on D-1**) can be changed in the header, and every view updates.

### January 2026 results (gate closure 10:00 D-1)

| Metric | Raw forecast | With 14-day bias correction |
|---|---|---|
| MAE | 1,996 MW (17.7% of mean output) | **1,492 MW (−25%)** |
| Bias | +1,728 MW (too high in 84% of hours) | +472 MW |
| 90% buffer (P90 of \|error\|) | 4,184 MW | 3,281 MW |

- The forecast is **systematically higher** than metered output. Even forecasts published 1 hour ahead
  are about 1.5 GW high (see *Error by lead time*), so the gap is structural rather than weather error.
  This is consistent with wind curtailment and metering scope, which a weather-driven forecast does
  not model.
- Accuracy improves steadily as the lead time shortens (MAE 2.3 GW at 48 h down to 1.7 GW at 1 h).
- A simple rule, subtracting the bias of the previous 14 days that were complete at gate closure, cuts
  the typical miss by a quarter **without using any future information**.

---

## Key design decisions

1. **No hindsight leakage.** Each target hour is forecast many times (8 runs a day, each about 3 days
   ahead). For delivery day *D* the app takes the **latest run published at or before gate closure on
   D-1** (`selection.select_at_gate_closure`). Runs published after that are never used.
2. **Lead-time analysis.** `select_at_horizon(h)` takes the latest run published at least *h* hours
   before each target hour. This powers the *fixed time ahead* rule and the *Error by lead time* chart.
3. **Resolution.** WINDFOR is hourly and FUELHH half-hourly. Each hourly forecast is matched to the
   half-hour that **starts on the hour**, so no values are interpolated or invented.
4. **Time zones.** Delivery days and gate closures are computed in `Europe/London` (GMT/BST safe,
   with a test for it). January is GMT, so UK time equals UTC there.
5. **Likely range and bias adjustment** use only delivery days **D-15 … D-2**, the ones whose outturn
   was complete by gate closure. The same rule backs the "−25%" backtest.
6. **Error convention:** `error = forecast − actual`. Positive means less wind than planned, so the
   desk is short and buys late at a higher price.
7. **Data access.** The January window is bundled as a small snapshot (`backend/data`, ~150 KB), so
   the deployed app starts instantly and does not depend on Elexon being up. Any other window is
   fetched from Elexon on demand, in 7-day chunks with retries, and cached per day in memory.

---

## Repository layout

```
.
├── backend/                     Python API (FastAPI + pandas)
│   ├── app/
│   │   ├── main.py              HTTP routes and input validation
│   │   ├── service.py           Use cases: decision desk, accuracy, horizon curve, bias backtest
│   │   ├── selection.py         Which forecast counts (gate-closure and fixed-horizon rules)
│   │   ├── metrics.py           MAE, bias, RMSE, P90, by-hour, error band
│   │   ├── store.py             In-memory store: snapshot seed + on-demand Elexon top-up
│   │   ├── elexon.py            Elexon BMRS client (WINDFOR, FUELHH) and normalisation
│   │   ├── snapshot.py          CLI to refresh backend/data from Elexon
│   │   └── config.py            Settings (env-overridable)
│   ├── data/                    Bundled January 2026 snapshot (csv.gz + manifest)
│   ├── tests/                   pytest: selection rules, metrics, API end to end
│   ├── requirements*.txt
│   └── Dockerfile
├── frontend/                    React + TypeScript (Vite, Tailwind, Recharts)
│   ├── src/
│   │   ├── App.tsx              Layout and header (gate closure, theme)
│   │   ├── components/
│   │   │   ├── DecisionDesk.tsx Delivery-day view, likely range, runs, hindsight
│   │   │   ├── Accuracy.tsx     KPI tiles, timeline, lead-time and hour-of-day charts
│   │   │   ├── BuyPlanner.tsx   "What to buy" calculator (user-entered demand)
│   │   │   └── ui.tsx           Card, Stat, Segmented, Legend, Tooltip, Skeleton
│   │   └── lib/                 api client, types, formatting, theme palette
│   ├── nginx.conf               Serves the SPA and proxies /api in Docker
│   └── Dockerfile
├── api/index.py                 Vercel serverless entry (wraps backend/app)
├── vercel.json                  Vercel build + /api rewrite
├── requirements.txt             Python deps for the Vercel function
└── docker-compose.yml           Runs backend + frontend locally
```

---

## Running it

### Docker (one command)

```bash
docker compose up --build
# app: http://localhost:8080   API: http://localhost:8000/api/health   docs: http://localhost:8000/docs
```

### Without Docker

```bash
# API
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# UI (second terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api to :8000; override with VITE_PROXY_TARGET)
```

### Tests and checks

```bash
cd backend && pytest          # 14 tests: selection rules, metrics, API over the snapshot
cd frontend && npm run lint && npm run build
```

### Refresh the data snapshot

```bash
cd backend && python -m app.snapshot                         # default pilot window
cd backend && python -m app.snapshot 2026-02-01 2026-02-28   # any delivery window
```

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/decision?delivery_date=2026-01-15&gate=10:00` | Forecast at gate closure, likely range, bias-adjusted plan, outturn |
| `GET /api/accuracy?start&end&rule=gate\|horizon&gate&horizon_hours` | Summary metrics, bias-corrected backtest, series, by-hour |
| `GET /api/horizon-curve?start&end` | MAE / bias / P90 by minimum lead time (1–48 h) |
| `GET /api/meta`, `GET /api/health` | Defaults and status |

Interactive docs at `/docs` when running the backend.

## Deployment (Vercel)

The repo deploys as one Vercel project: the Vite build is served statically and `api/index.py` runs
FastAPI as a Python serverless function (`vercel.json` rewrites `/api/*` to it).

```bash
vercel          # preview
vercel --prod   # production
```

To host the API elsewhere instead (e.g. Heroku with `backend/Dockerfile`, which honours `$PORT`),
build the frontend with `VITE_API_URL=https://<api-host>`.

## Use of AI tools

Yes, AI tools were used. This project was built with **Claude (Anthropic) via Claude Code** as an
AI pair programmer. It was used for:

- **Domain research:** the GB day-ahead market, gate closure, imbalance pricing and curtailment.
- **Data exploration:** calling the Elexon WINDFOR and FUELHH endpoints and inspecting the responses.
- **Code:** generating and refactoring the FastAPI backend, the React frontend, the Docker and Vercel config.
- **Tests and checks:** writing the pytest suite and taking browser screenshots to verify the UI.
- **Documentation:** drafting this README.

I directed the work and made the product decisions: what to show the trader, which forecast counts
at gate closure, the bias correction, and the UI changes. I reviewed the code and checked the results:
the tests pass, and key numbers (e.g. the 9,053 MW forecast vs 7,672 MW actual for 15 Jan 18:00) were
checked against the raw API responses.
