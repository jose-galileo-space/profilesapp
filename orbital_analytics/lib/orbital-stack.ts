import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sns_subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import { OrbConfig } from "./config";

export class OrbitalStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    config: OrbConfig,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // ============================================================
    // 1. DATA LAYER
    // ============================================================
    const table = new dynamodb.Table(this, "OrbTable", {
      partitionKey: { name: "imageId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "ownerId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        config.removalPolicy === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
    });

    // TODO (jose): Add GSIs as needed.
    // GSI for Geospatial Queries (Intelligence API)
    // table.addGlobalSecondaryIndex({
    //   indexName: "GeoIndex",
    //   partitionKey: { name: "geoHash", type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
    // });

    // ============================================================
    // 2. STORAGE LAYER
    // ============================================================
    const rawBucket = new s3.Bucket(this, "RawBucket", {
      removalPolicy:
        config.removalPolicy === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
      eventBridgeEnabled: true,
    });

    const processedBucket = new s3.Bucket(this, "ProcessedBucket", {
      removalPolicy:
        config.removalPolicy === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
      eventBridgeEnabled: true,
    });

    // ============================================================
    // 3. INGESTION API
    // ============================================================
    const ingestLambda = new lambda.Function(this, "IngestLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambdas/ingest"),
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: rawBucket.bucketName,
        REGION: this.region,
      },
    });

    table.grantWriteData(ingestLambda);
    rawBucket.grantPut(ingestLambda);

    // 1. Look up your Hosted Zone (assumes it exists in Route53)
    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: "galileo-space.com",
    });

    // 2. Create an HTTPS Certificate
    const cert = new acm.Certificate(this, "ApiCert", {
      domainName: "api.galileo-space.com",
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // 3. Update the API Definition
    const api = new apigateway.RestApi(this, "OrbitalApi", {
      deployOptions: { stageName: config.stageName },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
      },
      // NEW: Add the domain configuration here
      domainName: {
        domainName: "api.galileo-space.com",
        certificate: cert,
      },
    });

    // 4. Create the DNS Record (A Record)
    new route53.ARecord(this, "ApiAliasRecord", {
      zone: zone,
      recordName: "api", // Creates api.galileo-space.com
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
    });

    const imagesResource = api.root.addResource("images");
    imagesResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(ingestLambda)
    );

    // ============================================================
    // 4. PROCESSING LAYER (Sequential)
    // ============================================================
    const processingQueue = new sqs.Queue(this, "ProcessQueue", {
      visibilityTimeout: cdk.Duration.seconds(60), // Allow time for unblurring
    });

    // S3 -> SNS -> SQS pattern
    const rawTopic = new sns.Topic(this, "RawImageTopic");
    rawTopic.addSubscription(new sns_subs.SqsSubscription(processingQueue));
    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(rawTopic),
      { suffix: ".jpg" }
    );

    const correctionLambda = new lambda.Function(this, "CorrectionLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/processing/correction"),
      timeout: cdk.Duration.seconds(60),
      memorySize: config.processingMemory,
      environment: {
        DEST_BUCKET: processedBucket.bucketName,
      },
    });

    correctionLambda.addEventSource(new SqsEventSource(processingQueue));
    rawBucket.grantRead(correctionLambda);
    processedBucket.grantPut(correctionLambda);

    // ============================================================
    // 5. ANALYTICS LAYER (Step Functions - Parallel & Decoupled)
    // ============================================================

    // Lambda A: Gemini Analysis (Writes to DB directly)
    const geminiLambda = new lambda.Function(this, "GeminiFunc", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/analytics/gemini"),
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        TABLE_NAME: table.tableName,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!,
      },
    });
    table.grantWriteData(geminiLambda);
    processedBucket.grantRead(geminiLambda);

    // Lambda B: Object Detection (Writes to DB directly)
    const objDetectLambda = new lambda.DockerImageFunction(
      this,
      "ObjDetectFunc",
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "lambdas/analytics/object_detection"
        ),
        memorySize: 4096,
        timeout: cdk.Duration.seconds(300), // 5 Minutes
        environment: {
          TABLE_NAME: table.tableName,
          HOME: "/tmp",
        },
        architecture: lambda.Architecture.X86_64,
      }
    );
    table.grantWriteData(objDetectLambda);
    processedBucket.grantRead(objDetectLambda);

    // Step Function Definition
    const geminiTask = new tasks.LambdaInvoke(this, "TaskGemini", {
      lambdaFunction: geminiLambda,
      payloadResponseOnly: true,
    });

    const objDetectTask = new tasks.LambdaInvoke(this, "TaskObjDetect", {
      lambdaFunction: objDetectLambda,
      payloadResponseOnly: true,
    });

    const parallelAnalytics = new sfn.Parallel(this, "ParallelAnalytics")
      .branch(geminiTask)
      .branch(objDetectTask);

    const stateMachine = new sfn.StateMachine(this, "OrbitalStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(parallelAnalytics),
    });

    // Trigger Analytics from Processed Bucket
    const analyticsQueue = new sqs.Queue(this, "AnalyticsQueue");

    // Tell Processed Bucket to send "Object Created" events to this Queue
    processedBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(analyticsQueue),
      { suffix: ".jpg" } // Optional: only trigger for jpgs
    );

    const analyticsTrigger = new lambda.Function(this, "AnalyticsTrigger", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambdas/triggers"),
      environment: { STATE_MACHINE_ARN: stateMachine.stateMachineArn },
    });
    analyticsTrigger.addEventSource(new SqsEventSource(analyticsQueue));
    stateMachine.grantStartExecution(analyticsTrigger);

    // ============================================================
    // 6. INTELLIGENCE API
    // ============================================================
    const summarizerLambda = new lambda.Function(this, "SummarizerLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/intelligence"),
      environment: {
        TABLE_NAME: table.tableName,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!,
      },
    });
    table.grantReadData(summarizerLambda);

    const summaryResource = api.root.addResource("summary");
    summaryResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(summarizerLambda)
    );
  }
}
