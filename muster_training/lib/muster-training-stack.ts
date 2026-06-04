import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";

// Existing EC2 instance — stopped when idle, started on demand.
const INSTANCE_ID = "i-0231dba6961baefbc";
const GITHUB_REPO = "git@github.com:jose-galileo-space/fusion_model_orin_nx_gpu.git";

export class MusterTrainingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // 1. S3 — Training artifacts bucket
    // ============================================================
    const artifactsBucket = new s3.Bucket(this, "MusterArtifacts", {
      bucketName: `galileo-muster-artifacts-${this.account}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Keep only last 5 versions of any checkpoint
          id: "expire-old-checkpoints",
          prefix: "checkpoints/",
          noncurrentVersionExpiration: cdk.Duration.days(30),
          noncurrentVersionsToRetain: 5,
        },
        {
          // Auto-expire training logs after 90 days
          id: "expire-logs",
          prefix: "logs/",
          expiration: cdk.Duration.days(90),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    // ============================================================
    // 2. IAM — Role for EC2 training instance
    // ============================================================
    const trainingRole = new iam.Role(this, "MusterTrainingRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "MuSTeR training EC2: S3 read/write + SSM access",
      managedPolicies: [
        // SSM — allows terminal access without a public IP
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // S3 full access to artifacts bucket
    artifactsBucket.grantReadWrite(trainingRole);

    // Also read from the OrbitalStack processed bucket for real EO data (future)
    trainingRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          "arn:aws:s3:::orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa",
          "arn:aws:s3:::orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa/*",
        ],
      })
    );

    // EC2 self-stop permission (used by training script to stop itself when done)
    trainingRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:StopInstances"],
        resources: [
          `arn:aws:ec2:${this.region}:${this.account}:instance/${INSTANCE_ID}`,
        ],
      })
    );

    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "MusterInstanceProfile",
      {
        roles: [trainingRole.roleName],
        instanceProfileName: "MusterTrainingInstanceProfile",
      }
    );

    // ============================================================
    // 3. Attach IAM profile to existing EC2 via Custom Resource
    //    (instance already exists — CDK can't do this declaratively)
    // ============================================================
    const attachProfileFn = new lambda.Function(this, "AttachProfileFn", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromInline(`
import boto3, json

def handler(event, context):
    ec2 = boto3.client('ec2')
    instance_id = event['ResourceProperties']['InstanceId']
    profile_arn = event['ResourceProperties']['ProfileArn']
    request_type = event['RequestType']

    if request_type in ('Create', 'Update'):
        # Detach existing profile if any
        try:
            assocs = ec2.describe_iam_instance_profile_associations(
                Filters=[{'Name': 'instance-id', 'Values': [instance_id]},
                         {'Name': 'state', 'Values': ['associated']}]
            )['IamInstanceProfileAssociations']
            for a in assocs:
                ec2.disassociate_iam_instance_profile(AssociationId=a['AssociationId'])
        except Exception:
            pass
        ec2.associate_iam_instance_profile(
            IamInstanceProfile={'Arn': profile_arn},
            InstanceId=instance_id
        )
    return {'PhysicalResourceId': f'{instance_id}-profile'}
`),
    });

    attachProfileFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:AssociateIamInstanceProfile",
          "ec2:DisassociateIamInstanceProfile",
          "ec2:DescribeIamInstanceProfileAssociations",
          "iam:PassRole",
        ],
        resources: ["*"],
      })
    );

    const attachProfile = new cr.AwsCustomResource(
      this,
      "AttachIamProfile",
      {
        onCreate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: attachProfileFn.functionName,
            Payload: JSON.stringify({
              RequestType: "Create",
              ResourceProperties: {
                InstanceId:  INSTANCE_ID,
                ProfileArn: { "Fn::GetAtt": [instanceProfile.logicalId, "Arn"] },
              },
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of("attach-iam-profile"),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: [attachProfileFn.functionArn],
          }),
        ]),
      }
    );
    attachProfile.node.addDependency(instanceProfile);

    // ============================================================
    // 4. Lambda — Auto-stop EC2 when checkpoint lands in S3
    // ============================================================
    const autoStopFn = new lambda.Function(this, "AutoStopFn", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      environment: { INSTANCE_ID },
      code: lambda.Code.fromInline(`
import boto3, os, json, logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    ec2 = boto3.client('ec2')
    instance_id = os.environ['INSTANCE_ID']
    for record in event.get('Records', []):
        key = record['s3']['object']['key']
        logger.info(f'Checkpoint uploaded: {key} — stopping {instance_id}')
        ec2.stop_instances(InstanceIds=[instance_id])
    return {'status': 'stopped'}
`),
    });

    autoStopFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ec2:StopInstances"],
        resources: [
          `arn:aws:ec2:${this.region}:${this.account}:instance/${INSTANCE_ID}`,
        ],
      })
    );

    // Trigger auto-stop when a .pt checkpoint is uploaded
    artifactsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(autoStopFn),
      { prefix: "checkpoints/", suffix: ".pt" }
    );

    // ============================================================
    // 5. SNS — Email notification on training complete
    // ============================================================
    const notifyTopic = new sns.Topic(this, "TrainingDoneTopic", {
      displayName: "MuSTeR Training Complete",
    });

    // Auto-stop Lambda also publishes to SNS
    autoStopFn.addEnvironment("NOTIFY_TOPIC_ARN", notifyTopic.topicArn);
    notifyTopic.grantPublish(autoStopFn);

    // ============================================================
    // 6. Outputs
    // ============================================================
    new cdk.CfnOutput(this, "ArtifactsBucketName", {
      value: artifactsBucket.bucketName,
      description: "Upload training data here; pull checkpoints from here",
    });

    new cdk.CfnOutput(this, "TrainingRoleArn", {
      value: trainingRole.roleArn,
      description: "IAM role attached to the training EC2",
    });

    new cdk.CfnOutput(this, "NotifyTopicArn", {
      value: notifyTopic.topicArn,
      description: "Subscribe your email: aws sns subscribe --topic-arn <arn> --protocol email --notification-endpoint <email>",
    });

    new cdk.CfnOutput(this, "StartTrainingCommand", {
      value: `aws ec2 start-instances --instance-ids ${INSTANCE_ID} --region us-west-1 --profile serrano-dev`,
      description: "Run this to kick off a training run",
    });

    new cdk.CfnOutput(this, "SSMConnectCommand", {
      value: `aws ssm start-session --target ${INSTANCE_ID} --region us-west-1 --profile serrano-dev`,
      description: "SSH-free terminal into the training instance",
    });
  }
}
