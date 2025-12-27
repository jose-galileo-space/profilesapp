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
        image_id = parts[2] # might have .jpg

        print(f"Analyzing {image_id} for {owner_id}")

        # 2. Download Image
        response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = response['Body'].read()

        # 3. Call Gemini API
        # We use Gemini 1.5 Flash for speed/cost efficiency
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = """
        You are an orbital analyst. Analyze this satellite image.
        1. Describe the terrain (urban, rural, desert, forest).
        2. Identify key infrastructure (roads, buildings, bridges).
        3. Flag any anomalies or potential risks (flooding, fires, structural damage).
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
        # We UPDATE the item to add the 'gemini_analysis' field
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={
                'imageId': {'S': image_id},
                'ownerId': {'S': owner_id}
            },
            UpdateExpression="SET gemini_analysis = :g, analysis_status = :s",
            ExpressionAttributeValues={
                ':g': {'S': analysis_text},
                ':s': {'S': 'COMPLETED'}
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