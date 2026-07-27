"""
AOI CRUD handler (TideWatch E1).

Manages Area-of-Interest records in CoreTable (single-table design, see
product_loop/DATA_MODEL.md). API Gateway proxy integration.

Routes:
    POST   /v1/aois           -> create AOI
    GET    /v1/aois           -> list AOIs for tenant
    GET    /v1/aois/{aoiId}   -> get one AOI
    DELETE /v1/aois/{aoiId}   -> delete AOI

Tenancy: tenantId comes from the `x-tenant-id` header, defaulting to the
legacy `jose-test-user`. This is a SCAFFOLD, not an auth boundary. Epic E3
replaces it with the authenticated Cognito token claim.
"""
import json
import os
import uuid
import datetime
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

CORE_TABLE_NAME = os.environ.get("CORE_TABLE_NAME")
DEFAULT_TENANT = "jose-test-user"  # legacy owner; E3 removes this fallback

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(CORE_TABLE_NAME) if CORE_TABLE_NAME else None


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _bump_usage(tenant, field, delta=1):
    """Atomically adjust a per-tenant monthly usage counter (E9). Best-effort."""
    month = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m")
    try:
        table.update_item(
            Key={"pk": f"TENANT#{tenant}", "sk": f"USAGE#{month}"},
            UpdateExpression=(
                "ADD #f :d SET entity = if_not_exists(entity, :e), "
                "tenantId = if_not_exists(tenantId, :t)"
            ),
            ExpressionAttributeNames={"#f": field},
            ExpressionAttributeValues={":d": delta, ":e": "USAGE", ":t": tenant},
        )
    except Exception as e:  # noqa: BLE001
        print(f"WARN: usage meter failed ({field} {delta:+d}): {e}")


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
    # Preferred: the authenticated Cognito JWT claim injected by the API
    # Gateway authorizer. custom:tenantId scopes the tenant; fall back to the
    # user's sub if the tenant attribute is unset.
    rc = event.get("requestContext") or {}
    claims = (rc.get("authorizer") or {}).get("claims") or {}
    tenant = claims.get("custom:tenantId") or claims.get("sub")
    if tenant:
        return tenant
    # Dev/local fallback ONLY (no authorizer context, e.g. direct invoke).
    # Not reachable through the deployed, authorizer-protected /v1 routes.
    headers = event.get("headers") or {}
    for k, v in headers.items():
        if k.lower() == "x-tenant-id" and v:
            return v
    return DEFAULT_TENANT


def _public_aoi(item):
    """Strip internal single-table keys before returning to the client."""
    return {
        "aoiId": item.get("aoiId"),
        "name": item.get("name"),
        "geometry": item.get("geometry"),
        "bbox": item.get("bbox"),
        "revisit": item.get("revisit"),
        "alertRules": item.get("alertRules"),
        "createdAt": item.get("createdAt"),
    }


def create_aoi(event, tenant):
    try:
        body = json.loads(event.get("body") or "{}")
    except (ValueError, TypeError):
        return _resp(400, {"error": "invalid JSON body"})

    name = body.get("name")
    geometry = body.get("geometry")
    if not name or not geometry:
        return _resp(400, {"error": "name and geometry are required"})

    aoi_id = body.get("aoiId") or f"aoi-{uuid.uuid4().hex[:12]}"
    item = {
        "pk": f"TENANT#{tenant}",
        "sk": f"AOI#{aoi_id}",
        "gsi1pk": f"AOI#{aoi_id}",
        "gsi1sk": "META",
        "entity": "AOI",
        "aoiId": aoi_id,
        "tenantId": tenant,
        "name": name,
        "geometry": geometry,
        "bbox": body.get("bbox"),
        "revisit": body.get("revisit", "daily"),
        "alertRules": body.get("alertRules", []),
        "createdAt": _now_iso(),
    }
    table.put_item(Item=item)
    _bump_usage(tenant, "aoiCount", 1)
    return _resp(201, _public_aoi(item))


def list_aois(tenant):
    result = table.query(
        KeyConditionExpression=Key("pk").eq(f"TENANT#{tenant}")
        & Key("sk").begins_with("AOI#")
    )
    aois = [_public_aoi(i) for i in result.get("Items", [])]
    return _resp(200, {"aois": aois, "count": len(aois)})


def get_aoi(aoi_id):
    result = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"AOI#{aoi_id}"),
    )
    items = result.get("Items", [])
    if not items:
        return _resp(404, {"error": "AOI not found", "aoiId": aoi_id})
    return _resp(200, _public_aoi(items[0]))


def delete_aoi(aoi_id, tenant):
    # Resolve the tenant-scoped primary key via GSI1, then delete.
    result = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"AOI#{aoi_id}"),
    )
    items = result.get("Items", [])
    if not items:
        return _resp(404, {"error": "AOI not found", "aoiId": aoi_id})
    item = items[0]
    if item.get("tenantId") != tenant:
        # Do not leak existence across tenants.
        return _resp(404, {"error": "AOI not found", "aoiId": aoi_id})
    table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    _bump_usage(tenant, "aoiCount", -1)
    return _resp(200, {"deleted": aoi_id})


def handler(event, context):
    if table is None:
        return _resp(500, {"error": "CORE_TABLE_NAME not configured"})

    method = (event.get("httpMethod") or "").upper()
    tenant = _tenant_id(event)
    path_params = event.get("pathParameters") or {}
    aoi_id = path_params.get("aoiId")

    try:
        if method == "POST" and not aoi_id:
            return create_aoi(event, tenant)
        if method == "GET" and aoi_id:
            return get_aoi(aoi_id)
        if method == "GET":
            return list_aois(tenant)
        if method == "DELETE" and aoi_id:
            return delete_aoi(aoi_id, tenant)
        return _resp(405, {"error": f"method {method} not allowed on this route"})
    except Exception as e:  # noqa: BLE001 - surface as 500, log for CloudWatch
        print(f"ERROR: {e}")
        return _resp(500, {"error": str(e)})
