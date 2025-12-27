import json
import os
import boto3
from ultralytics import YOLO
from PIL import Image
import io

s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')

model = YOLO("yolov8n-obb.pt") 

def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")
    
    try:
        bucket = event.get('bucket')
        key = event.get('key')
        
        response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = response['Body'].read()
        image = Image.open(io.BytesIO(image_bytes))

        # Run Inference
        results = model.predict(image, imgsz=1024, conf=0.20)
        result = results[0]
        
        found_objects = []
        
        if result.obb is not None:
            # Loop through detections
            for i, cls_id in enumerate(result.obb.cls):
                class_name = result.names[int(cls_id)]
                confidence = float(result.obb.conf[i])
                
                x, y, w, h, rotation = result.obb.xywhr[i].tolist()
                
                # We filter for relevant classes
                if class_name in ['plane', 'small-vehicle', 'large-vehicle', 'ship']:
                    found_objects.append({
                        "label": class_name,
                        "confidence": f"{confidence:.2f}",
                        "box": [x, y, w, h] # We save the standard box, ignoring rotation for now
                    })

        print(f"Total Hits: {len(found_objects)}")

        parts = key.split('/')
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={'imageId': {'S': parts[2]}, 'ownerId': {'S': parts[1]}},
            UpdateExpression="SET vehicle_data = :v, object_detect_status = :s",
            ExpressionAttributeValues={
                ':v': {'S': json.dumps(found_objects[:50])},
                ':s': {'S': 'COMPLETED'}
            }
        )
        
        return {'status': 'done', 'found': len(found_objects)}

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise e