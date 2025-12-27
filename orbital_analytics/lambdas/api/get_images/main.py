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
    target_owner = "jose-test-user" # Hardcoded for now
    
    try:
        # --- THE FIX: USE QUERY INSTEAD OF SCAN ---
        response = table.query(
            IndexName='OwnerIndex', 
            KeyConditionExpression=Key('ownerId').eq(target_owner)
        )
        
        items = response.get('Items', [])
        
        # Sort in memory if needed (though GSI sorts by timestamp automatically!)
        # items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' 
            },
            'body': json.dumps(items, cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }