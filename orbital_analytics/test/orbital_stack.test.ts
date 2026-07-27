import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OrbitalStack } from "../lib/orbital-stack";
import { OrbConfig } from "../lib/config";

// CORRECTED: Mock Config matches the final interface
const testConfig: OrbConfig = {
  stageName: "alpha",
  removalPolicy: "DESTROY",
  processingMemory: 128,
  apiRateLimit: 50,
  apiBurstLimit: 100,
};

describe("OrbitalStack Infrastructure", () => {
  let app: cdk.App;
  let stack: OrbitalStack;
  let template: Template;

  beforeAll(() => {
    app = new cdk.App();
    // A concrete env is required so route53.HostedZone.fromLookup resolves to a
    // synth-time dummy zone instead of throwing. Uses the standard CDK dummy
    // account (never a real one) so tests never touch live AWS.
    stack = new OrbitalStack(app, "TestStack", testConfig, {
      env: { account: "123456789012", region: "us-west-1" },
    });
    template = Template.fromStack(stack);
  });

  test("DynamoDB Table Created with Correct Schema", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "imageId", KeyType: "HASH" },
        { AttributeName: "ownerId", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  test("CoreTable Created with single-table schema + GSI1", () => {
    // OrbTable + CoreTable = 2 DynamoDB tables
    template.resourceCountIs("AWS::DynamoDB::Table", 2);

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
        }),
      ]),
    });
  });

  test("AOI management routes (/v1/aois) created", () => {
    // At least the DELETE method is unique to the AOI-by-id route.
    template.hasResourceProperties("AWS::ApiGateway::Method", {
      HttpMethod: "DELETE",
    });
  });

  test("Gemini API key stored in Secrets Manager (not plaintext env)", () => {
    // Secret resource exists...
    template.resourceCountIs("AWS::SecretsManager::Secret", 1);

    // ...and no Lambda carries a GOOGLE_API_KEY env var anymore.
    const fns = template.findResources("AWS::Lambda::Function");
    for (const id of Object.keys(fns)) {
      const vars = fns[id].Properties?.Environment?.Variables ?? {};
      expect(vars).not.toHaveProperty("GOOGLE_API_KEY");
    }
  });

  test("Cognito user pool + tenantId attribute + protected /v1/aois routes", () => {
    template.resourceCountIs("AWS::Cognito::UserPool", 1);

    // Custom tenantId attribute present on the pool schema.
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      Schema: Match.arrayWith([
        Match.objectLike({ Name: "tenantId", AttributeDataType: "String" }),
      ]),
    });

    // The AOI routes are Cognito-authorized.
    template.hasResourceProperties("AWS::ApiGateway::Method", {
      AuthorizationType: "COGNITO_USER_POOLS",
    });
  });

  test("E3b: GetImagesFunc is not a public Function URL", () => {
    // The public NONE-auth Function URL was removed; images are served behind
    // the Cognito-authorized API Gateway route instead.
    template.resourceCountIs("AWS::Lambda::Url", 0);
  });

  test("E4: AOI activity route + observation writer wired", () => {
    // ActivityFunc + GeminiFunc both need CoreTable access; confirm the
    // activity endpoint's Lambda has CORE_TABLE_NAME wired.
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.11",
      Environment: {
        Variables: Match.objectLike({ CORE_TABLE_NAME: Match.anyValue() }),
      },
    });
  });

  test("S3 Buckets Created (Raw & Processed)", () => {
    // Should have 2 buckets
    template.resourceCountIs("AWS::S3::Bucket", 2);

    // Verify CORS on the Raw bucket
    template.hasResourceProperties("AWS::S3::Bucket", {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: ["PUT"],
            AllowedOrigins: ["*"],
          }),
        ]),
      },
    });
  });

  test("Lambdas Created with Correct Runtimes", () => {
    // Check for Python 3.11 Functions (Analytics & Processing)
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.11",
      // Verify the memory matches our alpha config (128)
      MemorySize: 128,
    });

    // Check for Node 20 Functions (Ingest & Triggers)
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
    });
  });

  test("API Gateway Routes Created", () => {
    // Check for POST /images
    template.hasResourceProperties("AWS::ApiGateway::Method", {
      HttpMethod: "POST",
      ResourceId: Match.anyValue(),
    });

    // Check for GET /summary
    template.hasResourceProperties("AWS::ApiGateway::Method", {
      HttpMethod: "GET",
    });
  });

  test("Step Functions State Machine Created", () => {
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      DefinitionString: Match.anyValue(),
      RoleArn: Match.anyValue(),
    });
  });

  test("Queues and Topics Linked", () => {
    template.resourceCountIs("AWS::SQS::Queue", 2); // Processing & Analytics
    // RawImageTopic + TideWatchAlerts (E5)
    template.resourceCountIs("AWS::SNS::Topic", 2);

    template.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "sqs",
    });
  });

  test("E7: commercial API tiers (usage plans) + stage throttle", () => {
    // One usage plan per pricing tier (Watch/Pro/Enterprise).
    template.resourceCountIs("AWS::ApiGateway::UsagePlan", 3);
    template.hasResourceProperties("AWS::ApiGateway::UsagePlan", {
      Quota: Match.objectLike({ Period: "MONTH" }),
    });
  });

  test("F1: every non-OPTIONS API method requires Cognito auth", () => {
    // CORS preflight (OPTIONS) is legitimately unauthenticated; every real
    // data route must be COGNITO_USER_POOLS. No anonymous ingest/summary/etc.
    const methods = template.findResources("AWS::ApiGateway::Method");
    const unauthenticated = Object.entries(methods)
      .filter(([, m]) => {
        const p = m.Properties ?? {};
        return (
          p.HttpMethod !== "OPTIONS" &&
          p.AuthorizationType !== "COGNITO_USER_POOLS"
        );
      })
      .map(([id]) => id);
    expect(unauthenticated).toEqual([]);
  });

  test("E9: usage/metering route exists", () => {
    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: "usage",
    });
  });

  test("E6: reports engine routes exist and are Cognito-authorized", () => {
    // /v1/reports/{reportId}/analyze route resource is created.
    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: "analyze",
    });
    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: "reports",
    });
  });

  test("E8: AlertsFunc has AIS cross-reference mode configured", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({ AIS_MODE: Match.anyValue() }),
      },
    });
  });

  test("E5: CoreTable stream feeds an alerting event-source mapping", () => {
    // CoreTable has a stream enabled...
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      StreamSpecification: { StreamViewType: "NEW_IMAGE" },
    });
    // ...and a Lambda event-source mapping consumes a DynamoDB stream.
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      StartingPosition: "TRIM_HORIZON",
    });
  });
});
