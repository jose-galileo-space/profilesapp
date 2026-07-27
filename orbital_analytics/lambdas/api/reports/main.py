"""
Reports engine (TideWatch E6) — implements DESIGN v2 "Reports Engine".

Curated intelligence reports: an analyst selects AOIs, writes a prompt, and gets
an AI synthesis grounded in the AOIs' measured vessel-activity. Reports persist
in CoreTable (pk=TENANT#<t>, sk=REPORT#<id>, GSI1 gsi1pk=REPORT#<id>).

Routes (all Cognito-protected, tenant-scoped):
    POST /v1/reports              -> create (title, aoiIds, promptText)
    GET  /v1/reports              -> list tenant's reports
    GET  /v1/reports/{reportId}   -> get one
    POST /v1/reports/{reportId}/analyze -> Gemini synthesis over selected AOIs
"""
import json
import os
import uuid
import datetime
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

try:
    import google.generativeai as genai
except ImportError:  # keeps unit/import checks working without the dep
    genai = None

CORE_TABLE_NAME = os.environ.get("CORE_TABLE_NAME")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(CORE_TABLE_NAME) if CORE_TABLE_NAME else None


def _load_api_key():
    arn = os.environ.get("GEMINI_SECRET_ARN")
    if arn:
        try:
            val = boto3.client("secretsmanager").get_secret_value(
                SecretId=arn)["SecretString"]
            try:
                parsed = json.loads(val)
                if isinstance(parsed, dict):
                    return parsed.get("GOOGLE_API_KEY") or parsed.get("apiKey") or val
            except (ValueError, TypeError):
                pass
            return val
        except Exception as e:  # noqa: BLE001
            print(f"WARN: could not load secret {arn}: {e}")
    return os.environ.get("GOOGLE_API_KEY")


GOOGLE_API_KEY = _load_api_key()
if genai and GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)


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
    rc = event.get("requestContext") or {}
    claims = (rc.get("authorizer") or {}).get("claims") or {}
    return claims.get("custom:tenantId") or claims.get("sub") or "jose-test-user"


def _public_report(item):
    return {
        "reportId": item.get("reportId"),
        "title": item.get("title"),
        "aoiIds": item.get("aoiIds", []),
        "promptText": item.get("promptText"),
        "status": item.get("status"),
        "analysis": item.get("analysis"),
        "createdAt": item.get("createdAt"),
        "analyzedAt": item.get("analyzedAt"),
    }


def _load_report(report_id, tenant):
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"REPORT#{report_id}"),
    )
    for item in res.get("Items", []):
        if item.get("entity") == "REPORT" and item.get("tenantId") == tenant:
            return item
    return None


def _aoi_activity_summary(aoi_id, tenant):
    """Load an AOI (verifying tenant) + a compact activity summary for grounding."""
    aoi = None
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"AOI#{aoi_id}"),
    )
    for item in res.get("Items", []):
        if item.get("entity") == "AOI" and item.get("tenantId") == tenant:
            aoi = item
            break
    if aoi is None:
        return None

    obs = table.query(
        KeyConditionExpression=Key("pk").eq(f"AOI#{aoi_id}")
        & Key("sk").begins_with("OBS#"),
        ScanIndexForward=False,
        Limit=30,
    ).get("Items", [])
    counts = [float(o.get("vesselCount", 0)) for o in obs]
    latest = counts[0] if counts else None
    avg = round(sum(counts) / len(counts), 1) if counts else None
    return {
        "aoiId": aoi_id,
        "name": aoi.get("name", aoi_id),
        "observations": len(counts),
        "latestVesselCount": latest,
        "avgVesselCount": avg,
    }


