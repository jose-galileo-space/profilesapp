"""
AOI activity handler (TideWatch E4).

GET /v1/aois/{aoiId}/activity  -> vessel-count time series for an AOI plus a
week-over-week delta. Reads Observation rows written by the analytics step
(pk=AOI#<aoiId>, sk=OBS#<isoTs>#<imageId>). See product_loop/DATA_MODEL.md.

Cognito-protected: tenant comes from the JWT claim, and the AOI must belong to
that tenant (checked via GSI1) or the caller gets a 404.
"""
import json
import os
import datetime
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

CORE_TABLE_NAME = os.environ.get("CORE_TABLE_NAME")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(CORE_TABLE_NAME) if CORE_TABLE_NAME else None


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def _tenant_id(event):
    rc = event.get("requestContext") or {}
    claims = (rc.get("authorizer") or {}).get("claims") or {}
    return claims.get("custom:tenantId") or claims.get("sub") or "jose-test-user"


def _owns_aoi(aoi_id, tenant):
    """Confirm the AOI exists and belongs to tenant (via GSI1 META row)."""
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"AOI#{aoi_id}"),
    )
    for item in res.get("Items", []):
        if item.get("entity") == "AOI":
            return item.get("tenantId") == tenant
    return False


def _parse_ts(sk):
    # sk = OBS#<isoTs>#<imageId>
    try:
        return datetime.datetime.fromisoformat(sk.split("#", 2)[1])
    except (IndexError, ValueError):
        return None


def _window_avg(series, start, end):
    vals = [p["vesselCount"] for p in series if start <= p["_dt"] < end]
    if not vals:
        return None
    return sum(vals) / len(vals)


def get_activity(aoi_id, tenant):
    res = table.query(
        KeyConditionExpression=Key("pk").eq(f"AOI#{aoi_id}")
        & Key("sk").begins_with("OBS#"),
        ScanIndexForward=True,
    )
    series = []
    for item in res.get("Items", []):
        dt = _parse_ts(item.get("sk", ""))
        if dt is None:
            continue
        series.append(
            {
                "_dt": dt,
                "timestamp": dt.isoformat(),
                "vesselCount": float(item.get("vesselCount", 0)),
                "imageId": item.get("imageId"),
            }
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    week = datetime.timedelta(days=7)
    last7 = _window_avg(series, now - week, now)
    prev7 = _window_avg(series, now - 2 * week, now - week)

    delta = None
    pct_change = None
    if last7 is not None and prev7 is not None:
        delta = last7 - prev7
        if prev7 != 0:
            pct_change = round((delta / prev7) * 100, 1)

    latest = series[-1]["vesselCount"] if series else None

    # Strip internal sort key before returning.
    public_series = [
        {k: v for k, v in p.items() if not k.startswith("_")} for p in series
    ]

    return _resp(
        200,
        {
            "aoiId": aoi_id,
            "observationCount": len(series),
            "latestVesselCount": latest,
            "last7dAvg": last7,
            "prev7dAvg": prev7,
            "weekOverWeekDelta": delta,
            "weekOverWeekPct": pct_change,
            "series": public_series,
        },
    )


def handler(event, context):
    if table is None:
        return _resp(500, {"error": "CORE_TABLE_NAME not configured"})

    tenant = _tenant_id(event)
    aoi_id = (event.get("pathParameters") or {}).get("aoiId")
    if not aoi_id:
        return _resp(400, {"error": "aoiId path parameter required"})

    try:
        if not _owns_aoi(aoi_id, tenant):
            return _resp(404, {"error": "AOI not found", "aoiId": aoi_id})
        return get_activity(aoi_id, tenant)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}")
        return _resp(500, {"error": str(e)})
