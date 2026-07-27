# RUNBOOK — TideWatch / OrbitalStack

Operational guide for deploying, configuring, seeding, and rolling back the stack.
Account `559156180869`, region `us-west-1`, SSO profile `serrano-dev`.

## 1. Prerequisites

- Node 20, Python 3.11, Docker (for the image-based Lambdas: ObjDetect, GetImages, Reports).
- AWS CLI logged in: `aws sso login --profile serrano-dev`.
- `cd orbital_analytics && npm ci`.

## 2. Deploy

```bash
npm run build
npx cdk diff  --context stage=alpha --profile serrano-dev
npx cdk deploy --context stage=alpha --profile serrano-dev
```

Stages: `alpha` (DESTROY removal, dev), `beta` / `prod` (RETAIN). Pick with `--context stage=<s>`.
Deploy no longer needs `GOOGLE_API_KEY` in the environment (moved to Secrets Manager, step 3).

## 3. Populate the Gemini secret (once per stage)

The `GeminiApiKey` secret starts empty. After the first deploy:

```bash
aws secretsmanager put-secret-value \
  --secret-id <GeminiApiKey-arn-from-console> \
  --secret-string '{"GOOGLE_API_KEY":"<gemini-api-key>"}' \
  --profile serrano-dev
```

Handlers read it at cold start via `GEMINI_SECRET_ARN`. Rotate by repeating `put-secret-value`.

## 4. Wire the frontend (galileo-website)

From the deploy outputs, configure Amplify Auth:

- `UserPoolId`, `UserPoolClientId` → Cognito login.
- API base `https://api.galileo-space.com`; call `/v1/*` with `Authorization: Bearer <Cognito idToken>`.
- Dashboard images: `GET /v1/images` (replaces the old public Function URL).

Until the frontend sends the JWT, the `/v1` surface (including images) returns 401. This is the intended contract; see SECURITY_REVIEW.md for the interim state of legacy `/images` and `/summary`.

## 5. Alerts + AIS

- Subscribe recipients to the `AlertsTopicArn` output (email or HTTPS):
  `aws sns subscribe --topic-arn <arn> --protocol email --notification-endpoint ops@example.com`
- Dark-vessel alerting is dormant until AIS is wired: set `AIS_MODE` on `AlertsFunc` to `stub` (demo) or `http` + `AIS_ENDPOINT` (real provider). Default `off`.

## 6. Seed the demo dataset

```bash
export CORE_TABLE_NAME=<CoreTable name from deploy>
export TABLE_NAME=<OrbTable name from deploy>
python product_loop/demo/seed.py --region us-west-1 --profile serrano-dev  # or --dry-run first
```

Idempotent. Backs the GO_TO_MARKET §6 demo.

## 7. Onboard a tenant

1. Create a Cognito user in `TideWatchUserPool` with a `custom:tenantId` attribute.
2. (Direct API users) issue an API key bound to the tenant's tier usage plan (`TideWatch-Watch|Pro|Enterprise`) and associate it.
3. Tenant scoping is automatic thereafter (every `/v1` read/write is keyed by the JWT's `custom:tenantId`).

## 8. Rollback

- CDK: redeploy the previous git revision (`git checkout <prev> && npm run build && npx cdk deploy ...`).
- `alpha` is disposable (`cdk destroy --context stage=alpha`); NEVER destroy `beta`/`prod` (RETAIN policy protects data, but confirm before any destroy).
- DynamoDB tables and buckets in `beta`/`prod` are RETAIN, so a stack delete leaves data intact.

## 9. Health checks

- `npx cdk synth --context stage=alpha` must exit 0.
- Post-deploy smoke: `GET /v1/aois` with a valid JWT returns 200; `GET /v1/usage` returns counters.
- CI (`.github/workflows/ci.yml`) runs build + jest + synth on every change under `orbital_analytics/`.
