"""
Usage / metering read handler (TideWatch E9).

GET /v1/usage        -> current calendar-month usage counters for the tenant
GET /v1/usage?months=3 -> last N months (max 12)

Counters live in CoreTable at pk=TENANT#<t>, sk=USAGE#<YYYY-MM> and are
incremented atomically (DynamoDB ADD) by the billable-event handlers:
scenesAnalyzed (GeminiFunc), reportsGenerated (ReportsFunc), aoiCount (AoiFunc).
Cognito-protected, tenant-scoped.
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
            return int(o) if o == o.to_integral_value() else float(o)
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


def _recent_months(n):
    now = datetime.datetime.now(datetime.timezone.utc)
    months = []
    y, m = now.year, now.month
    for _ in range(n):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return months


def _public_usage(month, item):
    return {
        "month": month,
        "scenesAnalyzed": item.get("scenesAnalyzed", 0),
        "reportsGenerated": item.get("reportsGenerated", 0),
        "aoiCount": item.get("aoiCount", 0),
    }


def handler(event, context):
    if table is None:
        return _resp(500, {"error": "CORE_TABLE_NAME not configured"})

    tenant = _tenant_id(event)
    qs = event.get("queryStringParameters") or {}
    try:
        months_n = max(1, min(12, int(qs.get("months", 1))))
    except (ValueError, TypeError):
        months_n = 1

    try:
        res = table.query(
            KeyConditionExpression=Key("pk").eq(f"TENANT#{tenant}")
            & Key("sk").begins_with("USAGE#")
        )
        by_month = {
            i["sk"].split("#", 1)[1]: i for i in res.get("Items", []) if "sk" in i
        }
        wanted = _recent_months(months_n)
        usage = [_public_usage(mo, by_month.get(mo, {})) for mo in wanted]
        return _resp(200, {"tenantId": tenant, "usage": usage})
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}")
        return _resp(500, {"error": str(e)})
