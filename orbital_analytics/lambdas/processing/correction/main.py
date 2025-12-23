import json
import os
import boto3
import numpy as np
import onnxruntime as ort
from PIL import Image
import io

# ======================================================
# GLOBAL SCOPE (Runs once per container - The "Warm Start")
# ======================================================
s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')

# Configuration
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.onnx')
DEST_BUCKET = os.environ.get('DEST_BUCKET')

print("INIT: Loading ONNX Model...")
# We load the session HERE so it persists across invocations
try:
    # Use CPU provider (Lambda doesn't have GPU unless specifically configured)
    ort_session = ort.InferenceSession(MODEL_PATH, providers=['CPUExecutionProvider'])
    print("INIT: Model loaded successfully.")
except Exception as e:
    print(f"INIT ERROR: Could not load model: {e}")
    ort_session = None

def preprocess_image(image):
    """
    Convert PIL Image to Model Input (YCbCr -> Y channel extraction typically for this simple model)
    For a generic SuperRes model, we usually process the Y (Luminance) channel.
    """
    # Convert to YCbCr (Luminance, Blue-diff, Red-diff)
    img_ycbcr = image.convert('YCbCr')
    img_y, img_cb, img_cr = img_ycbcr.split()
    
    # Prepare Input Tensor (Batch Size 1, 1 Channel, Height, Width)
    input_data = np.asarray(img_y).astype(np.float32)
    input_data = np.expand_dims(input_data, axis=0) # Add batch dim
    input_data = np.expand_dims(input_data, axis=0) # Add channel dim
    
    return input_data, img_cb, img_cr

def postprocess_image(output_y, img_cb, img_cr):
    """
    Merge the super-resolved Y channel back with resized Cb/Cr channels
    """
    # Output comes out as [1, 1, H, W] -> remove dims
    output_y = output_y[0][0]
    
    # Clip values to valid image range 0-255
    output_y = np.clip(output_y, 0, 255)
    output_y = Image.fromarray(np.uint8(output_y), mode='L')
    
    # Resize Cb and Cr to match the new Y size (Bicubic usually fine for color)
    output_cb = img_cb.resize(output_y.size, Image.BICUBIC)
    output_cr = img_cr.resize(output_y.size, Image.BICUBIC)
    
    # Merge and convert back to RGB
    final_img = Image.merge('YCbCr', (output_y, output_cb, output_cr)).convert('RGB')
    return final_img

# ======================================================
# HANDLER (Runs for every event)
# ======================================================
def handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    
    # SQS events can contain multiple records
    for record in event['Records']:
        try:
            # 1. Parse S3 Event from inside SQS Message
            # SQS wraps the SNS notification, which wraps the S3 event
            sns_body = json.loads(record['body'])
            s3_event = json.loads(sns_body['Message'])
            
            # Extract Bucket and Key
            # We assume single record for simplicity in demo
            s3_record = s3_event['Records'][0]
            src_bucket = s3_record['s3']['bucket']['name']
            src_key = s3_record['s3']['object']['key']
            
            # Parse OwnerID and ImageID from key: raw/{ownerId}/{imageId}.jpg
            # Split parts: ['raw', 'ownerId', 'imageId.jpg']
            key_parts = src_key.split('/')
            if len(key_parts) < 3:
                print(f"Skipping invalid key format: {src_key}")
                continue
                
            owner_id = key_parts[1]
            image_id = key_parts[2].replace('.jpg', '') # Remove extension

            print(f"Processing Image: {image_id} for Owner: {owner_id}")

            # 2. Download Image
            response = s3.get_object(Bucket=src_bucket, Key=src_key)
            image_content = response['Body'].read()
            original_image = Image.open(io.BytesIO(image_content))

            # 3. Run Inference (Correction)
            # if ort_session:
            #     # Preprocess
            #     input_tensor, img_cb, img_cr = preprocess_image(original_image)
                
            #     # INFERENCE
            #     # Get input name dynamically
            #     input_name = ort_session.get_inputs()[0].name
            #     outputs = ort_session.run(None, {input_name: input_tensor})
                
            #     # Postprocess
            #     final_image = postprocess_image(outputs[0], img_cb, img_cr)
            #     print("Inference complete. Image sharpened.")
            # else:
            #     print("WARNING: Model not loaded. Skipping correction, just copying.")
            #     final_image = original_image
            
            # For now just a pass through
            print("Skipping ML Inference (Passthrough Mode)")

            # 4. Upload to Processed Bucket
            # Save to memory buffer first
            # buffer = io.BytesIO()
            # final_image.save(buffer, format="JPEG", quality=95)
            # buffer.seek(0)
            
            dest_key = f"processed/{owner_id}/{image_id}.jpg"
            
            s3.put_object(
                Bucket=DEST_BUCKET,
                Key=dest_key,
                Body=image_content,
                ContentType='image/jpeg'
            )
            print(f"Uploaded to {DEST_BUCKET}/{dest_key}")

            # 5. Optional: Update DynamoDB Status (if needed for UI)
            # (Assuming you passed TABLE_NAME in env vars, if not, skip)
            # table_name = os.environ.get('TABLE_NAME')
            # if table_name:
            #     dynamodb.update_item(...)

        except Exception as e:
            print(f"ERROR processing record: {e}")
            # In a real app, you might want to send to a Dead Letter Queue (DLQ)
            raise e # Raising error puts message back in queue to retry

    return {'statusCode': 200, 'body': 'Processing Complete'}