const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfn = new SFNClient({});

exports.handler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    // SQS wraps the S3 event in SNS which wraps in SQS
    const s3Event = body.Records
      ? body
      : JSON.parse(body.Message || "{}");

    const s3Record = (s3Event.Records || [])[0];
    if (!s3Record) continue;

    const bucket = s3Record.s3.bucket.name;
    const key    = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));

    await sfn.send(new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      input: JSON.stringify({ bucket, key }),
    }));
  }
  return { statusCode: 200 };
};
