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

# COCO Dataset Classes
CLASSES = {
    0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane',
    5: 'bus', 6: 'train', 7: 'truck', 8: 'boat'
}
VEHICLE_IDS = [2, 3, 4, 5, 6, 7, 8]

# Standard YOLO input size
MODEL_SIZE = 640 

def run_inference(session, img_pil):
    """Runs inference on a single PIL image (tile)"""
    # Resize to model input
    img_resized = img_pil.resize((MODEL_SIZE, MODEL_SIZE))
    
    # Preprocess
    input_data = np.array(img_resized, dtype=np.float32)
    input_data = input_data / 255.0
    input_data = input_data.transpose(2, 0, 1) # HWC -> CHW
    input_data = np.expand_dims(input_data, axis=0)
    
    # Run ONNX
    outputs = session.run(None, {session.get_inputs()[0].name: input_data})
    output = outputs[0][0] # Remove batch -> [84, 8400]
    predictions = output.transpose() # -> [8400, 84]
    
    return predictions

def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")
    
    try:
        bucket = event.get('bucket')
        key = event.get('key')
        
        # 1. Load Image
        response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = response['Body'].read()
        full_image = Image.open(BytesIO(image_bytes)).convert("RGB")
        full_w, full_h = full_image.size
        print(f"ORIGINAL SIZE: {full_w}x{full_h}")

        # 2. Load Model Once
        session = ort.InferenceSession("yolov8n.onnx")

        # 3. Define Grid (2 Rows x 4 Cols = 8 Tiles)
        # This keeps the aspect ratio of tiles roughly square-ish
        rows = 2
        cols = 4
        
        tile_w = full_w // cols
        tile_h = full_h // rows
        
        all_boxes = []
        total_vehicles = 0
        
        print(f"Starting Tiled Inference ({rows}x{cols})...")

        for r in range(rows):
            for c in range(cols):
                # Calculate crop coordinates
                x1 = c * tile_w
                y1 = r * tile_h
                x2 = x1 + tile_w
                y2 = y1 + tile_h
                
                # Crop the tile
                tile = full_image.crop((x1, y1, x2, y2))
                
                # Run Detection
                predictions = run_inference(session, tile)
                
                # Filter Results
                scores = np.max(predictions[:, 4:], axis=1)
                class_ids = np.argmax(predictions[:, 4:], axis=1)
                
                # Threshold (0.25 is standard, but 0.20 is safer for satellite)
                indices = np.where(scores > 0.20)[0]
                
                for i in indices:
                    class_id = class_ids[i]
                    score = float(scores[i])
                    
                    if class_id in VEHICLE_IDS:
                        # Get box in 640x640 coords
                        cx, cy, w, h = predictions[i, 0:4]
                        
                        # 1. Scale back to TILE size
                        scale_x = tile_w / MODEL_SIZE
                        scale_y = tile_h / MODEL_SIZE
                        
                        real_cx = cx * scale_x
                        real_cy = cy * scale_y
                        real_w = w * scale_x
                        real_h = h * scale_y
                        
                        # 2. Offset to GLOBAL image coordinates
                        global_cx = real_cx + x1
                        global_cy = real_cy + y1
                        
                        # Convert to JSON format
                        all_boxes.append({
                            "label": CLASSES[class_id],
                            "confidence": f"{score:.2f}",
                            "box": [float(global_cx), float(global_cy), float(real_w), float(real_h)]
                        })
                        total_vehicles += 1

        print(f"TOTAL VEHICLES FOUND: {total_vehicles}")

        # 4. Save to DynamoDB
        parts = key.split('/')
        owner_id = parts[1]
        image_id = parts[2]
        
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={'imageId': {'S': image_id}, 'ownerId': {'S': owner_id}},
            UpdateExpression="SET vehicle_data = :v, object_detect_status = :s",
            ExpressionAttributeValues={
                ':v': {'S': json.dumps(all_boxes)},
                ':s': {'S': 'COMPLETED'}
            }
        )
        
        return {'status': 'done', 'vehicles': total_vehicles}

    except Exception as e:
        print(f"ERROR: {e}")
        raise e