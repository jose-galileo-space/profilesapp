import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OrbitalStack } from "../lib/orbital-stack";
import { OrbConfig } from "../lib/config";

// CORRECTED: Mock Config matches the final interface
const testConfig: OrbConfig = {
  stageName: "alpha",
  removalPolicy: "DESTROY",
  processingMemory: 128,
};

describe("OrbitalStack Infrastructure", () => {
  let app: cdk.App;
  let stack: OrbitalStack;
  let template: Template;

  beforeAll(() => {
    app = new cdk.App();
    stack = new OrbitalStack(app, "TestStack", testConfig);
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
    template.resourceCountIs("AWS::SNS::Topic", 1); // RawImageTopic

    template.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "sqs",
    });
  });
});
