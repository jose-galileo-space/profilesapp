import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key
import google.generativeai as genai

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')
table = dynamodb.Table(TABLE_NAME)

# Configure Gemini if the key exists
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def handler(event, context):
    # Ideally, get this from the event/auth context in the future
    target_owner = "jose-test-user"
    
    try:
        # 1. FETCH ALL RAW DATA FROM DYNAMODB
        response = table.query(
            IndexName='OwnerIndex', 
            KeyConditionExpression=Key('ownerId').eq(target_owner)
        )
        items = response.get('Items', [])
        
        # Safety Check: If we don't have an API key, just return everything
        if not GOOGLE_API_KEY:
            print("No Google API Key configured. Returning raw data.")
            return build_response(items)

        # 2. PREPARE THE "INTELLIGENCE BRIEF"
        # We create a lightweight summary for Gemini to review quickly.
        brief_packets = []
        for item in items:
            # Safely parse detections (sometimes stored as string, sometimes list)
            detections_summary = "None"
            raw_veh = item.get('vehicle_data', [])
            
            # Logic to extract just labels (e.g., "Tank", "Ship") for the prompt
            if isinstance(raw_veh, str):
                try:
                    parsed_veh = json.loads(raw_veh)
                    detections_summary = ", ".join([d.get('label', 'obj') for d in parsed_veh])
                except:
                    pass
            elif isinstance(raw_veh, list):
                detections_summary = ", ".join([d.get('label', 'obj') for d in raw_veh])
            
            # Get the previous AI assessment text
            prev_analysis = "N/A"
            if 'gemini_analysis' in item:
                # Handle cases where it's stored as a JSON string vs object
                try:
                    val = item['gemini_analysis']
                    if isinstance(val, str):
                        val = json.loads(val)
                    prev_analysis = val.get('overall_assessment', str(val))
                except:
                    pass

            brief_packets.append({
                "id": item.get('imageId'),
                "detected_objects": detections_summary,
                "prev_analysis": prev_analysis
            })

        # 3. THE "COMMANDER" PROMPT
        # We ask Gemini to filter the IDs based on the summary
        print(f"Sending {len(brief_packets)} summaries to AI Commander...")
        
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = f"""
        You are a Military Intelligence Commander. 
        Review these satellite summaries and select the relevant images for immediate review.

        RELEVANCE CRITERIA:
        1. THREATS: Military vehicles (tanks, jets, ships), weapons, or unauthorized movement.
        2. ANOMALIES: Fire, smoke, destruction, or "High Confidence" warnings.
        3. IGNORE: Empty terrain, clouds, or "No Objects Detected".

        INPUT SUMMARIES:
        {json.dumps(brief_packets)}

        OUTPUT FORMAT:
        Return valid JSON with a single key "relevant_ids" containing a list of image IDs to keep.
        Example: {{ "relevant_ids": ["img_01", "img_04"] }}
        """

        try:
            ai_response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            # 4. PARSE AI DECISION
            decision = json.loads(ai_response.text)
            relevant_ids = set(decision.get('relevant_ids', []))
            
            print(f"AI Commander selected {len(relevant_ids)} relevant targets.")

            # 5. FILTER THE ORIGINAL DYNAMODB ITEMS
            # We keep only the items that Gemini said are relevant
            filtered_items = [item for item in items if item.get('imageId') in relevant_ids]
            
            # (Optional) If AI filters everything out, maybe fallback to returning everything?
            # For now, we return the filtered list. If it's empty, the dashboard is empty.
            return build_response(filtered_items)

        except Exception as ai_error:
            print(f"AI COMMANDER ERROR: {ai_error}")
            # Fail Open: If AI breaks, show the user everything so they aren't blind.
            return build_response(items)

    except Exception as e:
        print(f"DynamoDB Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def build_response(data):
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps(data, cls=DecimalEncoder)
    }