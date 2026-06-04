"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MusterTrainingStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const s3n = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
// Existing EC2 instance — stopped when idle, started on demand.
const INSTANCE_ID = "i-0231dba6961baefbc";
const GITHUB_REPO = "git@github.com:jose-galileo-space/fusion_model_orin_nx_gpu.git";
class MusterTrainingStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
            ],
        });
        // S3 full access to artifacts bucket
        artifactsBucket.grantReadWrite(trainingRole);
        // Also read from the OrbitalStack processed bucket for real EO data (future)
        trainingRole.addToPolicy(new iam.PolicyStatement({
            actions: ["s3:GetObject", "s3:ListBucket"],
            resources: [
                "arn:aws:s3:::orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa",
                "arn:aws:s3:::orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa/*",
            ],
        }));
        // EC2 self-stop permission (used by training script to stop itself when done)
        trainingRole.addToPolicy(new iam.PolicyStatement({
            actions: ["ec2:StopInstances"],
            resources: [
                `arn:aws:ec2:${this.region}:${this.account}:instance/${INSTANCE_ID}`,
            ],
        }));
        const instanceProfile = new iam.CfnInstanceProfile(this, "MusterInstanceProfile", {
            roles: [trainingRole.roleName],
            instanceProfileName: "MusterTrainingInstanceProfile",
        });
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
        attachProfileFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ec2:AssociateIamInstanceProfile",
                "ec2:DisassociateIamInstanceProfile",
                "ec2:DescribeIamInstanceProfileAssociations",
                "iam:PassRole",
            ],
            resources: ["*"],
        }));
        const attachProfile = new cr.AwsCustomResource(this, "AttachIamProfile", {
            onCreate: {
                service: "Lambda",
                action: "invoke",
                parameters: {
                    FunctionName: attachProfileFn.functionName,
                    Payload: JSON.stringify({
                        RequestType: "Create",
                        ResourceProperties: {
                            InstanceId: INSTANCE_ID,
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
        });
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
        autoStopFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["ec2:StopInstances"],
            resources: [
                `arn:aws:ec2:${this.region}:${this.account}:instance/${INSTANCE_ID}`,
            ],
        }));
        // Trigger auto-stop when a .pt checkpoint is uploaded
        artifactsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(autoStopFn), { prefix: "checkpoints/", suffix: ".pt" });
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
exports.MusterTrainingStack = MusterTrainingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVzdGVyLXRyYWluaW5nLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibXVzdGVyLXRyYWluaW5nLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBeUM7QUFDekMseURBQTJDO0FBQzNDLCtEQUFpRDtBQUNqRCxzRUFBd0Q7QUFDeEQseURBQTJDO0FBRTNDLGlFQUFtRDtBQUtuRCxnRUFBZ0U7QUFDaEUsTUFBTSxXQUFXLEdBQUcscUJBQXFCLENBQUM7QUFDMUMsTUFBTSxXQUFXLEdBQUcsZ0VBQWdFLENBQUM7QUFFckYsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLCtEQUErRDtRQUMvRCxvQ0FBb0M7UUFDcEMsK0RBQStEO1FBQy9ELE1BQU0sZUFBZSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDN0QsVUFBVSxFQUFFLDRCQUE0QixJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ3RELFNBQVMsRUFBRSxJQUFJO1lBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsOENBQThDO29CQUM5QyxFQUFFLEVBQUUsd0JBQXdCO29CQUM1QixNQUFNLEVBQUUsY0FBYztvQkFDdEIsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNsRCwwQkFBMEIsRUFBRSxDQUFDO2lCQUM5QjtnQkFDRDtvQkFDRSwwQ0FBMEM7b0JBQzFDLEVBQUUsRUFBRSxhQUFhO29CQUNqQixNQUFNLEVBQUUsT0FB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QVcsQ0FBQyxRQUFRO1lBQzNCLFdBQVcsRUFBRSw0R0FBNEc7U0FDMUgsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsMENBQTBDLFdBQVcsMkNBQTJDO1lBQ3ZHLFdBQVcsRUFBRSxxQ0FBcUM7U0FDbkQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsa0NBQWtDLFdBQVcsMkNBQTJDO1lBQy9GLFdBQVcsRUFBRSw4Q0FBOEM7U0FDNUQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOU9ELGtEQThPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBzM24gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zXCI7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zbnNcIjtcbmltcG9ydCAqIGFzIHN1YnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9uc1wiO1xuaW1wb3J0ICogYXMgY3IgZnJvbSBcImF3cy1jZGstbGliL2N1c3RvbS1yZXNvdXJjZXNcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuXG4vLyBFeGlzdGluZyBFQzIgaW5zdGFuY2Ug4oCUIHN0b3BwZWQgd2hlbiBpZGxlLCBzdGFydGVkIG9uIGRlbWFuZC5cbmNvbnN0IElOU1RBTkNFX0lEID0gXCJpLTAyMzFkYmE2OTYxYmFlZmJjXCI7XG5jb25zdCBHSVRIVUJfUkVQTyA9IFwiZ2l0QGdpdGh1Yi5jb206am9zZS1nYWxpbGVvLXNwYWNlL2Z1c2lvbl9tb2RlbF9vcmluX254X2dwdS5naXRcIjtcblxuZXhwb3J0IGNsYXNzIE11c3RlclRyYWluaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxLiBTMyDigJQgVHJhaW5pbmcgYXJ0aWZhY3RzIGJ1Y2tldFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGFydGlmYWN0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJNdXN0ZXJBcnRpZmFjdHNcIiwge1xuICAgICAgYnVja2V0TmFtZTogYGdhbGlsZW8tbXVzdGVyLWFydGlmYWN0cy0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIC8vIEtlZXAgb25seSBsYXN0IDUgdmVyc2lvbnMgb2YgYW55IGNoZWNrcG9pbnRcbiAgICAgICAgICBpZDogXCJleHBpcmUtb2xkLWNoZWNrcG9pbnRzXCIsXG4gICAgICAgICAgcHJlZml4OiBcImNoZWNrcG9pbnRzL1wiLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uc1RvUmV0YWluOiA1LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgLy8gQXV0by1leHBpcmUgdHJhaW5pbmcgbG9ncyBhZnRlciA5MCBkYXlzXG4gICAgICAgICAgaWQ6IFwiZXhwaXJlLWxvZ3NcIixcbiAgICAgICAgICBwcmVmaXg6IFwibG9ncy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVRdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDIuIElBTSDigJQgUm9sZSBmb3IgRUMyIHRyYWluaW5nIGluc3RhbmNlXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgdHJhaW5pbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiTXVzdGVyVHJhaW5pbmdSb2xlXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiZWMyLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBkZXNjcmlwdGlvbjogXCJNdVNUZVIgdHJhaW5pbmcgRUMyOiBTMyByZWFkL3dyaXRlICsgU1NNIGFjY2Vzc1wiLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIC8vIFNTTSDigJQgYWxsb3dzIHRlcm1pbmFsIGFjY2VzcyB3aXRob3V0IGEgcHVibGljIElQXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcbiAgICAgICAgICBcIkFtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmVcIlxuICAgICAgICApLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFMzIGZ1bGwgYWNjZXNzIHRvIGFydGlmYWN0cyBidWNrZXRcbiAgICBhcnRpZmFjdHNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodHJhaW5pbmdSb2xlKTtcblxuICAgIC8vIEFsc28gcmVhZCBmcm9tIHRoZSBPcmJpdGFsU3RhY2sgcHJvY2Vzc2VkIGJ1Y2tldCBmb3IgcmVhbCBFTyBkYXRhIChmdXR1cmUpXG4gICAgdHJhaW5pbmdSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRPYmplY3RcIiwgXCJzMzpMaXN0QnVja2V0XCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBcImFybjphd3M6czM6OjpvcmJpdGFsc3RhY2stYWxwaGEtcHJvY2Vzc2VkYnVja2V0ZGU1OTkzMGMtbXV2cjh0bW5zMGZhXCIsXG4gICAgICAgICAgXCJhcm46YXdzOnMzOjo6b3JiaXRhbHN0YWNrLWFscGhhLXByb2Nlc3NlZGJ1Y2tldGRlNTk5MzBjLW11dnI4dG1uczBmYS8qXCIsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBFQzIgc2VsZi1zdG9wIHBlcm1pc3Npb24gKHVzZWQgYnkgdHJhaW5pbmcgc2NyaXB0IHRvIHN0b3AgaXRzZWxmIHdoZW4gZG9uZSlcbiAgICB0cmFpbmluZ1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImVjMjpTdG9wSW5zdGFuY2VzXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czplYzI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9Omluc3RhbmNlLyR7SU5TVEFOQ0VfSUR9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IGluc3RhbmNlUHJvZmlsZSA9IG5ldyBpYW0uQ2ZuSW5zdGFuY2VQcm9maWxlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiTXVzdGVySW5zdGFuY2VQcm9maWxlXCIsXG4gICAgICB7XG4gICAgICAgIHJvbGVzOiBbdHJhaW5pbmdSb2xlLnJvbGVOYW1lXSxcbiAgICAgICAgaW5zdGFuY2VQcm9maWxlTmFtZTogXCJNdXN0ZXJUcmFpbmluZ0luc3RhbmNlUHJvZmlsZVwiLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAzLiBBdHRhY2ggSUFNIHByb2ZpbGUgdG8gZXhpc3RpbmcgRUMyIHZpYSBDdXN0b20gUmVzb3VyY2VcbiAgICAvLyAgICAoaW5zdGFuY2UgYWxyZWFkeSBleGlzdHMg4oCUIENESyBjYW4ndCBkbyB0aGlzIGRlY2xhcmF0aXZlbHkpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgYXR0YWNoUHJvZmlsZUZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkF0dGFjaFByb2ZpbGVGblwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQgYm90bzMsIGpzb25cblxuZGVmIGhhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGVjMiA9IGJvdG8zLmNsaWVudCgnZWMyJylcbiAgICBpbnN0YW5jZV9pZCA9IGV2ZW50WydSZXNvdXJjZVByb3BlcnRpZXMnXVsnSW5zdGFuY2VJZCddXG4gICAgcHJvZmlsZV9hcm4gPSBldmVudFsnUmVzb3VyY2VQcm9wZXJ0aWVzJ11bJ1Byb2ZpbGVBcm4nXVxuICAgIHJlcXVlc3RfdHlwZSA9IGV2ZW50WydSZXF1ZXN0VHlwZSddXG5cbiAgICBpZiByZXF1ZXN0X3R5cGUgaW4gKCdDcmVhdGUnLCAnVXBkYXRlJyk6XG4gICAgICAgICMgRGV0YWNoIGV4aXN0aW5nIHByb2ZpbGUgaWYgYW55XG4gICAgICAgIHRyeTpcbiAgICAgICAgICAgIGFzc29jcyA9IGVjMi5kZXNjcmliZV9pYW1faW5zdGFuY2VfcHJvZmlsZV9hc3NvY2lhdGlvbnMoXG4gICAgICAgICAgICAgICAgRmlsdGVycz1beydOYW1lJzogJ2luc3RhbmNlLWlkJywgJ1ZhbHVlcyc6IFtpbnN0YW5jZV9pZF19LFxuICAgICAgICAgICAgICAgICAgICAgICAgIHsnTmFtZSc6ICdzdGF0ZScsICdWYWx1ZXMnOiBbJ2Fzc29jaWF0ZWQnXX1dXG4gICAgICAgICAgICApWydJYW1JbnN0YW5jZVByb2ZpbGVBc3NvY2lhdGlvbnMnXVxuICAgICAgICAgICAgZm9yIGEgaW4gYXNzb2NzOlxuICAgICAgICAgICAgICAgIGVjMi5kaXNhc3NvY2lhdGVfaWFtX2luc3RhbmNlX3Byb2ZpbGUoQXNzb2NpYXRpb25JZD1hWydBc3NvY2lhdGlvbklkJ10pXG4gICAgICAgIGV4Y2VwdCBFeGNlcHRpb246XG4gICAgICAgICAgICBwYXNzXG4gICAgICAgIGVjMi5hc3NvY2lhdGVfaWFtX2luc3RhbmNlX3Byb2ZpbGUoXG4gICAgICAgICAgICBJYW1JbnN0YW5jZVByb2ZpbGU9eydBcm4nOiBwcm9maWxlX2Fybn0sXG4gICAgICAgICAgICBJbnN0YW5jZUlkPWluc3RhbmNlX2lkXG4gICAgICAgIClcbiAgICByZXR1cm4geydQaHlzaWNhbFJlc291cmNlSWQnOiBmJ3tpbnN0YW5jZV9pZH0tcHJvZmlsZSd9XG5gKSxcbiAgICB9KTtcblxuICAgIGF0dGFjaFByb2ZpbGVGbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImVjMjpBc3NvY2lhdGVJYW1JbnN0YW5jZVByb2ZpbGVcIixcbiAgICAgICAgICBcImVjMjpEaXNhc3NvY2lhdGVJYW1JbnN0YW5jZVByb2ZpbGVcIixcbiAgICAgICAgICBcImVjMjpEZXNjcmliZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9uc1wiLFxuICAgICAgICAgIFwiaWFtOlBhc3NSb2xlXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IGF0dGFjaFByb2ZpbGUgPSBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UoXG4gICAgICB0aGlzLFxuICAgICAgXCJBdHRhY2hJYW1Qcm9maWxlXCIsXG4gICAgICB7XG4gICAgICAgIG9uQ3JlYXRlOiB7XG4gICAgICAgICAgc2VydmljZTogXCJMYW1iZGFcIixcbiAgICAgICAgICBhY3Rpb246IFwiaW52b2tlXCIsXG4gICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiBhdHRhY2hQcm9maWxlRm4uZnVuY3Rpb25OYW1lLFxuICAgICAgICAgICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBSZXF1ZXN0VHlwZTogXCJDcmVhdGVcIixcbiAgICAgICAgICAgICAgUmVzb3VyY2VQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgSW5zdGFuY2VJZDogIElOU1RBTkNFX0lELFxuICAgICAgICAgICAgICAgIFByb2ZpbGVBcm46IHsgXCJGbjo6R2V0QXR0XCI6IFtpbnN0YW5jZVByb2ZpbGUubG9naWNhbElkLCBcIkFyblwiXSB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihcImF0dGFjaC1pYW0tcHJvZmlsZVwiKSxcbiAgICAgICAgfSxcbiAgICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU3RhdGVtZW50cyhbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgYWN0aW9uczogW1wibGFtYmRhOkludm9rZUZ1bmN0aW9uXCJdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbYXR0YWNoUHJvZmlsZUZuLmZ1bmN0aW9uQXJuXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9XG4gICAgKTtcbiAgICBhdHRhY2hQcm9maWxlLm5vZGUuYWRkRGVwZW5kZW5jeShpbnN0YW5jZVByb2ZpbGUpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNC4gTGFtYmRhIOKAlCBBdXRvLXN0b3AgRUMyIHdoZW4gY2hlY2twb2ludCBsYW5kcyBpbiBTM1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGF1dG9TdG9wRm4gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQXV0b1N0b3BGblwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgSU5TVEFOQ0VfSUQgfSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGJvdG8zLCBvcywganNvbiwgbG9nZ2luZ1xubG9nZ2VyID0gbG9nZ2luZy5nZXRMb2dnZXIoKVxubG9nZ2VyLnNldExldmVsKGxvZ2dpbmcuSU5GTylcblxuZGVmIGhhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGVjMiA9IGJvdG8zLmNsaWVudCgnZWMyJylcbiAgICBpbnN0YW5jZV9pZCA9IG9zLmVudmlyb25bJ0lOU1RBTkNFX0lEJ11cbiAgICBmb3IgcmVjb3JkIGluIGV2ZW50LmdldCgnUmVjb3JkcycsIFtdKTpcbiAgICAgICAga2V5ID0gcmVjb3JkWydzMyddWydvYmplY3QnXVsna2V5J11cbiAgICAgICAgbG9nZ2VyLmluZm8oZidDaGVja3BvaW50IHVwbG9hZGVkOiB7a2V5fSDigJQgc3RvcHBpbmcge2luc3RhbmNlX2lkfScpXG4gICAgICAgIGVjMi5zdG9wX2luc3RhbmNlcyhJbnN0YW5jZUlkcz1baW5zdGFuY2VfaWRdKVxuICAgIHJldHVybiB7J3N0YXR1cyc6ICdzdG9wcGVkJ31cbmApLFxuICAgIH0pO1xuXG4gICAgYXV0b1N0b3BGbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImVjMjpTdG9wSW5zdGFuY2VzXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czplYzI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9Omluc3RhbmNlLyR7SU5TVEFOQ0VfSUR9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFRyaWdnZXIgYXV0by1zdG9wIHdoZW4gYSAucHQgY2hlY2twb2ludCBpcyB1cGxvYWRlZFxuICAgIGFydGlmYWN0c0J1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oYXV0b1N0b3BGbiksXG4gICAgICB7IHByZWZpeDogXCJjaGVja3BvaW50cy9cIiwgc3VmZml4OiBcIi5wdFwiIH1cbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNS4gU05TIOKAlCBFbWFpbCBub3RpZmljYXRpb24gb24gdHJhaW5pbmcgY29tcGxldGVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBub3RpZnlUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgXCJUcmFpbmluZ0RvbmVUb3BpY1wiLCB7XG4gICAgICBkaXNwbGF5TmFtZTogXCJNdVNUZVIgVHJhaW5pbmcgQ29tcGxldGVcIixcbiAgICB9KTtcblxuICAgIC8vIEF1dG8tc3RvcCBMYW1iZGEgYWxzbyBwdWJsaXNoZXMgdG8gU05TXG4gICAgYXV0b1N0b3BGbi5hZGRFbnZpcm9ubWVudChcIk5PVElGWV9UT1BJQ19BUk5cIiwgbm90aWZ5VG9waWMudG9waWNBcm4pO1xuICAgIG5vdGlmeVRvcGljLmdyYW50UHVibGlzaChhdXRvU3RvcEZuKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDYuIE91dHB1dHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIkFydGlmYWN0c0J1Y2tldE5hbWVcIiwge1xuICAgICAgdmFsdWU6IGFydGlmYWN0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiVXBsb2FkIHRyYWluaW5nIGRhdGEgaGVyZTsgcHVsbCBjaGVja3BvaW50cyBmcm9tIGhlcmVcIixcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVHJhaW5pbmdSb2xlQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0cmFpbmluZ1JvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIklBTSByb2xlIGF0dGFjaGVkIHRvIHRoZSB0cmFpbmluZyBFQzJcIixcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiTm90aWZ5VG9waWNBcm5cIiwge1xuICAgICAgdmFsdWU6IG5vdGlmeVRvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiU3Vic2NyaWJlIHlvdXIgZW1haWw6IGF3cyBzbnMgc3Vic2NyaWJlIC0tdG9waWMtYXJuIDxhcm4+IC0tcHJvdG9jb2wgZW1haWwgLS1ub3RpZmljYXRpb24tZW5kcG9pbnQgPGVtYWlsPlwiLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTdGFydFRyYWluaW5nQ29tbWFuZFwiLCB7XG4gICAgICB2YWx1ZTogYGF3cyBlYzIgc3RhcnQtaW5zdGFuY2VzIC0taW5zdGFuY2UtaWRzICR7SU5TVEFOQ0VfSUR9IC0tcmVnaW9uIHVzLXdlc3QtMSAtLXByb2ZpbGUgc2VycmFuby1kZXZgLFxuICAgICAgZGVzY3JpcHRpb246IFwiUnVuIHRoaXMgdG8ga2ljayBvZmYgYSB0cmFpbmluZyBydW5cIixcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU1NNQ29ubmVjdENvbW1hbmRcIiwge1xuICAgICAgdmFsdWU6IGBhd3Mgc3NtIHN0YXJ0LXNlc3Npb24gLS10YXJnZXQgJHtJTlNUQU5DRV9JRH0gLS1yZWdpb24gdXMtd2VzdC0xIC0tcHJvZmlsZSBzZXJyYW5vLWRldmAsXG4gICAgICBkZXNjcmlwdGlvbjogXCJTU0gtZnJlZSB0ZXJtaW5hbCBpbnRvIHRoZSB0cmFpbmluZyBpbnN0YW5jZVwiLFxuICAgIH0pO1xuICB9XG59XG4iXX0=