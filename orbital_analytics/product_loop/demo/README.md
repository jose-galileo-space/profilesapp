# TideWatch demo dataset (E11)

Seeds a self-contained demo tenant so the GO_TO_MARKET §6 demo script has real-looking data.

## What it creates

- Tenant `demo-tenant` (Pro plan).
- 3 AOIs: Singapore Eastern Anchorage, Port of Rotterdam, Fujairah Anchorage, each with alert rules.
- 21 days of daily vessel-count observations per AOI.
  Rotterdam spikes in the last 7 days (drives a `surge_pct` alert and a visible week-over-week delta).
  Fujairah holds high counts and carries a `dark_vessel` rule (set `AIS_MODE=stub` on AlertsFunc to see it fire).
- A few recent OrbTable scenes so the dashboard shows imagery.
- Current-month usage counters.

## Run it

```bash
# Verify data generation without touching AWS:
python seed.py --dry-run

# Seed a deployed stack (table names from `cdk deploy` outputs or env):
export CORE_TABLE_NAME=<OrbitalStack CoreTable name>
export TABLE_NAME=<OrbitalStack OrbTable name>
python seed.py --region us-west-1
```

Idempotent: every item has a deterministic key, so re-running overwrites rather than duplicating.

## Verify after seeding

- `GET /v1/aois` lists the 3 AOIs.
- `GET /v1/aois/aoi-rotterdam/activity` shows the surge (last7 avg well above prev7).
- `GET /v1/usage` shows scenes/reports/AOIs for the month.
