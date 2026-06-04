# CONTEXT.md — profilesapp (Galileo Space Mono-Repo)

Central mono-repo for all Galileo Space software. Two active subdirectories today,
with a third (`muster_training/`) planned.

---

## Repository Structure

| Directory | What it is | Stack |
|-----------|-----------|-------|
| `galileo-website/` | React frontend — analyst dashboard, map UI | Vite + React + Amplify + Leaflet |
| `orbital_analytics/` | AWS CDK infrastructure — satellite imagery pipeline | TypeScript CDK + Python Lambdas |
| `muster_training/` *(planned)* | AWS CDK — EC2 training infra for MuSTeR fusion model | TypeScript CDK + Python user-data |

---

## AWS Account

| Field | Value |
|-------|-------|
| Account | serrano-dev (`559156180869`) |
| Region | `us-west-1` |
| CDK Bootstrap bucket | `cdk-hnb659fds-assets-559156180869-us-west-1` |
| SSO | `https://d-9167050abd.awsapps.com/start` (region: `us-west-1`) |
| SSO profile | `serrano-dev` |

---

## How the Repos Relate

```
fusion_model_orin_nx_gpu (separate repo — Orin NX edge device)
         │
         │  git push checkpoints → S3
         ▼
profilesapp/orbital_analytics
    orbitalstack-alpha-processedbucket  ←── EO imagery (future MuSTeR training data)
    orbitalstack-alpha-rawbucket        ←── raw satellite imagery
         │
         │  ObjDetectFunc (YOLOv8) + GeminiFunc
         ▼
    OrbTable (DynamoDB) ←── all detections + analysis
         │
         ▼
galileo-website (React dashboard — reads OrbTable via GetImagesFunc)
```

### Why fusion_model stays separate
- Runs on Orin NX (aarch64 edge device), not Lambda
- Python ML code (PyTorch, TensorRT) — unrelated to CDK/TypeScript
- Different deployment target and lifecycle
- Connects to this repo via **S3** (checkpoints in/out) and **DynamoDB** (writes detection results)

### What WILL move here (muster_training CDK stack)
- EC2 g4dn.xlarge start/stop automation
- S3 `galileo-muster-artifacts` bucket (checkpoints, ONNX, TRT engines)
- Lambda auto-stop on checkpoint upload
- IAM role granting EC2 → S3 access
- SSM for terminal access (no public IP)

---

## Deployment Commands

```bash
cd orbital_analytics
npm run build
npx cdk diff --context stage=alpha --profile serrano-dev
npx cdk deploy --context stage=alpha --profile serrano-dev
```

---

## Active S3 Buckets

| Bucket | Purpose |
|--------|---------|
| `orbitalstack-alpha-rawbucket0c3ee094-avk0f0nplpkq` | Raw satellite imagery uploads |
| `orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa` | Normalized JPG imagery |
| `galileo-space-image-assets` | Static image assets |
| `cdk-hnb659fds-assets-559156180869-us-west-1` | CDK bootstrap assets |
