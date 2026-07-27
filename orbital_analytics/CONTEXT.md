# CONTEXT.md — orbital_analytics (OrbitalStack CDK)

AWS CDK TypeScript stack defining the full Galileo Space satellite intelligence
pipeline. Deployed to `us-west-1`, account `559156180869`.

---

## Stack: OrbitalStack

Single CDK stack with 7 layers. Stage-configurable (alpha / beta / prod).

```
User Upload
    → POST api.galileo-space.com/images  (IngestLambda, Node 20)
    → S3 RawBucket
    → SNS → SQS → CorrectionLambda  (Python 3.11, normalizes TIFF/RAW → JPG)
    → S3 ProcessedBucket
    → SQS → AnalyticsTrigger  (Node 20)
    → Step Functions OrbitalStateMachine
        Step 1: ObjDetectFunc  (YOLOv8n-OBB, Docker, x86_64, 4GB, 5min)
        Step 2: GeminiFunc  (Gemini 2.5 Flash, Python, structured JSON)
    → DynamoDB OrbTable  (imageId PK, ownerId SK, OwnerIndex GSI)
    → GetImagesFunc  (ARM64 Docker, Function URL, JIT Gemini synthesis)
    → React dashboard (galileo-website)
```

---

## Resources

| Resource | ID / Name | Notes |
|----------|-----------|-------|
| DynamoDB | `OrbTable` | PAY_PER_REQUEST, OwnerIndex GSI |
| S3 Raw | `orbitalstack-alpha-rawbucket*` | TIFF/RAW, EventBridge on |
| S3 Processed | `orbitalstack-alpha-processedbucket*` | JPG only |
| API Gateway | `api.galileo-space.com` | ACM cert, Route53 A record |
| Step Functions | `OrbitalStateMachine` | ObjDetect → Gemini chain |
| IoT Core | `galileo/missions/tasking` | Satellite tasking relay |

---

## Lambda Functions

| Function | Runtime | Trigger | Purpose |
|----------|---------|---------|---------|
| `IngestLambda` | Node 20 | POST /images | Write metadata to DB, upload to raw bucket |
| `CorrectionLambda` | Python 3.11 | SQS (ProcessQueue) | Normalize format → processed bucket |
| `ObjDetectFunc` | Python Docker x86 | Step Functions | YOLOv8n-OBB — planes, vehicles, ships |
| `GeminiFunc` | Python 3.11 | Step Functions | Gemini 2.5 Flash structured analysis |
| `AnalyticsTrigger` | Node 20 | SQS (AnalyticsQueue) | Start Step Functions execution |
| `SummarizerLambda` | Python 3.11 | GET /summary | **STUB — not implemented** |
| `GetImagesFunc` | Python Docker ARM64 | Function URL | JIT synthesis, dashboard API |
| `TaskingLambda` | Node 20 | POST /task | IoT Core publish relay |

---

## Stage Config

| Stage | Removal Policy | Processing Memory |
|-------|---------------|------------------|
| alpha | DESTROY | 3008 MB |
| beta | RETAIN | 1024 MB |
| prod | RETAIN | 1024 MB |

---

## Deploy + Secrets (TideWatch E2)

The Gemini API key now lives in AWS Secrets Manager (`GeminiApiKey`), not in a
plaintext Lambda env var. Deploy the stack, then populate the secret once:

```bash
npx cdk deploy --context stage=alpha --profile serrano-dev
# grab the GeminiApiKey secret ARN from the console/outputs, then:
aws secretsmanager put-secret-value \
  --secret-id <GeminiApiKey-arn> \
  --secret-string '{"GOOGLE_API_KEY":"<gemini-api-key>"}' \
  --profile serrano-dev
```

Handlers read the key from the secret at cold start (env var `GEMINI_SECRET_ARN`).
`GOOGLE_API_KEY` as an env var is now only a local/dev fallback, never required at deploy.

---

## What's Missing / TODO

| Item | Priority | Notes |
|------|----------|-------|
| `IngestLambda` source | High | `lambdas/ingest/` directory missing from repo |
| `AnalyticsTrigger` source | High | `lambdas/triggers/` directory missing |
| `TaskingLambda` source | Medium | `lambdas/tasking/` directory missing |
| `SummarizerLambda` impl | Medium | Stub only — empty handler |
| Reports Engine (v2) | Low | Many-to-many image→report, `POST /reports/{id}/analyze` |
| Parallel Step Functions | Low | Fan-out: ObjDetect \|\| RF Analysis \|\| Thermal |
| GeoIndex on DynamoDB | Low | `geoHash` GSI commented out in stack |
| ~~Auth on GetImagesFunc~~ | Done (E3b) | Cognito authorizer + `GET /v1/images`; public Function URL removed; tenant from JWT claim. `/task` also protected. Legacy `/images`+`/summary` still open pending frontend migration. |

---

## Connection to MuSTeR / fusion_model_orin_nx_gpu

The `ProcessedBucket` (normalized EO imagery) is the future source of real
training data for the MuSTeR fusion model. When MuSTeR moves to real data:

```
ProcessedBucket (EO JPGs)
    → MuSTeR training EC2 (muster_training CDK stack, coming soon)
    → compressed checkpoint → S3 galileo-muster-artifacts
    → Orin NX pulls checkpoint → builds TRT engine → edge inference
    → RF+EO fusion detections written back to OrbTable
```

The `ObjDetectFunc` (YOLOv8 EO-only) will eventually be **augmented or replaced**
by the fusion model's RF+EO classification for higher-confidence target ID.
