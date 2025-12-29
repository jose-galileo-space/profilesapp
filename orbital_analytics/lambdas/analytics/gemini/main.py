import json
import os
import boto3
import google.generativeai as genai
from io import BytesIO

# ======================================================
# GLOBAL CONFIG
# ======================================================
s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')

TABLE_NAME = os.environ.get('TABLE_NAME')
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')

# Configure Gemini
genai.configure(api_key=GOOGLE_API_KEY)

def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")
    
    try:
        # 1. Parse Input (From Step Functions)
        # We expect the payload to look like: { "bucket": "...", "key": "..." }
        # Note: If this comes from a Parallel state, it might be wrapped differently.
        # We handle the direct payload here.
        bucket = event.get('bucket')
        key = event.get('key')
        
        if not bucket or not key:
            raise ValueError("Missing bucket or key in event")

        # Extract IDs from key: processed/{ownerId}/{imageId}
        parts = key.split('/')
        owner_id = parts[1]
        raw_image_id = parts[2]
        clean_image_id = raw_image_id
        if clean_image_id.lower().endswith(('.jpg', '.jpeg', '.png')):
            clean_image_id = clean_image_id.rsplit('.', 1)[0]

        print(f"Analyzing {clean_image_id} for {owner_id}")

        # 2. Download Image
        response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = response['Body'].read()

        # 3. Call Gemini API
        # We use Gemini 1.5 Flash for speed/cost efficiency
        model = genai.GenerativeModel('gemini-2.5-flash')

        layer1_data = event.get('detection_results', {})
        detections = layer1_data.get('detections', [])

        intelligence_brief = "NO PRE-DETECTED OBJECTS."
        if detections:
            lines = []
            for d in detections[:20]:
                # Format: "- plane (95% conf) at box [x, y, w, h]"
                lines.append(f"- {d['label']} ({d['confidence']} conf)")
            
            intelligence_brief = "PRE-DETECTED OBJECTS (Validated by Computer Vision):\n" + "\n".join(lines)
        prompt = """
        You are an expert orbital analyst. Analyze this satellite image.

        INPUT INTELLIGENCE:
        {intelligence_brief}

        INSTRUCTIONS:
        1. Synthesize the 'Input Intelligence' with your visual analysis.
        2. Describe the terrain (urban, rural, desert, forest).
        3. Identify key infrastructure (roads, buildings, bridges).
        4. Flag any anomalies or potential risks (flooding, fires, structural damage).
        5. Confirm if any of the pre-detected objects are of particular interest.
        Return the response in clear, concise text.
        """
        
        # Prepare the content (Image + Text)
        response = model.generate_content([
            {'mime_type': 'image/jpeg', 'data': image_bytes},
            prompt
        ])
        
        analysis_text = response.text
        print(f"Gemini Analysis: {analysis_text[:100]}...")

        # 4. Save to DynamoDB
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={
                'imageId': {'S': clean_image_id}, 
                'ownerId': {'S': owner_id}
            },
            # Add 'status = :global_status' to the UpdateExpression
            UpdateExpression="SET gemini_analysis = :g, analysis_status = :s, #st = :global_status",
            ExpressionAttributeNames={
                '#st': 'status'  # "status" is a reserved word in DynamoDB, so we use an alias
            },
            ExpressionAttributeValues={
                ':g': {'S': analysis_text},
                ':s': {'S': 'COMPLETED'},
                ':global_status': {'S': 'COMPLETED'} # <--- THE MISSING PIECE
            }
        )

        return {
            'statusCode': 200,
            'body': 'Analysis Complete',
            'analysis': analysis_text
        }

    except Exception as e:
        print(f"ERROR: {e}")
        # In Step Functions, raising an error fails this specific branch
        raise e