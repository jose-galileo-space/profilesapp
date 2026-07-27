const { IoTDataPlaneClient, PublishCommand } = require("@aws-sdk/client-iot-data-plane");

const iot = new IoTDataPlaneClient({ endpoint: `https://${process.env.IOT_ENDPOINT}` });

exports.handler = async (event) => {
  const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;

  await iot.send(new PublishCommand({
    topic:   "galileo/missions/tasking",
    payload: Buffer.from(JSON.stringify({
      ...body,
      timestamp: new Date().toISOString(),
    })),
    qos: 1,
  }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ status: "tasked" }),
  };
};
