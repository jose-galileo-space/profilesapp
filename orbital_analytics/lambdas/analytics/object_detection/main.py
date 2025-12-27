import json
import os
import boto3
import numpy as np
import onnxruntime as ort
from PIL import Image
from io import BytesIO

s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')

# COCO Dataset Classes (We only care about a few)
CLASSES = {
    0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane',
    5: 'bus', 6: 'train', 7: 'truck', 8: 'boat'
}
# Filter: Only keep these IDs
VEHICLE_IDS = [2, 3, 4, 5, 6, 7, 8]

def preprocess(image_bytes):
    """Resize image to 640x640 and normalize for YOLOv8"""
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img_resized = img.resize((640, 640))
    
    # Convert to numpy (H, W, C) -> (C, H, W)
    input_data = np.array(img_resized, dtype=np.float32)
    input_data = input_data / 255.0  # Normalize 0-1
    input_data = input_data.transpose(2, 0, 1) # Channels first
    input_data = np.expand_dims(input_data, axis=0) # Batch dimension
    return input_data

def xywh2xyxy(x):
    """Convert box format from Center-Width-Height to TopLeft-BottomRight"""
    y = np.copy(x)
    y[..., 0] = x[..., 0] - x[..., 2] / 2  # top-left x
    y[..., 1] = x[..., 1] - x[..., 3] / 2  # top-left y
    y[..., 2] = x[..., 0] + x[..., 2] / 2  # bottom-right x
    y[..., 3] = x[..., 1] + x[..., 3] / 2  # bottom-right y
    return y

def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")
    
    try:
        bucket = event.get('bucket')
        key = event.get('key')
        
        # 1. Download Image
        response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = response['Body'].read()
        
        # 2. Run Inference
        session = ort.InferenceSession("yolov8n.onnx")
        input_tensor = preprocess(image_bytes)
        
        # YOLOv8 output is [1, 84, 8400] (Batch, Classes+Coords, Anchors)
        outputs = session.run(None, {session.get_inputs()[0].name: input_tensor})
        output = outputs[0][0] # Remove batch dim -> [84, 8400]
        
        # Transpose to [8400, 84] for easier processing
        predictions = output.transpose()
        
        # 3. Post-Process (Filter & Extract)
        boxes = []
        counts = {k: 0 for k in VEHICLE_IDS}
        
        # predictions format: [x, y, w, h, class0_score, class1_score, ...]
        scores = np.max(predictions[:, 4:], axis=1)
        class_ids = np.argmax(predictions[:, 4:], axis=1)
        
        # Confidence Threshold
        indices = np.where(scores > 0.4)[0]
        
        for i in indices:
            class_id = class_ids[i]
            score = float(scores[i])
            
            if class_id in VEHICLE_IDS:
                # Extract Box
                cx, cy, w, h = predictions[i, 0:4]
                # Simple count
                counts[class_id] += 1
                
                boxes.append({
                    "label": CLASSES[class_id],
                    "confidence": f"{score:.2f}",
                    "box": [float(cx), float(cy), float(w), float(h)]
                })

        print(f"Found Vehicles: {len(boxes)}")

        # 4. Save to DynamoDB
        parts = key.split('/')
        owner_id = parts[1]
        image_id = parts[2]
        
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={'imageId': {'S': image_id}, 'ownerId': {'S': owner_id}},
            UpdateExpression="SET vehicle_data = :v, object_detect_status = :s",
            ExpressionAttributeValues={
                ':v': {'S': json.dumps(boxes)},
                ':s': {'S': 'COMPLETED'}
            }
        )
        
        return {'status': 'done', 'vehicles_found': len(boxes)}

    except Exception as e:
        print(f"ERROR: {e}")
        raise e