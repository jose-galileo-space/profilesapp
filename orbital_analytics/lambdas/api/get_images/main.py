import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')
table = dynamodb.Table(TABLE_NAME)

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def handler(event, context):
    target_owner = "jose-test-user"
    
    try:
        response = table.query(
            IndexName='OwnerIndex', 
            KeyConditionExpression=Key('ownerId').eq(target_owner)
        )
        
        items = response.get('Items', [])
        
        return {
            'statusCode': 200,
            # FIX: We REMOVED the 'Access-Control-Allow-Origin' header here.
            # The Function URL (configured in CDK) handles it automatically.
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps(items, cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }