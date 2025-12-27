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

CLASSES = {
    0: 'plane', 1: 'baseball-diamond', 2: 'bridge', 3: 'ground-track-field', 
    4: 'small-vehicle', 5: 'large-vehicle', 6: 'ship', 7: 'tennis-court',
    8: 'basketball-court', 9: 'storage-tank', 10: 'soccer-ball-field', 
    11: 'roundabout', 12: 'harbor', 13: 'swimming-pool', 14: 'helicopter'
}
INTEREST_IDS = [0, 4, 5] 

MODEL_SIZE = 1024
CONF_THRESHOLD = 0.20  # Matching your successful local test

def letterbox(im, new_shape=(1024, 1024), color=(114, 114, 114)):
    """
    Resizes image to new_shape while maintaining aspect ratio (padding with gray).
    This prevents 'squashing' planes into dots.
    """
    shape = im.size  # current shape [w, h]
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    # Scale ratio (new / old)
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])

    # Compute padding
    new_unpad = int(round(shape[0] * r)), int(round(shape[1] * r))
    dw, dh = new_shape[0] - new_unpad[0], new_shape[1] - new_unpad[1]

    dw /= 2  # divide padding into 2 sides
    dh /= 2

    if shape != new_unpad:  # resize
        im = im.resize(new_unpad, Image.BILINEAR)

    new_im = Image.new("RGB", new_shape, color)
    new_im.paste(im, (int(dw), int(dh)))
    return new_im, r, (dw, dh)

def run_inference(session, img_pil):
    # 1. Letterbox Resize (Smart Resize)
    img_letterboxed, ratio, (dw, dh) = letterbox(img_pil, new_shape=MODEL_SIZE)
    
    # 2. Preprocess
    input_data = np.array(img_letterboxed, dtype=np.float32) / 255.0
    input_data = input_data.transpose(2, 0, 1) 
    input_data = np.expand_dims(input_data, axis=0)
    
    # 3. Run Model
    outputs = session.run(None, {session.get_inputs()[0].name: input_data})
    predictions = outputs[0][0].transpose() # [21504, 20]
    
    return predictions, ratio, (dw, dh)

def handler(event, context):
    print(f"EVENT: {json.dumps(event)}")
    
    try:
        bucket = event.get('bucket')
        key = event.get('key')
        
        response = s3.get_object(Bucket=bucket, Key=key)
        full_image = Image.open(BytesIO(response['Body'].read())).convert("RGB")
        full_w, full_h = full_image.size
        print(f"IMAGE: {full_w}x{full_h}")

        session = ort.InferenceSession("yolov8n-obb.onnx")
        
        print(f"Running Global Scan (Threshold: {CONF_THRESHOLD})...")

        # Run on the WHOLE image (just like your local script)
        predictions, ratio, (pad_w, pad_h) = run_inference(session, full_image)
        
        # Check raw scores (No Sigmoid needed, model outputs probabilities)
        probs = predictions[:, 5:] 
        scores = np.max(probs, axis=1)
        class_ids = np.argmax(probs, axis=1)
        
        # Debug: Print the highest score seen anywhere
        print(f"MAX CONFIDENCE SEEN: {np.max(scores):.4f}")
        
        valid_indices = np.where(scores > CONF_THRESHOLD)[0]
        
        final_output = []
        
        for i in valid_indices:
            class_id = class_ids[i]
            if class_id not in INTEREST_IDS: continue
            
            # Get box in 1024x1024 coords
            cx, cy, w, h = predictions[i, 0:4]
            
            # --- Coordinate Mapping (Undo Letterbox) ---
            # 1. Remove Padding
            cx = (cx - pad_w)
            cy = (cy - pad_h)
            
            # 2. Undo Scaling
            cx /= ratio
            cy /= ratio
            w /= ratio
            h /= ratio
            
            # Debug Print
            print(f"Found {CLASSES[class_id]}: {scores[i]:.4f}")
            
            final_output.append({
                "label": CLASSES[class_id],
                "confidence": f"{scores[i]:.2f}",
                "box": [float(cx), float(cy), float(w), float(h)]
            })

        print(f"Total Hits: {len(final_output)}")

        # Save to DynamoDB
        parts = key.split('/')
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={'imageId': {'S': parts[2]}, 'ownerId': {'S': parts[1]}},
            UpdateExpression="SET vehicle_data = :v, object_detect_status = :s",
            ExpressionAttributeValues={
                ':v': {'S': json.dumps(final_output[:50])}, # Top 50 safety
                ':s': {'S': 'COMPLETED'}
            }
        )
        
        return {'status': 'done', 'found': len(final_output)}

    except Exception as e:
        print(f"ERROR: {e}")
        raise e