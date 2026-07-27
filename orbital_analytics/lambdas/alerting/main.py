"""
AOI alerting handler (TideWatch E5).

Triggered by the CoreTable DynamoDB stream. For each newly inserted Observation
row it loads the AOI's alertRules and evaluates them against the new vessel
count (and recent history for surge rules), publishing any fired alerts to the
TideWatch alerts SNS topic.

Rule schema (stored on AOI.alertRules, see product_loop/DATA_MODEL.md):
    {"id": "r1", "type": "vessel_max",  "threshold": 40}   # fire if count > 40
    {"id": "r2", "type": "vessel_min",  "threshold": 2}    # fire if count < 2
    {"id": "r3", "type": "surge_pct",   "threshold": 50}   # fire if +50% vs trailing avg
"""
import json
import os

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer

from ais_adapter import get_ais_vessel_count

CORE_TABLE_NAME = os.environ.get("CORE_TABLE_NAME")
ALERTS_TOPIC_ARN = os.environ.get("ALERTS_TOPIC_ARN")

_deser = TypeDeserializer()
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(CORE_TABLE_NAME) if CORE_TABLE_NAME else None
sns = boto3.client("sns")


def _deserialize(image):
    return {k: _deser.deserialize(v) for k, v in (image or {}).items()}


def _load_aoi(aoi_id):
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"AOI#{aoi_id}"),
    )
    for item in res.get("Items", []):
        if item.get("entity") == "AOI":
            return item
    return None


def _trailing_avg(aoi_id, exclude_sk, limit=10):
    """Average vessel count of the most recent prior observations."""
    res = table.query(
        KeyConditionExpression=Key("pk").eq(f"AOI#{aoi_id}")
        & Key("sk").begins_with("OBS#"),
        ScanIndexForward=False,
        Limit=limit + 1,
    )
    vals = [
        float(i.get("vesselCount", 0))
        for i in res.get("Items", [])
        if i.get("sk") != exclude_sk
    ][:limit]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _evaluate(rule, aoi_id, count, exclude_sk, dark, ais_count):
    """Return a human message if the rule fires, else None.

    `dark` / `ais_count` are None when AIS is unavailable; dark_vessel rules
    then simply don't fire (never on fabricated data)."""
    rtype = rule.get("type")
    threshold = float(rule.get("threshold", 0))

    if rtype == "vessel_max" and count > threshold:
        return f"vessel count {count:.0f} exceeded max threshold {threshold:.0f}"
    if rtype == "vessel_min" and count < threshold:
        return f"vessel count {count:.0f} fell below min threshold {threshold:.0f}"
    if rtype == "surge_pct":
        avg = _trailing_avg(aoi_id, exclude_sk)
        if avg and avg > 0:
            pct = (count - avg) / avg * 100
            if pct >= threshold:
                return (
                    f"vessel count {count:.0f} is +{pct:.0f}% vs trailing avg "
                    f"{avg:.1f} (surge threshold {threshold:.0f}%)"
                )
    if rtype == "dark_vessel" and dark is not None and dark >= threshold:
        return (
            f"{dark:.0f} likely dark vessels (EO {count:.0f} detected vs "
            f"AIS {ais_count:.0f} reported, threshold {threshold:.0f})"
        )
    return None


def _publish(payload):
    if not ALERTS_TOPIC_ARN:
        print(f"ALERT (no topic configured): {json.dumps(payload)}")
        return
    sns.publish(
        TopicArn=ALERTS_TOPIC_ARN,
        Subject=f"TideWatch alert: {payload['aoiName']}",
        Message=json.dumps(payload),
        MessageAttributes={
            "tenantId": {"DataType": "String", "StringValue": payload["tenantId"]},
            "ruleType": {"DataType": "String", "StringValue": payload["ruleType"]},
        },
    )


def handler(event, context):
    if table is None:
        print("ERROR: CORE_TABLE_NAME not configured")
        return {"statusCode": 500}

    fired = 0
    for record in event.get("Records", []):
        if record.get("eventName") != "INSERT":
            continue
        new_image = _deserialize(
            record.get("dynamodb", {}).get("NewImage", {})
        )
        sk = new_image.get("sk", "")
        if new_image.get("entity") != "OBS" and not sk.startswith("OBS#"):
            continue

        aoi_id = new_image.get("aoiId")
        count = float(new_image.get("vesselCount", 0))
        if not aoi_id:
            continue

        aoi = _load_aoi(aoi_id)
        if not aoi:
            continue
        rules = aoi.get("alertRules") or []

        ts = sk.split("#", 2)[1] if "#" in sk else None

        # AIS cross-reference for dark-vessel estimation (E8). Only computed if
        # any dark_vessel rule exists, and only meaningful when AIS is available.
        ais_count = None
        dark = None
        if any(r.get("type") == "dark_vessel" for r in rules):
            ais_count = get_ais_vessel_count(aoi_id, aoi.get("bbox"), ts)
            if ais_count is not None:
                dark = max(0.0, count - float(ais_count))

        for rule in rules:
            msg = _evaluate(rule, aoi_id, count, sk, dark, ais_count)
            if not msg:
                continue
            payload = {
                "tenantId": aoi.get("tenantId", "unknown"),
                "aoiId": aoi_id,
                "aoiName": aoi.get("name", aoi_id),
                "ruleId": rule.get("id"),
                "ruleType": rule.get("type"),
                "threshold": rule.get("threshold"),
                "observedVesselCount": count,
                "aisReportedCount": ais_count,
                "darkVesselEstimate": dark,
                "imageId": new_image.get("imageId"),
                "timestamp": ts,
                "message": msg,
            }
            _publish(payload)
            fired += 1
            print(f"Fired alert {rule.get('id')} for AOI {aoi_id}: {msg}")

    return {"statusCode": 200, "alertsFired": fired}
