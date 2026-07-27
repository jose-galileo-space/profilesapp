const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const db = new DynamoDBClient({ region: process.env.REGION });
const s3 = new S3Client({ region: process.env.REGION });

exports.handler = async (event) => {
  const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  const imageId = body.imageId || `img-${Date.now()}`;
  const ownerId = body.ownerId || "unknown";
  const aoiId = body.aoiId; // optional: associates this scene with an AOI (E4)
  const imageData = body.imageData; // base64 encoded

  const item = {
    imageId:   { S: imageId },
    ownerId:   { S: ownerId },
    timestamp: { S: new Date().toISOString() },
    status:    { S: "RAW" },
  };
  // Only set aoiId when provided so the analytics step can record AOI
  // observations without breaking un-tasked / ad-hoc uploads.
  if (aoiId) {
    item.aoiId = { S: aoiId };
  }

  await db.send(new PutItemCommand({
    TableName: process.env.TABLE_NAME,
    Item: item,
  }));

  if (imageData) {
    const buf = Buffer.from(imageData, "base64");
    await s3.send(new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: `raw/${ownerId}/${imageId}.jpg`,
      Body: buf,
      ContentType: "image/jpeg",
    }));
  }

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ imageId, status: "RAW" }),
  };
};
