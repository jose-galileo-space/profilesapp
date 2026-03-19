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

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def handler(event, context):
    target_owner = "jose-test-user" # TODO: Auth
    
    try:
        # 1. FETCH EVERYTHING
        response = table.query(
            IndexName='OwnerIndex', 
            KeyConditionExpression=Key('ownerId').eq(target_owner)
        )
        items = response.get('Items', [])
        
        # 2. CLEAN, VALIDATE, & DEDUPLICATE
        valid_items = []
        seen_ids = set()

        # Sort by newest first
        items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

        for item in items:
            # A. DEDUPLICATE
            img_id = item.get('imageId')
            if not img_id or img_id in seen_ids:
                continue
            
            # B. PARSE & CLEAN DATA IN-PLACE
            
            # --- Clean Vehicle Data ---
            raw_veh = item.get('vehicle_data', [])
            if isinstance(raw_veh, str):
                try: item['vehicle_data'] = json.loads(raw_veh)
                except: item['vehicle_data'] = []
            elif not isinstance(raw_veh, list):
                item['vehicle_data'] = []

            # --- Clean Gemini Data ---
            if 'gemini_analysis' in item:
                val = item['gemini_analysis']
                if isinstance(val, str):
                    try:
                        parsed_val = json.loads(val)
                        item['gemini_analysis'] = parsed_val
                    except:
                        pass

            # C. THE "OLD DATA" FILTER
            # Must have Gemini Analysis AND Objects to be useful
            has_analysis = item.get('gemini_analysis') is not None
            has_objects = item.get('vehicle_data') is not None

            if not has_analysis or not has_objects:
                continue 

            seen_ids.add(img_id)
            valid_items.append(item)

        # 3. DEFINE SESSION ITEMS (This was the missing line!)
        session_items = valid_items[:12]

        # 4. COLLECT AVAILABLE LABELS (Now this works because session_items exists)
        available_labels = set()
        for item in session_items:
            for veh in item.get('vehicle_data', []):
                if 'label' in veh:
                    available_labels.add(veh['label'])
        
        available_list = list(available_labels)

        # 5. PREPARE CONTEXT FOR GEMINI
        brief_lines = []
        for item in session_items:
            analysis_text = "Pending"
            val = item.get('gemini_analysis')
            if isinstance(val, dict):
                analysis_text = val.get('overall_assessment', "Assessment missing")
            elif isinstance(val, str):
                analysis_text = val
            brief_lines.append(f"- ID {item.get('imageId')}: {analysis_text}")

        # 6. ASK GEMINI (MISSION BRIEF)
        mission_summary = "Satellite uplink active. No significant activity."
        relevant_labels = []

        if GOOGLE_API_KEY and session_items:
            try:
                # Use the model that works for you
                model = genai.GenerativeModel("gemini-2.5-flash")
                
                prompt = f"""
                You are a Senior Intelligence Officer.
                
                AVAILABLE DETECTIONS:
                {json.dumps(available_list)}
                
                INPUT REPORTS:
                {chr(10).join(brief_lines)}
                
                TASK:
                1. Write a short 2-sentence "Mission Update" summarizing trends.
                2. From the "AVAILABLE DETECTIONS" list, select ONLY the object classes relevant to this update.
                   - If specific threats exist, list them.
                   - Output "all" ONLY if everything is relevant.
                
                OUTPUT JSON:
                {{
                    "mission_summary": "...",
                    "relevant_classes": ["subset", "of", "available"]
                }}
                """
                
                result = model.generate_content(
                    prompt, 
                    generation_config={"response_mime_type": "application/json"}
                )
                
                # Markdown cleanup
                raw_text = result.text.strip()
                if raw_text.startswith("```json"): raw_text = raw_text[7:]
                if raw_text.endswith("```"): raw_text = raw_text[:-3]
                
                data = json.loads(raw_text)
                mission_summary = data.get("mission_summary", mission_summary)
                relevant_labels = [x.lower() for x in data.get("relevant_classes", [])]

            except Exception as e:
                print(f"AI Error: {e}")
                relevant_labels = ["all"]

        # 7. FINAL FILTER (View Layer)
        for item in session_items:
            veh = item.get('vehicle_data', [])
            if "all" not in relevant_labels and relevant_labels:
                item['vehicle_data'] = [
                    d for d in veh 
                    if d.get('label', '').lower() in relevant_labels
                ]

        return {
            'statusCode': 200,
            'headers': { 'Content-Type': 'application/json' },
            'body': json.dumps({
                "mission_summary": mission_summary,
                "focus_classes": relevant_labels,
                "images": session_items
            }, cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}