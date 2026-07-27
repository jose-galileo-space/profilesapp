# SECURITY_REVIEW.md — TideWatch / OrbitalStack

**Date:** 2026-07-23 (cycle 17)
**Scope:** the `orbital_analytics` CDK stack + Lambda handlers as built through E1–E12a.
**Reviewer:** Autonomous Product Build Loop. This is an internal self-review, not a substitute for a third-party audit before production sale.

## 1. Posture summary

| Area | State | Notes |
|------|-------|-------|
| API authentication | Good (product surface) | All `/v1/*` routes require a Cognito JWT; `/task` protected (E3). |
| Secrets | Good | Gemini key in Secrets Manager, read at cold start; no plaintext env or template value (E2). |
| Tenant isolation | Good, structural | Reads/writes scoped by `pk=TENANT#<tenantId>`; AOI/report/activity handlers verify ownership via GSI1 before returning; `tenantId` comes from the JWT claim, not client input. |
| Transport | Good | HTTPS via ACM + API Gateway; custom domain. |
| Rate limiting | Good | Stage-level default throttle + per-tier usage plans (E7). |
| Data at rest | Adequate (defaults) | DynamoDB + S3 use AWS-managed SSE by default; not explicitly hardened to CMK. |
| Least privilege | Good | IAM grants are per-resource (`grantRead`/`grantWrite`/`grantReadWriteData`), not wildcard. |

## 2. Findings (ranked)

### F1 — Legacy `/images` (ingest) and `/summary` were unauthenticated — HIGH — **RESOLVED (cycle 20)**
`POST /images` (IngestLambda) writes to DynamoDB + S3 and `GET /summary` reads data — both previously had no authorizer.
**Fix applied:** the Cognito authorizer is now attached to both (`lib/orbital-stack.ts`). A regression test (`orbital_stack.test.ts`, "F1: every non-OPTIONS API method requires Cognito auth") asserts that no non-OPTIONS API Gateway method is left unauthenticated, so this cannot silently regress. No anonymous route into the pipeline remains.

### F2 — Prompt injection via `promptText` / scene content into Gemini — MEDIUM
`ReportsFunc.analyze` and `GeminiFunc` pass user/AOI-influenced text and image content into the LLM. A crafted `promptText` could attempt to override instructions.
**Mitigation in place:** analysis is grounded in measured evidence and outputs are stored, not executed. **Remediation:** add explicit input/instruction separation and length caps on `promptText`; treat LLM output as untrusted (already not executed). Low blast radius (no tool use), but note for buyers.

### F3 — Wide-open CORS (`*`) on API Gateway and handler responses — MEDIUM
`defaultCorsPreflightOptions.allowOrigins = ALL_ORIGINS` and handlers return `Access-Control-Allow-Origin: *`.
**Remediation:** restrict to the dashboard origin(s) per stage in `beta`/`prod`. Low risk while auth is JWT-based (no cookies), but tighten before launch.

### F4 — IngestLambda accepts base64 image in the request body — MEDIUM
Large uploads hit the API Gateway 10 MB / Lambda 6 MB payload ceilings and enable cheap large-request abuse.
**Remediation:** switch to presigned-S3-URL uploads (the RawBucket already has a browser `PUT` CORS rule for exactly this); validate content-type/size.

### F5 — No WAF on the API — LOW/MEDIUM
No managed rules for common exploits / rate anomalies beyond usage-plan throttling.
**Remediation:** attach AWS WAF (managed rule sets + rate rule) to the API stage for `prod`.

### F6 — `GetImagesFunc`/handlers default tenant fallback (`jose-test-user`) — LOW
When no authorizer context is present the handlers fall back to a legacy tenant. Not reachable through the deployed authorizer-protected `/v1` routes, but should be removed once legacy paths are closed.
**Remediation:** drop the fallback; return 401 instead.

### F7 — Secrets rotation not automated — LOW
`GeminiApiKey` is set manually and not on a rotation schedule.
**Remediation:** add a rotation schedule/runbook step; low urgency for a single 3rd-party key.

### F8 — Data-at-rest not on customer-managed keys — LOW
Default AWS-managed encryption only.
**Remediation:** for enterprise buyers requiring CMK/BYOK, add KMS keys to CoreTable/OrbTable/buckets.

## 3. Explicitly out of scope / accepted for now

- Self-service tenant onboarding is a manual runbook process (Cognito user + `custom:tenantId` + API key). Acceptable for design-partner phase; productize before scale.
- The frontend (`galileo-website`) has NOT yet been migrated to the Cognito/`/v1` contract — until then the authenticated product is not end-to-end usable through the UI. This is a delivery gap, tracked separately, not a stack vulnerability.

## 4. Verdict

The **entire API surface** (`/v1`, `/task`, and now the legacy `/images`+`/summary`) is auth-sound, tenant-isolated, secret-safe, and rate-limited.
**F1 (the one prior sale-blocker) is resolved (cycle 20)** and locked by a regression test; the frontend has been migrated (E13).
The remaining findings (F2–F8) are hardening — schedule across the first paid deployments, none blocking a design-partner launch.