def create_report(event, tenant):
    try:
        body = json.loads(event.get("body") or "{}")
    except (ValueError, TypeError):
        return _resp(400, {"error": "invalid JSON body"})
    title = body.get("title")
    if not title:
        return _resp(400, {"error": "title is required"})
    report_id = f"rpt-{uuid.uuid4().hex[:12]}"
    item = {
        "pk": f"TENANT#{tenant}",
        "sk": f"REPORT#{report_id}",
        "gsi1pk": f"REPORT#{report_id}",
        "gsi1sk": "META",
        "entity": "REPORT",
        "reportId": report_id,
        "tenantId": tenant,
        "title": title,
        "aoiIds": body.get("aoiIds", []),
        "promptText": body.get("promptText", ""),
        "status": "DRAFT",
        "createdAt": _now_iso(),
    }
    table.put_item(Item=item)
    return _resp(201, _public_report(item))


def list_reports(tenant):
    res = table.query(
        KeyConditionExpression=Key("pk").eq(f"TENANT#{tenant}")
        & Key("sk").begins_with("REPORT#")
    )
    reports = [_public_report(i) for i in res.get("Items", [])]
    return _resp(200, {"reports": reports, "count": len(reports)})


def get_report(report_id, tenant):
    item = _load_report(report_id, tenant)
    if not item:
        return _resp(404, {"error": "report not found", "reportId": report_id})
    return _resp(200, _public_report(item))


def analyze_report(report_id, tenant):
    item = _load_report(report_id, tenant)
    if not item:
        return _resp(404, {"error": "report not found", "reportId": report_id})

    summaries = []
    for aoi_id in item.get("aoiIds", []):
        s = _aoi_activity_summary(aoi_id, tenant)
        if s:
            summaries.append(s)

    evidence = json.dumps(summaries, cls=DecimalEncoder, indent=2)
    prompt = f"""You are a senior maritime intelligence analyst.
Write a concise, professional intelligence report.

ANALYST REQUEST:
{item.get('promptText') or 'Summarize recent vessel activity across the selected areas of interest.'}

MEASURED EVIDENCE (per AOI vessel-activity summaries — ground your report ONLY in these numbers):
{evidence}

Produce: (1) a 2-3 sentence executive summary, (2) notable activity changes per AOI,
(3) any risks or anomalies implied by the numbers. Do not invent data not present above."""

    analysis_text = None
    if genai and GOOGLE_API_KEY:
        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            analysis_text = model.generate_content(prompt).text
        except Exception as e:  # noqa: BLE001
            print(f"Gemini synthesis failed: {e}")

    if analysis_text is None:
        # Deterministic fallback so analyze always returns something useful.
        lines = [
            f"- {s['name']}: latest {s['latestVesselCount']} vessels "
            f"(avg {s['avgVesselCount']} over {s['observations']} obs)"
            for s in summaries
        ]
        analysis_text = (
            "Automated summary (AI synthesis unavailable):\n" + "\n".join(lines)
            if lines
            else "No AOI activity available for the selected areas."
        )

    analyzed_at = _now_iso()
    table.update_item(
        Key={"pk": item["pk"], "sk": item["sk"]},
        UpdateExpression="SET #s = :s, analysis = :a, analyzedAt = :t",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":s": "ANALYZED",
            ":a": analysis_text,
            ":t": analyzed_at,
        },
    )
    item["status"] = "ANALYZED"
    item["analysis"] = analysis_text
    item["analyzedAt"] = analyzed_at
    _bump_usage(tenant, "reportsGenerated", 1)
    return _resp(200, _public_report(item))


def handler(event, context):
    if table is None:
        return _resp(500, {"error": "CORE_TABLE_NAME not configured"})

    method = (event.get("httpMethod") or "").upper()
    tenant = _tenant_id(event)
    path_params = event.get("pathParameters") or {}
    report_id = path_params.get("reportId")
    resource = event.get("resource") or ""

    try:
        if method == "POST" and resource.endswith("/analyze") and report_id:
            return analyze_report(report_id, tenant)
        if method == "POST" and not report_id:
            return create_report(event, tenant)
        if method == "GET" and report_id:
            return get_report(report_id, tenant)
        if method == "GET":
            return list_reports(tenant)
        return _resp(405, {"error": f"method {method} not allowed on this route"})
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}")
        return _resp(500, {"error": str(e)})
