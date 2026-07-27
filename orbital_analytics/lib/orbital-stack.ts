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
import * as path from 'path';
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
import {
  SqsEventSource,
  DynamoEventSource,
} from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import { OrbConfig, ApiTiers } from "./config";

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

    table.addGlobalSecondaryIndex({
      indexName: "OwnerIndex", // We will use this name in the Lambda
      partitionKey: { name: "ownerId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING }, // Optional: Sort by time
      projectionType: dynamodb.ProjectionType.ALL, // Return all attributes
    });

    // TODO (jose): Add GSIs as needed.
    // GSI for Geospatial Queries (Intelligence API)
    // table.addGlobalSecondaryIndex({
    //   indexName: "GeoIndex",
    //   partitionKey: { name: "geoHash", type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
    // });

    // CoreTable: single-table store for TideWatch product entities
    // (Tenant, AOI, Observation, Report, Usage). See product_loop/DATA_MODEL.md.
    // OrbTable stays the image/detection store; CoreTable holds everything else.
    const coreTable = new dynamodb.Table(this, "CoreTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Stream feeds the alerting evaluator (E5) on new Observations.
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy:
        config.removalPolicy === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
    });

    coreTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

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
    // 2.5 SECRETS (TideWatch E2)
    // GeminiApiKey holds the Gemini API key. The value is populated
    // out-of-band by an operator (never in code or the CFN template):
    //   aws secretsmanager put-secret-value \
    //     --secret-id <arn> --secret-string '{"GOOGLE_API_KEY":"..."}'
    // Handlers read it at cold start (with a GOOGLE_API_KEY env fallback for
    // local/dev). This removes the plaintext key from every Lambda env var.
    // ============================================================
    const geminiApiKeySecret = new secretsmanager.Secret(this, "GeminiApiKey", {
      description: "Gemini API key for TideWatch analytics Lambdas",
      removalPolicy:
        config.removalPolicy === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
    });

    // ============================================================
    // 2.6 AUTH (Cognito) — TideWatch E3a
    // Multi-tenant identity. Each user carries a custom:tenantId attribute;
    // the API Gateway Cognito authorizer passes JWT claims to handlers, which
    // scope every read/write by that tenant. Replaces the x-tenant-id scaffold
    // for the /v1 product surface. (E3b migrates the legacy routes + GetImages.)
    // ============================================================
    const userPool = new cognito.UserPool(this, "TideWatchUserPool", {
      selfSignUpEnabled: false, // tenants are provisioned, not self-serve (yet)
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      customAttributes: {
        tenantId: new cognito.StringAttribute({ mutable: true }),
      },
      removalPolicy:
        config.removalPolicy === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient("TideWatchWebClient", {
      authFlows: { userSrp: true, userPassword: true },
    });

    const apiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "TideWatchAuthorizer",
      { cognitoUserPools: [userPool] }
    );

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
      deployOptions: {
        stageName: config.stageName,
        // Stage-level default throttle: baseline abuse protection (E7).
        throttlingRateLimit: config.apiRateLimit,
        throttlingBurstLimit: config.apiBurstLimit,
      },
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

    // Legacy ingest endpoint — now Cognito-protected (SECURITY_REVIEW F1).
    // No anonymous writes into the pipeline.
    const imagesResource = api.root.addResource("images");
    imagesResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(ingestLambda),
      {
        authorizer: apiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // ============================================================
    // 3.5 AOI MANAGEMENT API (TideWatch E1)
    // Versioned /v1 surface. Auth (E3) will add a Cognito authorizer;
    // today tenancy comes from the x-tenant-id header (scaffold).
    // ============================================================
    const aoiLambda = new lambda.Function(this, "AoiFunc", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/api/aoi"),
      environment: {
        CORE_TABLE_NAME: coreTable.tableName,
      },
    });
    coreTable.grantReadWriteData(aoiLambda);

    const v1 = api.root.addResource("v1");
    const aoisResource = v1.addResource("aois");
    const aoiIntegration = new apigateway.LambdaIntegration(aoiLambda);
    // Every /v1/aois route requires a valid Cognito JWT; the handler reads
    // tenantId from the token claims.
    const aoiAuth: apigateway.MethodOptions = {
      authorizer: apiAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };
    aoisResource.addMethod("GET", aoiIntegration, aoiAuth); // list
    aoisResource.addMethod("POST", aoiIntegration, aoiAuth); // create
    const aoiByIdResource = aoisResource.addResource("{aoiId}");
    aoiByIdResource.addMethod("GET", aoiIntegration, aoiAuth); // get one
    aoiByIdResource.addMethod("DELETE", aoiIntegration, aoiAuth); // delete

    // Activity: per-AOI vessel-count time series + week-over-week delta (E4).
    // Reads Observation rows written by the analytics step.
    const activityLambda = new lambda.Function(this, "ActivityFunc", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/api/activity"),
      environment: {
        CORE_TABLE_NAME: coreTable.tableName,
      },
    });
    coreTable.grantReadData(activityLambda);
    const activityResource = aoiByIdResource.addResource("activity");
    activityResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(activityLambda),
      aoiAuth
    );

    // ============================================================
    // 3.6 ALERTING (TideWatch E5)
    // New Observations stream from CoreTable into AlertsFunc, which evaluates
    // each AOI's alertRules (max/min/surge) and publishes fired alerts to SNS.
    // Operators subscribe email/HTTPS endpoints to the topic out-of-band.
    // ============================================================
    const alertsTopic = new sns.Topic(this, "TideWatchAlerts", {
      displayName: "TideWatch AOI Alerts",
    });

    const alertsLambda = new lambda.Function(this, "AlertsFunc", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/alerting"),
      environment: {
        CORE_TABLE_NAME: coreTable.tableName,
        ALERTS_TOPIC_ARN: alertsTopic.topicArn,
        // AIS dark-vessel cross-reference (E8): off | stub | http.
        // "off" until a real AIS provider is wired, so no fabricated signals.
        AIS_MODE: "off",
      },
    });
    coreTable.grantReadData(alertsLambda); // load AOI rules + trailing history
    alertsTopic.grantPublish(alertsLambda);
    alertsLambda.addEventSource(
      new DynamoEventSource(coreTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        retryAttempts: 2,
        // Only Observation inserts matter; the handler also re-checks.
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("INSERT"),
          }),
        ],
      })
    );

    new cdk.CfnOutput(this, "AlertsTopicArn", {
      value: alertsTopic.topicArn,
      description: "Subscribe email/HTTPS endpoints here to receive AOI alerts",
    });

    // ============================================================
    // 3.7 REPORTS ENGINE (TideWatch E6 — DESIGN v2)
    // Curated intelligence reports: select AOIs + prompt -> Gemini synthesis
    // grounded in measured activity. Docker image (needs google-generativeai),
    // same pattern as GetImagesFunc.
    // ============================================================
    const reportsLambda = new lambda.DockerImageFunction(this, "ReportsFunc", {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, "../lambdas/api/reports")
      ),
      architecture: lambda.Architecture.ARM_64,
      environment: {
        CORE_TABLE_NAME: coreTable.tableName,
        GEMINI_SECRET_ARN: geminiApiKeySecret.secretArn,
      },
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
    });
    coreTable.grantReadWriteData(reportsLambda);
    geminiApiKeySecret.grantRead(reportsLambda);

    // Usage / metering read endpoint (E9). Counters are written inline by the
    // billable-event handlers (GeminiFunc scenes, ReportsFunc reports, AoiFunc
    // AOIs) via atomic ADD; this just reads them back per tenant.
    const usageLambda = new lambda.Function(this, "UsageFunc", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "main.handler",
      code: lambda.Code.fromAsset("lambdas/api/usage"),
      environment: { CORE_TABLE_NAME: coreTable.tableName },
    });
    coreTable.grantReadData(usageLambda);
    v1.addResource("usage").addMethod(
      "GET",
      new apigateway.LambdaIntegration(usageLambda),
      aoiAuth
    );

    const reportsIntegration = new apigateway.LambdaIntegration(reportsLambda);
    const reportsResource = v1.addResource("reports");
    reportsResource.addMethod("GET", reportsIntegration, aoiAuth); // list
    reportsResource.addMethod("POST", reportsIntegration, aoiAuth); // create
    const reportByIdResource = reportsResource.addResource("{reportId}");
    reportByIdResource.addMethod("GET", reportsIntegration, aoiAuth); // get one
    reportByIdResource
      .addResource("analyze")
      .addMethod("POST", reportsIntegration, aoiAuth); // synthesize

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
        CORE_TABLE_NAME: coreTable.tableName,
        GEMINI_SECRET_ARN: geminiApiKeySecret.secretArn,
      },
    });
    table.grantReadWriteData(geminiLambda); // read aoiId + write analysis (E4)
    coreTable.grantWriteData(geminiLambda); // write AOI observations (E4)
    processedBucket.grantRead(geminiLambda);
    geminiApiKeySecret.grantRead(geminiLambda);

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

    const objDetectTask = new tasks.LambdaInvoke(this, "TaskObjDetect", {
      lambdaFunction: objDetectLambda,
      payloadResponseOnly: true,
      resultPath: "$.detection_results",
    });

    const geminiTask = new tasks.LambdaInvoke(this, "TaskGemini", {
      lambdaFunction: geminiLambda,
      payloadResponseOnly: true,
    });

    const definition = objDetectTask.next(geminiTask);

    const stateMachine = new sfn.StateMachine(this, "OrbitalStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
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
        GEMINI_SECRET_ARN: geminiApiKeySecret.secretArn,
      },
    });
    table.grantReadData(summarizerLambda);
    geminiApiKeySecret.grantRead(summarizerLambda);

    // Legacy summary endpoint — now Cognito-protected (SECURITY_REVIEW F1).
    const summaryResource = api.root.addResource("summary");
    summaryResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(summarizerLambda),
      {
        authorizer: apiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // ============================================================
    // 6.5 SATELLITE TASKING (IoT Core Relay)
    // ============================================================
    const taskingLambda = new lambda.Function(this, "TaskingLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambdas/tasking"),
      environment: {
        // IMPORTANT: Paste that exact ATS endpoint you found earlier here
        IOT_ENDPOINT: "a1mjxt17dps8on-ats.iot.us-west-1.amazonaws.com",
      },
    });

    // Give the Lambda security clearance to broadcast to IoT Core
    taskingLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iot:Publish"],
        resources: [
          `arn:aws:iot:${this.region}:${this.account}:topic/galileo/missions/tasking`
        ],
      })
    );

    // Satellite tasking publishes to IoT Core — a privileged action that must
    // never be anonymous. Protect it with the Cognito authorizer (E3b).
    const taskResource = api.root.addResource("task");
    taskResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(taskingLambda),
      {
        authorizer: apiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // ============================================================
    // 7. OUTPUTS
    // ============================================================
    const getImagesLambda = new lambda.DockerImageFunction(this, "GetImagesFunc", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "../lambdas/api/get_images")),
      architecture: lambda.Architecture.ARM_64,
      environment: {
        TABLE_NAME: table.tableName,
        GEMINI_SECRET_ARN: geminiApiKeySecret.secretArn,
      },
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
    });

    table.grantReadData(getImagesLambda);
    geminiApiKeySecret.grantRead(getImagesLambda);

    // E3b: GetImagesFunc is no longer a public Function URL. It sits behind
    // API Gateway at GET /v1/images with the Cognito authorizer, so the
    // dashboard must send a JWT and the handler scopes results to the token's
    // tenant (no more hardcoded jose-test-user).
    const imagesV1Resource = v1.addResource("images");
    imagesV1Resource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getImagesLambda),
      {
        authorizer: apiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    new cdk.CfnOutput(this, "TideWatchImagesEndpoint", {
      value: `https://api.galileo-space.com/v1/images`,
      description: "Authenticated dashboard images endpoint (Cognito JWT required)",
    });

    // Cognito outputs (galileo-website needs these to configure Amplify Auth).
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    // ============================================================
    // 8. COMMERCIAL API TIERS (TideWatch E7)
    // One API Gateway usage plan per pricing tier (throttle + monthly quota).
    // Tenants using direct machine-to-machine API access are issued an API key
    // bound to their tier's plan at onboarding (see E9/E11). The dashboard uses
    // the Cognito JWT and the stage-level default throttle above.
    // ============================================================
    for (const tier of ApiTiers) {
      new apigateway.UsagePlan(this, `UsagePlan${tier.name}`, {
        name: `TideWatch-${tier.name}`,
        description: `${tier.name} tier: ${tier.rateLimit} req/s, ${tier.monthlyQuota}/mo`,
        throttle: { rateLimit: tier.rateLimit, burstLimit: tier.burstLimit },
        quota: {
          limit: tier.monthlyQuota,
          period: apigateway.Period.MONTH,
        },
        apiStages: [{ stage: api.deploymentStage }],
      });
    }
  }
}
