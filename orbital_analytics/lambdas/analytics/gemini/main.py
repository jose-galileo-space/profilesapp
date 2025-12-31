import os
import json
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
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)

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

        return {
            "statusCode": 200, 
            "body": json.dumps(analysis_json)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {"statusCode": 500, "error": str(e)}