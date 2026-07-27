import os
import json
import datetime
import boto3
import google.generativeai as genai
import typing_extensions as typing  # Standard in Python 3.11+

class InfrastructureItem(typing.TypedDict):
    type: str
    description: str

class AnalysisReport(typing.TypedDict):
    terrain_description: str
    key_infrastructure: list[InfrastructureItem]
    anomalies_or_risks: list[str]
    pre_detected_object_verification: str
    overall_assessment: str

s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')
CORE_TABLE_NAME = os.environ.get('CORE_TABLE_NAME')
_core_table = boto3.resource('dynamodb').Table(CORE_TABLE_NAME) if CORE_TABLE_NAME else None


def _load_api_key():
    """Read the Gemini key from Secrets Manager (GEMINI_SECRET_ARN), falling
    back to the GOOGLE_API_KEY env var for local/dev. Cached at cold start."""
    arn = os.environ.get('GEMINI_SECRET_ARN')
    if arn:
        try:
            val = boto3.client('secretsmanager').get_secret_value(
                SecretId=arn)['SecretString']
            try:
                parsed = json.loads(val)
                if isinstance(parsed, dict):
                    return parsed.get('GOOGLE_API_KEY') or parsed.get('apiKey') or val
            except (ValueError, TypeError):
                pass
            return val
        except Exception as e:  # noqa: BLE001
            print(f"WARN: could not load secret {arn}: {e}")
    return os.environ.get('GOOGLE_API_KEY')


GOOGLE_API_KEY = _load_api_key()
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)


def _bump_usage(tenant, field, delta=1):
    """Atomically adjust a per-tenant monthly usage counter (E9). Best-effort."""
    if _core_table is None:
        return
    month = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m")
    try:
        _core_table.update_item(
            Key={"pk": f"TENANT#{tenant}", "sk": f"USAGE#{month}"},
            UpdateExpression=(
                "ADD #f :d SET entity = if_not_exists(entity, :e), "
                "tenantId = if_not_exists(tenantId, :t)"
            ),
            ExpressionAttributeNames={"#f": field},
            ExpressionAttributeValues={":d": delta, ":e": "USAGE", ":t": tenant},
        )
    except Exception as e:  # noqa: BLE001
        print(f"WARN: usage meter failed ({field}): {e}")


def _record_aoi_observation(owner_id, image_id, detections):
    """If this scene is tied to an AOI (aoiId set at ingest), append a
    vessel-count Observation to CoreTable so GET /v1/aois/{id}/activity can
    trend it (E4). Best-effort: never fail the analysis if this write fails."""
    if _core_table is None:
        return
    try:
        got = dynamodb.get_item(
            TableName=TABLE_NAME,
            Key={'imageId': {'S': image_id}, 'ownerId': {'S': owner_id}},
            ProjectionExpression='aoiId, #ts',
            ExpressionAttributeNames={'#ts': 'timestamp'},
        )
        item = got.get('Item', {})
        aoi_id = item.get('aoiId', {}).get('S')
        if not aoi_id:
            return  # ad-hoc / un-tasked scene, nothing to trend
        ts = item.get('timestamp', {}).get('S') or \
            datetime.datetime.now(datetime.timezone.utc).isoformat()
        vessel_count = sum(1 for d in detections if d.get('label') == 'ship')
        by_class = {}
        for d in detections:
            label = d.get('label')
            by_class[label] = by_class.get(label, 0) + 1
        _core_table.put_item(Item={
            'pk': f'AOI#{aoi_id}',
            'sk': f'OBS#{ts}#{image_id}',
            'entity': 'OBS',
            'aoiId': aoi_id,
            'imageId': image_id,
            'vesselCount': vessel_count,
            'byClass': by_class,
            'sceneStatus': 'ANALYZED',
        })
        print(f"Recorded AOI observation: aoi={aoi_id} vessels={vessel_count}")
    except Exception as e:  # noqa: BLE001
        print(f"WARN: could not record AOI observation: {e}")


def handler(event, context):
    try:
        # Parse Input & "Mixture of Experts" Data
        bucket = event.get('bucket')
        key = event.get('key')
        if not bucket or not key:
            raise ValueError("Missing bucket or key in event")
        parts = key.split('/')
        owner_id = parts[1]
        raw_image_id = parts[2]
        clean_image_id = raw_image_id
        if clean_image_id.lower().endswith(('.jpg', '.jpeg', '.png')):
            clean_image_id = clean_image_id.rsplit('.', 1)[0]

        layer1_data = event.get('detection_results', {})
        detections = layer1_data.get('detections', [])
        detections.sort(key=lambda x: float(x.get('confidence', 0)), reverse=True)
        top_detections = detections[:20]

        # Build the Intelligence Brief
        intelligence_brief = "NO PRE-DETECTED OBJECTS."
        if top_detections:
            lines = [f"- {d['label']} ({d['confidence']} conf)" for d in top_detections]
            intelligence_brief = "PRE-DETECTED OBJECTS:\n" + "\n".join(lines)

        print(f"Analyzing {key} with Intelligence: {len(top_detections)} objects")
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            generation_config={
                "response_mime_type": "application/json", 
                "response_schema": AnalysisReport
            }
        )

        prompt = f"""
        You are an expert orbital analyst. Analyze this satellite image.

        INPUT INTELLIGENCE:
        {intelligence_brief}

        INSTRUCTIONS:
        1. Analyze the terrain and environment.
        2. Identify specific infrastructure (runways, buildings, roads).
        3. Assess risks (fire, flood, damage).
        4. Cross-reference the "Input Intelligence" with your visual findings. Do the detected planes/objects exist?
        5. Provide a professional overall assessment.
        """
        image_response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = image_response['Body'].read()
        response = model.generate_content([
            {'mime_type': 'image/jpeg', 'data': image_bytes},
            prompt
        ])
        
        analysis_json = json.loads(response.text)
        print("Gemini JSON Output:", json.dumps(analysis_json, indent=2))

        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={
                'imageId': {'S': clean_image_id}, 
                'ownerId': {'S': owner_id}
            },
            UpdateExpression="SET gemini_analysis = :g, analysis_status = :s, #st = :global_status",
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={
                ':g': {'S': json.dumps(analysis_json)}, # Store as JSON string
                ':s': {'S': 'COMPLETED'},
                ':global_status': {'S': 'COMPLETED'}
            }
        )

        # E4: record a per-AOI vessel-count observation for activity trending.
        _record_aoi_observation(owner_id, clean_image_id, detections)
        # E9: meter one analyzed scene against the tenant (owner_id == tenantId).
        _bump_usage(owner_id, "scenesAnalyzed", 1)

        return {
            "statusCode": 200,
            "body": json.dumps(analysis_json)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {"statusCode": 500, "error": str(e)}