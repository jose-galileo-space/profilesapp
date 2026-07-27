#!/usr/bin/env python3
"""
TideWatch demo seed (E11).

Provisions a self-contained demo tenant so a prospect sees value in minutes
(backs the demo script in product_loop/GO_TO_MARKET.md §6):

  - tenant `demo-tenant` (Pro plan)
  - 3 AOIs (Singapore anchorage, Rotterdam, Fujairah) with alert rules
  - 21 days of daily vessel-count Observations per AOI, incl. a surge at
    Rotterdam in the last 7 days and consistently high counts at Fujairah
    (which carries a dark_vessel rule; enable AIS_MODE=stub to see it fire)
  - a few recent OrbTable scenes so the dashboard shows imagery
  - current-month usage counters

Idempotent: every item has a deterministic key, so re-running overwrites.

Usage:
  python seed.py --core-table <CoreTable> --orb-table <OrbTable> [--region us-west-1]
  python seed.py --dry-run        # generate + summarize, no AWS calls
Table names default to env CORE_TABLE_NAME / TABLE_NAME.
"""
import argparse
import datetime
import json
import os

TENANT = "demo-tenant"

AOIS = [
    {
        "id": "aoi-sg-anchorage",
        "name": "Singapore Eastern Anchorage",
        "bbox": [103.75, 1.20, 104.10, 1.35],
        "base": 8,
        "surge": False,
        "dark": False,
        "rules": [
            {"id": "r1", "type": "surge_pct", "threshold": 40},
            {"id": "r2", "type": "vessel_max", "threshold": 60},
        ],
    },
    {
        "id": "aoi-rotterdam",
        "name": "Port of Rotterdam",
        "bbox": [3.95, 51.90, 4.20, 52.00],
        "base": 12,
        "surge": True,  # activity spike in the last 7 days
        "dark": False,
        "rules": [{"id": "r1", "type": "surge_pct", "threshold": 30}],
    },
    {
        "id": "aoi-fujairah",
        "name": "Fujairah Anchorage",
        "bbox": [56.30, 25.05, 56.45, 25.25],
        "base": 15,  # high counts; dark_vessel rule flags AIS gaps
        "surge": False,
        "dark": True,
        "rules": [{"id": "r1", "type": "dark_vessel", "threshold": 3}],
    },
]

DAYS = 21
RECENT_SCENES = 3  # OrbTable scenes seeded per AOI (most recent days)


def _polygon(bbox):
    x0, y0, x1, y1 = bbox
    return {
        "type": "Polygon",
        "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    }


def _vessel_count(aoi, day_ago):
    """Deterministic daily count; surge AOIs roughly double in the last week."""
    count = aoi["base"] + (day_ago % 3)  # mild deterministic variation
    if aoi["surge"] and day_ago <= 6:
        count = aoi["base"] * 2 + (6 - day_ago)  # ramps up toward today
    return count


def build_items(now):
    """Pure generator: returns {'core': [...], 'orb': [...]} for the given time."""
    core, orb = [], []
    month = now.strftime("%Y-%m")

    core.append({
        "pk": f"TENANT#{TENANT}", "sk": f"TENANT#{TENANT}",
        "entity": "TENANT", "tenantId": TENANT,
        "name": "Demo Maritime Desk", "plan": "pro",
        "createdAt": now.isoformat(),
    })

    scenes_analyzed = 0
    for aoi in AOIS:
        core.append({
            "pk": f"TENANT#{TENANT}", "sk": f"AOI#{aoi['id']}",
            "gsi1pk": f"AOI#{aoi['id']}", "gsi1sk": "META",
            "entity": "AOI", "aoiId": aoi["id"], "tenantId": TENANT,
            "name": aoi["name"], "geometry": _polygon(aoi["bbox"]),
            "bbox": aoi["bbox"], "revisit": "daily",
            "alertRules": aoi["rules"], "createdAt": now.isoformat(),
        })
        for day_ago in range(DAYS, 0, -1):
            ts = (now - datetime.timedelta(days=day_ago)).isoformat()
            image_id = f"{aoi['id']}-{day_ago:02d}"
            count = _vessel_count(aoi, day_ago)
            core.append({
                "pk": f"AOI#{aoi['id']}", "sk": f"OBS#{ts}#{image_id}",
                "entity": "OBS", "aoiId": aoi["id"], "imageId": image_id,
                "vesselCount": count, "byClass": {"ship": count},
                "sceneStatus": "ANALYZED",
            })
            scenes_analyzed += 1
            if day_ago <= RECENT_SCENES:
                orb.append({
                    "imageId": image_id, "ownerId": TENANT, "timestamp": ts,
                    "status": "COMPLETED", "aoiId": aoi["id"],
                    "vehicle_data": json.dumps(
                        [{"label": "ship", "confidence": "0.80",
                          "box": [10, 10, 20, 20]}] * min(count, 5)),
                    "gemini_analysis": json.dumps({
                        "overall_assessment":
                            f"{count} vessels observed at {aoi['name']}."}),
                })

    core.append({
        "pk": f"TENANT#{TENANT}", "sk": f"USAGE#{month}",
        "entity": "USAGE", "tenantId": TENANT,
        "scenesAnalyzed": scenes_analyzed,
        "reportsGenerated": 2, "aoiCount": len(AOIS),
    })
    return {"core": core, "orb": orb}


def _write(items, core_table, orb_table, region):
    import boto3
    ddb = boto3.resource("dynamodb", region_name=region)
    core = ddb.Table(core_table)
    orb = ddb.Table(orb_table)
    with core.batch_writer() as bw:
        for it in items["core"]:
            bw.put_item(Item=it)
    with orb.batch_writer() as bw:
        for it in items["orb"]:
            bw.put_item(Item=it)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--core-table", default=os.environ.get("CORE_TABLE_NAME"))
    ap.add_argument("--orb-table", default=os.environ.get("TABLE_NAME"))
    ap.add_argument("--region", default=os.environ.get("AWS_REGION", "us-west-1"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    now = datetime.datetime.now(datetime.timezone.utc)
    items = build_items(now)
    print(f"Generated {len(items['core'])} CoreTable + {len(items['orb'])} "
          f"OrbTable items for tenant '{TENANT}' across {len(AOIS)} AOIs.")

    if args.dry_run:
        print("DRY RUN — no AWS writes. Sample AOI:",
              json.dumps(items["core"][1], default=str)[:200])
        return
    if not args.core_table or not args.orb_table:
        raise SystemExit("ERROR: --core-table and --orb-table (or env) required")
    _write(items, args.core_table, args.orb_table, args.region)
    print(f"Seeded demo tenant into {args.core_table} / {args.orb_table}.")


if __name__ == "__main__":
    main()
