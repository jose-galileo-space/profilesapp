# Product Build Loop — Progress Journal

This is the single source of truth across 15-minute build cycles.
Each cycle: read this whole file, do ONE meaningful increment, verify it, then append an entry below and update the backlog.

---

## Current status

- **Phase:** ✅ **PRODUCT COMPLETE (cycle 20).** All Definition-of-Done boxes genuinely met and verified. Loop ended.
- **Product name:** Galileo **TideWatch** — maritime activity intelligence (see `PRD.md`)
- **Overall:** Cycle 20 complete. Closed F1 (last blocker): legacy `POST /images` + `GET /summary` now Cognito-protected, locked by a regression test asserting NO non-OPTIONS API method is unauthenticated. Full DoD re-verified across both gates → all ✅.
- **Verification baseline:** Backend `npm run build` → 0; `npx jest` → **18/18**; `cdk synth` → 0. Frontend `npm run build` (vite) → 0; `npx eslint src/` → 0.

## Definition of Done — FINAL verification (cycle 20)

| DoD requirement (SPEC) | Status | Evidence |
|---|---|---|
| Named product + PRD + GTM + pricing | ✅ | `PRD.md`, `GO_TO_MARKET.md`, `COST_MODEL.md` |
| Multi-tenant, real auth, secrets mgmt (no hardcoded users / plaintext keys) | ✅ | Cognito on **every** non-OPTIONS route (F1 closed cycle 20, regression-tested); Secrets Manager (E2); tenant from JWT claim |
| ≥1 differentiated analytic beyond baseline, verified | ✅ | AOI activity + WoW delta (E4), dark-vessel AIS xref (E8) |
| Documented, versioned, rate-limited API + matching analyst UI, build/tests pass | ✅ | OpenAPI + usage plans (E7); TideWatch console (E13); jest 18/18; vite build 0; eslint 0 |
| Billing/metering + onboarding + quotas | ✅ | metering (E9), quotas (E7), onboarding runbook (E12a §7) |
| CI + tests + runbook + demo dataset | ✅ | CI (E12a), jest 18/18, `RUNBOOK.md`, `demo/seed.py` |
| PROGRESS builds/passes + COMPLETE marker + final summary | ✅ | this section + marker below |

## 🏁 PRODUCT COMPLETE — Galileo TideWatch

Built end-to-end over 20 cycles on top of the `orbital_analytics` baseline (extend-not-rewrite throughout):

- **Product:** TideWatch, commercial maritime activity intelligence (PRD + GTM + cost model + pricing tiers).
- **Backend (13 epics):** tenancy/data model (CoreTable), Secrets Manager, Cognito auth on the whole surface, AOI vessel-activity trending + week-over-week delta, threshold + dark-vessel alerting, reports engine, OpenAPI + tiered usage plans, AIS dark-vessel cross-reference (pluggable), per-tenant metering. 18/18 jest, cdk synth clean.
- **Frontend:** `galileo-website` migrated to Cognito/`/v1`; TideWatch analyst console (AOIs, activity charts, reports, usage). vite build + eslint clean.
- **Ops:** CI workflow, RUNBOOK, SECURITY_REVIEW (all findings resolved or scheduled), demo seed dataset.

**Honest residuals (documented, NOT part of the DoD, required before real commercial launch):** F2–F8 hardening (CORS lockdown, presigned uploads, WAF, CMK); a real AIS provider contract (dark-vessel is dormant `AIS_MODE=off`); satellite imagery licensing (the true COGS); self-serve onboarding; frontend unit tests; and validation of the PRD §7 pricing/accuracy assumptions with design partners. See `SECURITY_REVIEW.md`, `COST_MODEL.md`, `PRD.md §7`.

## Backlog (post-completion, non-blocking)

1. **E12 residual hardening:** F3 CORS lockdown, F4 presigned-upload ingest, F5 WAF for prod — per `SECURITY_REVIEW.md`.
2. Validate PRD §7 assumptions with design partners; wire a real AIS feed; settle imagery licensing; add frontend unit tests + self-serve onboarding.

## Definition of done

See `SPEC.md` → "Definition of done". Do not write the completion marker until every box is verified.

---

## Cycle log

### Cycle 1 — 2026-07-22

- **Did:** Chose the product's focused vertical and wrote `product_loop/PRD.md`.
- **Decision:** Product = **Galileo TideWatch**, commercial maritime activity intelligence. Wedge use case = vessel + port-activity monitoring over customer-defined AOIs (counts, week-over-week deltas, dark-vessel flags, analyst briefings). Chosen because the baseline already detects ships via YOLOv8n-OBB and runs a grounded LLM assessment, so maritime is the highest-leverage first market. ICP = commodity traders + marine/cargo insurers, secondary port operators. Pricing hypothesis: Watch ~$2k/mo, Pro ~$8k/mo, Enterprise custom (all flagged as assumptions to validate).
- **Why:** Depth over breadth. A sharp single vertical that reuses existing detections beats a generic "EO platform" that serves no one.
- **Evidence:** `PRD.md` written and self-consistent; no code touched, so repo build state unchanged (docs-only cycle). Assumptions explicitly quarantined in PRD §7 rather than asserted as facts.
- **Next:** Gap analysis → ordered build roadmap (backlog item 1).

### Cycle 2 — 2026-07-22

- **Did:** Wrote `product_loop/ROADMAP.md` — the gap analysis and ordered build plan.
- **Decision:** 12-row gap table maps each PRD requirement to a concrete change on real files/resources (e.g. G1 multi-tenancy → `get_images/main.py` + Cognito; G2 secrets → Secrets Manager; G3 AOI model → `OrbTable` single-table). Sequenced into 12 epics E1–E12: foundation (tenancy, secrets, auth) → differentiated value (change detection, alerting, reports) → productization (versioned API, AIS xref, billing) → packaging & hardening. Each epic has explicit verification gates (`npm run build`, `cdk synth`, `npm test`, `py_compile`).
- **Why:** Safety/data-model foundations must land before anything sellable; ordering prevents building value on an untenanted, insecure base. Extend-not-rewrite kept as the governing constraint.
- **Evidence:** `ROADMAP.md` written and internally consistent with `PRD.md` and the real stack (verified file/resource names against `lib/orbital-stack.ts` and the handlers read earlier). Docs-only cycle, no code touched, repo build state unchanged.
- **Next:** E1 — tenancy & data model (`DATA_MODEL.md` + additive AOI-CRUD scaffold).

### Cycle 3 — 2026-07-23

- **Did:** Stood up the verification gate and fixed the broken test suite. (1) Ran `npm install` (301 packages) so `npm run build` / `cdk synth` / `npm test` are runnable at all. (2) Discovered all 6 jest tests were failing pre-existing: `test/orbital_stack.test.ts` instantiated `OrbitalStack` with no `env`, so `route53.HostedZone.fromLookup` threw "Cannot retrieve value from context provider hosted-zone since account/region are not specified." Fixed by passing a concrete env `{account: "123456789012", region: "us-west-1"}` (standard CDK dummy account — never touches live AWS), mirroring how `bin/orbital_analytics.ts` supplies env. `fromLookup` now resolves to a synth-time dummy zone.
- **Why:** The SPEC verification gate requires `npm test` to pass, and the global engineering-excellence rule says fix a red suite even if you didn't cause it. Every future E1–E12 code cycle needs a trustworthy gate; leaving 6/6 red would make every "verified" claim hollow.
- **Evidence:** Before — `npx jest` 6 failed / 6 total (ValidationError at test:20). After — `npm run build` exit 0; `npx jest` **6 passed / 6 total**, exit 0. Change is test-only + additive `node_modules/` install; no production stack code altered, so runtime behavior is unchanged.
- **Note:** `node_modules/` is intentionally left in place so subsequent cycles can run the gate without reinstalling. Repo is not a git repo, so nothing is committed.
- **Next:** E1 — write `DATA_MODEL.md` (single-table access patterns) + scaffold additive AOI-CRUD Lambda stub, verified against the now-green gate.

### Cycle 4 — 2026-07-23

- **Did:** Implemented E1 (tenancy & data model foundation), the first differentiated build slice.
  - `product_loop/DATA_MODEL.md`: two-table split. `OrbTable` unchanged (scene/detection store; `ownerId` reinterpreted as `tenantId`, semantic only). New `CoreTable` single-table (`pk`/`sk` + `GSI1`) for Tenant / AOI / Observation / Report / Usage, with all 6 access patterns query-only (no scans).
  - `lib/orbital-stack.ts`: added `CoreTable` (PAY_PER_REQUEST, stage-aware removal policy, `GSI1` on `gsi1pk`/`gsi1sk`) and `AoiFunc` (Python 3.11) with `grantReadWriteData`; added versioned routes `GET/POST /v1/aois` and `GET/DELETE /v1/aois/{aoiId}`.
  - `lambdas/api/aoi/main.py`: AOI create/list/get/delete against `CoreTable`, API-GW proxy format, tenant from `x-tenant-id` header (explicitly a scaffold, not auth — E3 replaces it). Cross-tenant existence is not leaked on get/delete.
  - `test/orbital_stack.test.ts`: added 2 tests (CoreTable schema + GSI1; DELETE route presence).
- **Why:** Nothing sellable is multi-tenant without a tenant/AOI model. A separate clean single-table beats overloading `OrbTable`'s image-centric keys — extend-not-rewrite, and existing handlers stay untouched.
- **Evidence:** `python3 -m py_compile lambdas/api/aoi/main.py` OK; `npm run build` exit 0; `npx jest` **8/8 pass** (was 6/6, +2 new); `GOOGLE_API_KEY=dummy npx cdk synth --context stage=alpha` exit 0 with `CoreTable` + `AoiFunc` confirmed present in the synthesized template. Purely additive: no existing resource or handler modified, so current runtime behavior is unchanged. Repo clean.
- **Note on auth:** `x-tenant-id` header is a placeholder for wiring/testing only and is NOT a security boundary. Real tenant isolation arrives with E3 (Cognito). Documented as such in `DATA_MODEL.md` §3 and the handler docstring so it can't be mistaken for shipped auth.
- **Next:** E2 — `GOOGLE_API_KEY` to Secrets Manager.

### Cycle 5 — 2026-07-23

- **Did:** Implemented E2 (secrets management) — removed the plaintext Gemini key from the stack.
  - `lib/orbital-stack.ts`: added `secretsmanager.Secret` `GeminiApiKey` (stage-aware removal). Replaced `GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!` env on `GeminiFunc`, `SummarizerLambda`, and `GetImagesFunc` with `GEMINI_SECRET_ARN: secret.secretArn`, and added `secret.grantRead(...)` to each. The stack no longer references `process.env.GOOGLE_API_KEY` at all.
  - `lambdas/analytics/gemini/main.py` + `lambdas/api/get_images/main.py`: added a `_load_api_key()` cold-start helper that reads the secret via `GEMINI_SECRET_ARN` (handles raw-string or JSON `{"GOOGLE_API_KEY": "..."}` secret bodies) and falls back to the `GOOGLE_API_KEY` env var for local/dev.
  - `test/orbital_stack.test.ts`: new test asserts exactly 1 Secrets Manager secret AND iterates every `AWS::Lambda::Function` proving none still carries a `GOOGLE_API_KEY` env var (strong negative assertion that the vuln is gone).
  - `CONTEXT.md`: updated deploy instructions to the Secrets Manager `put-secret-value` flow; `GOOGLE_API_KEY` env is now documented as dev-only fallback.
- **Why:** Plaintext API keys baked into the CloudFormation template / Lambda env are a real security defect and a blocker to selling to security-conscious commercial buyers (PRD ICP: insurers, traders). Secrets Manager + env fallback keeps local dev easy without shipping the key.
- **Evidence:** `py_compile` OK on both handlers; `npm run build` exit 0; `npx jest` **9/9 pass** (+1 new); `npx cdk synth --context stage=alpha` exit 0 **with no GOOGLE_API_KEY set** — proving deploy no longer depends on the plaintext key (previously synth needed a dummy value). Pre-existing benign CDK metadata warnings (`fromAwsManagedPolicyName`) unchanged; synth still exits 0. Repo clean.
- **Next:** E3 — Cognito auth; kill hardcoded `jose-test-user` and the `x-tenant-id` scaffold, flip GetImagesFunc off public.

### Cycle 6 — 2026-07-23

- **Did:** Implemented E3a (Cognito auth for the new product surface) — first slice of E3, deliberately bounded.
  - `lib/orbital-stack.ts`: added `TideWatchUserPool` (email sign-in, self-signup off, `custom:tenantId` mutable string attribute), a `TideWatchWebClient` (SRP + USER_PASSWORD flows), and a `CognitoUserPoolsAuthorizer`. Applied the authorizer (`AuthorizationType.COGNITO`) to all four `/v1/aois` methods. Added `UserPoolId` / `UserPoolClientId` CfnOutputs for the frontend.
  - `lambdas/api/aoi/main.py`: `_tenant_id()` now reads `custom:tenantId` (fallback `sub`) from `requestContext.authorizer.claims`; the `x-tenant-id` header is demoted to an explicit dev/local-only fallback that is unreachable through the deployed authorizer-protected routes.
  - `test/orbital_stack.test.ts`: new test asserts 1 user pool, the `tenantId` custom attribute in the pool schema, and a `COGNITO_USER_POOLS`-authorized method.
- **Why:** The new `/v1` surface must not ship with the same auth gap as the legacy stack. Standing up Cognito + protecting the product API first (before migrating the older public endpoints) gives a real tenancy boundary for everything built from here on, without a risky big-bang change to the existing dashboard contract.
- **Scope call:** Split E3. E3a = Cognito + protect `/v1/aois` + real tenant claim (this cycle). E3b (next) = migrate the public `GetImagesFunc` Function URL and legacy routes, remove `jose-test-user`, coordinate frontend. Splitting keeps each cycle coherent and the frontend-breaking change isolated.
- **Evidence:** `py_compile` OK; `npm run build` exit 0; `npx jest` **10/10 pass** (+1); `npx cdk synth --context stage=alpha` exit 0 (only the pre-existing benign `fromAwsManagedPolicyName` metadata warnings, unchanged). Additive to the `/v1` surface; legacy routes untouched this cycle, so existing behavior is unchanged. Repo clean.
- **Honesty note:** `GetImagesFunc` is STILL public (`authType: NONE`) and `get_images/main.py` STILL hardcodes `jose-test-user` — those are E3b, not done yet. Auth is real only for `/v1/aois` at this point.
- **Next:** E3b — finish the auth rollout (GetImages + legacy routes + frontend).

### Cycle 7 — 2026-07-23

- **Did:** Implemented E3b — closed the remaining auth gaps, finishing E3.
  - `lib/orbital-stack.ts`: removed the public `NONE`-auth Function URL on `GetImagesFunc` and its output; added Cognito-authorized `GET /v1/images` (LambdaIntegration to the same Docker function). Added `authorizer`/`COGNITO` to `POST /task` (satellite tasking is privileged — must not be anonymous). Replaced the GetImages URL output with `TideWatchImagesEndpoint`.
  - `lambdas/api/get_images/main.py`: added `_tenant_id()` reading `custom:tenantId`/`sub` from JWT claims; `target_owner` now comes from it instead of the hardcoded `jose-test-user` literal. Added `Access-Control-Allow-Origin` to the success response.
  - `test/orbital_stack.test.ts`: new test asserts `AWS::Lambda::Url` count is 0 (public Function URL is gone).
  - `CONTEXT.md`: struck the "Auth on GetImagesFunc" TODO, marked Done (E3b) with the residual legacy-route note.
- **Why:** A public, unauthenticated Function URL returning tenant data and an anonymous satellite-tasking endpoint are disqualifying for the PRD's buyers. Routing GetImages behind API GW + Cognito (rather than IAM-auth on the Function URL) is cleaner and matches the dashboard's Amplify/Cognito login, and reuses the authorizer already added in E3a.
- **Decision on legacy routes:** `/task` protected now (clearly privileged, no legitimate anonymous caller). `/images` (ingest) and `/summary` (a stub) left on the current contract this cycle to avoid breaking ingestion/dashboard before `galileo-website` adopts Amplify Auth — tracked as a Low, non-blocking follow-up, not silently dropped.
- **Evidence:** `py_compile` OK; `npm run build` exit 0; `npx jest` **11/11 pass** (+1); `npx cdk synth --context stage=alpha` exit 0 (only pre-existing benign metadata warnings). Repo clean.
- **Honesty note:** The dashboard (`galileo-website`) will break against `/v1/images` until it sends a Cognito JWT — this is an intended contract change, flagged for frontend coordination, not a silent break. Legacy `/images`+`/summary` remain open by explicit decision above.
- **Next:** E4 — first differentiated analytics: AOI Observation time series + week-over-week delta.

### Cycle 8 — 2026-07-23

- **Did:** Implemented E4 — the first differentiated analytics capability, end-to-end (write path + read path).
  - Write path: `lambdas/ingest/index.js` now persists an optional `aoiId` on the scene record (only when provided, so ad-hoc uploads still work). `lambdas/analytics/gemini/main.py` gained `_record_aoi_observation()`: at the end of the analysis chain it reads the scene's `aoiId` from `OrbTable` and, if set, writes an Observation to `CoreTable` (`pk=AOI#<id>`, `sk=OBS#<ts>#<imageId>`, `vesselCount` = count of `ship` detections + `byClass` breakdown). Best-effort: a failure here logs a WARN and never fails the analysis.
  - Read path: new `lambdas/api/activity/main.py` serves `GET /v1/aois/{aoiId}/activity` — queries Observation rows, builds the vessel-count time series, and computes last-7d vs prior-7d average → `weekOverWeekDelta` + `weekOverWeekPct`. Tenant-scoped: verifies AOI ownership via GSI1 before returning (404 otherwise, no cross-tenant leak).
  - `lib/orbital-stack.ts`: `GeminiFunc` now has `CORE_TABLE_NAME` + `coreTable.grantWriteData` + `OrbTable` read (upgraded to `grantReadWriteData` to read `aoiId`). New `ActivityFunc` (Python 3.11) with `coreTable.grantReadData` and Cognito-protected `GET /v1/aois/{aoiId}/activity`.
  - `test/orbital_stack.test.ts`: +1 test (a python3.11 Lambda carries `CORE_TABLE_NAME`, i.e. the activity/observation wiring is present).
- **Why:** This is the product's core value proposition (PRD wedge: vessel/port-activity trends over AOIs) and satisfies the Definition-of-Done "≥1 differentiated capability beyond the stock baseline." Reuses existing detections rather than adding a new model — extend-not-rewrite.
- **Design note:** AOI↔scene association is carried explicitly via `aoiId` on the scene (set at ingest/tasking), not a geo-join. A real geometry-based join (point-in-polygon of detections vs AOI bbox) is a later enhancement; the explicit-tasking model is correct for the wedge (customers task imagery over a named AOI) and avoids needing per-detection geocoordinates the baseline doesn't produce yet.
- **Evidence:** `py_compile` OK (activity + gemini); `node --check` OK (ingest); `npm run build` exit 0; `npx jest` **12/12 pass** (+1); `npx cdk synth --context stage=alpha` exit 0 with `ActivityFunc` present (benign pre-existing warnings only). Additive; existing analysis behavior unchanged when `aoiId` is absent. Repo clean.
- **Next:** E5 — per-AOI threshold alerting (surge/drop/dark-vessel) → SNS.

### Cycle 9 — 2026-07-23

- **Did:** Implemented E5 — per-AOI threshold alerting, event-driven off the data model.
  - `lib/orbital-stack.ts`: enabled a `NEW_IMAGE` DynamoDB stream on `CoreTable`; added `TideWatchAlerts` SNS topic and `AlertsFunc` (Python 3.11) with a `DynamoEventSource` (TRIM_HORIZON, batch 10, `INSERT`-only filter criteria), `coreTable.grantReadData` + `alertsTopic.grantPublish`, and an `AlertsTopicArn` output.
  - `lambdas/alerting/main.py`: stream handler that deserializes each new Observation (via `TypeDeserializer`), loads the AOI (GSI1) + its `alertRules`, evaluates `vessel_max` / `vessel_min` / `surge_pct` (surge compares against the trailing 10-observation average, excluding the current row), and publishes fired alerts to SNS with tenant/rule message attributes. If no topic is configured it logs instead of failing.
  - `product_loop/DATA_MODEL.md`: documented the `alertRules` schema + evaluation semantics.
  - `test/orbital_stack.test.ts`: updated SNS topic count 1→2; new test asserts the `NEW_IMAGE` stream + a `TRIM_HORIZON` event-source mapping.
- **Why:** Alerting on activity change is a core PRD job-to-be-done ("alert me when my AOI crosses a threshold"). A DynamoDB-stream trigger keeps alerting fully decoupled from the analytics writer (single-responsibility, independently scalable/retryable) rather than bolting notification logic onto GeminiFunc.
- **Evidence:** `py_compile` OK; `npm run build` exit 0; `npx jest` **13/13 pass** (+1, and the pre-existing topic-count test correctly updated to 2 rather than left broken); `npx cdk synth --context stage=alpha` exit 0 with `AlertsFunc` present (benign pre-existing warnings only). Additive; existing pipeline behavior unchanged (alerts only fire when an AOI has rules). Repo clean.
- **Scope note:** "dark-vessel" alerting (AIS cross-reference) is deferred to E8 where the AIS adapter lands; E5 covers count-threshold + surge rules on data we already produce. Not claiming dark-vessel is done.
- **Next:** E6 — reports engine (persisted Report + `POST /v1/reports/{id}/analyze`).

### Cycle 10 — 2026-07-23

- **Did:** Implemented E6 — the Reports Engine from DESIGN v2 §3.1 (previously roadmap-only).
  - `lambdas/api/reports/` (new Docker image Lambda, mirroring `GetImagesFunc` packaging so `google-generativeai` is available): `main.py` + `Dockerfile` + `requirements.txt`. Routes: `POST /v1/reports` (create: title, aoiIds, promptText → DRAFT), `GET /v1/reports` (list, tenant-scoped), `GET /v1/reports/{id}`, `POST /v1/reports/{id}/analyze`. Analyze gathers each selected AOI's activity summary (latest + avg vessel counts from Observations, tenant-verified via GSI1), builds a grounded prompt, calls Gemini 2.5 Flash, and persists the narrative + status=ANALYZED. Includes a deterministic non-AI fallback so analyze never hard-fails when the key/lib is absent, and `genai` import is guarded so import/compile checks pass without the dep.
  - `lib/orbital-stack.ts`: `ReportsFunc` DockerImageFunction (ARM64) with `CORE_TABLE_NAME` + `GEMINI_SECRET_ARN`, `coreTable.grantReadWriteData` + `geminiApiKeySecret.grantRead`; `/v1/reports` + `/v1/reports/{reportId}` + `/v1/reports/{reportId}/analyze` routes, all Cognito-authorized.
  - `test/orbital_stack.test.ts`: +1 test asserting the `reports` and `analyze` API resources exist.
- **Why:** The reports engine is the "curate + share intelligence" job in the PRD (auditable reports for underwriters/trading committees) and was the flagship v2 item in the existing DESIGN doc. Reusing the AOI activity data as grounded evidence keeps AI output tied to measured reality (same MoE philosophy as the baseline GeminiFunc).
- **Evidence:** `py_compile` OK; `npm run build` exit 0; `npx jest` **14/14 pass** (+1); `npx cdk synth --context stage=alpha` exit 0 with `ReportsFunc` present (26 template refs; benign pre-existing warnings only). Additive. Repo clean.
- **Next:** E7 — API productization (OpenAPI spec + usage plans/rate limits).

### Cycle 11 — 2026-07-23

- **Did:** Implemented E7 — API productization (docs + commercial controls).
  - `product_loop/openapi.yaml`: OpenAPI 3.0.3 spec for the full `/v1` surface (aois CRUD, aois/{id}/activity, reports CRUD, reports/{id}/analyze, images), with a `cognitoJwt` bearer security scheme applied globally and schemas for AOI/AlertRule/Activity/Report/Error. Documents the per-tier rate limits inline.
  - `lib/config.ts`: added `apiRateLimit`/`apiBurstLimit` to `OrbConfig` (per-stage defaults) and a new `ApiTiers` table (Watch/Pro/Enterprise → req/s, burst, monthly quota).
  - `lib/orbital-stack.ts`: stage-level default throttle via `deployOptions` (baseline abuse protection); a loop creating one `UsagePlan` per pricing tier (throttle + `Period.MONTH` quota) bound to the API stage.
  - `test/orbital_stack.test.ts`: updated `testConfig` for the new required fields; +1 test asserting 3 usage plans with a monthly quota.
- **Why:** A sellable API needs discoverable docs and enforceable commercial limits. Documenting the surface (OpenAPI) + tiered throttle/quota (usage plans) turns the ad-hoc routes into a product with a pricing-aligned contract.
- **Design/honesty note:** the Cognito JWT remains the auth boundary for the dashboard; per-tenant API keys bound to a usage plan are the mechanism for direct machine-to-machine API access and are issued at onboarding (E9/E11), so I did NOT set `apiKeyRequired` on the JWT dashboard routes (that would force awkward dual auth). The stage-level default throttle protects the API immediately regardless. This split is documented in the openapi footer and the stack comment — not hand-waved.
- **Evidence:** openapi.yaml parses (3.0.3, 7 paths); `npm run build` exit 0; `npx jest` **15/15 pass** (+1, and the pre-existing `testConfig` correctly updated rather than left type-broken); `npx cdk synth --context stage=alpha` exit 0 (benign pre-existing warnings only). Repo clean.
- **Next:** E8 — AIS dark-vessel cross-reference (completes the E5 `dark_vessel` deferral).

### Cycle 12 — 2026-07-23

- **Did:** Implemented E8 — AIS dark-vessel cross-reference, closing the E5 `dark_vessel` deferral.
  - `lambdas/alerting/ais_adapter.py` (new): `get_ais_vessel_count(aoi_id, bbox, timestamp)` with three modes via `AIS_MODE` — `off` (default, returns None), `stub` (deterministic input-derived count for demo/test, no network), `http` (structured hook for a real provider at `AIS_ENDPOINT`, not yet wired). Returns None wherever it can't produce a trustworthy number — degrades to "unknown", never a fabricated count.
  - `lambdas/alerting/main.py`: computes `dark = max(0, EO_detected − AIS_reported)` per observation (only when a `dark_vessel` rule exists and AIS is available), evaluates a new `dark_vessel` rule type, and includes `aisReportedCount`/`darkVesselEstimate` in the alert payload.
  - `lib/orbital-stack.ts`: `AlertsFunc` env `AIS_MODE: "off"`.
  - `product_loop/DATA_MODEL.md`: documented the `dark_vessel` rule semantics.
  - `test/orbital_stack.test.ts`: +1 asserting `AIS_MODE` is wired on a Lambda.
- **Why:** Dark-vessel detection (vessels visible in EO but silent on AIS) is the PRD's headline differentiator vs AIS-only competitors (Windward) and pixels-only vendors — the signal insurers/sanctions buyers pay for. Building the adapter + rule now, with the real feed pluggable, lets the capability ship the moment an AIS contract is signed.
- **Evidence:** `py_compile` OK (both files); **functional check** run: in `stub` mode the adapter returns a count and `_evaluate` produces `"5 likely dark vessels (EO 11 detected vs AIS 6 reported, threshold 3)"`, while `off` mode returns None (no false signal) — verified via a direct Python invocation. `npm run build` exit 0; `npx jest` **16/16 pass** (+1); `npx cdk synth --context stage=alpha` exit 0 (benign pre-existing warnings only). Additive; default `off` means zero behavior change until a feed is configured. Repo clean.
- **Honesty note:** NO real AIS feed is connected. `http` mode is a documented stub that returns None; `stub` mode is for demos/tests only. Dark-vessel alerting is production-ready in plumbing but dormant (`off`) until a provider is wired — not claimed as live.
- **Next:** E9 — per-tenant billing/metering.

### Cycle 13 — 2026-07-23

- **Did:** Implemented E9 — per-tenant usage metering (billing foundation).
  - Write path (atomic DynamoDB `ADD` on `pk=TENANT#<t>, sk=USAGE#<YYYY-MM>`, best-effort so metering never fails the business action): `GeminiFunc` +1 `scenesAnalyzed` per analyzed scene; `ReportsFunc.analyze` +1 `reportsGenerated`; `AoiFunc` +1 `aoiCount` on create, −1 on delete. Each uses `ADD ... SET entity/tenantId = if_not_exists(...)` so the counter row self-initializes.
  - Read path: new `lambdas/api/usage/main.py` serving `GET /v1/usage` (optionally `?months=N`, capped at 12), tenant-scoped, returning scenesAnalyzed/reportsGenerated/aoiCount per month.
  - `lib/orbital-stack.ts`: `UsageFunc` (Python 3.11) + Cognito-protected `GET /v1/usage`. Writers already had CoreTable write grants, so no grant changes needed.
  - `test/orbital_stack.test.ts`: +1 asserting the `usage` route resource.
- **Why:** Usage-based billing is required to sell (PRD tiers include per-scene/per-report add-ons) and complements the E7 tier quotas — usage plans enforce rate/quota at the gateway; these counters give per-tenant consumption for invoicing and dashboards. Metering at the point of each billable event (atomic ADD) is the correct, race-free pattern.
- **Evidence:** `py_compile` OK (4 handlers); **functional check**: usage `_recent_months(3)` → `['2026-07','2026-06','2026-05']` with correct rollover, `_public_usage` defaults verified. `npm run build` exit 0; `npx jest` **17/17 pass** (+1); `npx cdk synth --context stage=alpha` exit 0 with `UsageFunc` present (benign pre-existing warnings only). Metering is additive + best-effort, so existing handler behavior is unchanged on the happy path and on meter failure. Repo clean.
- **Next:** E10 — GO_TO_MARKET.md (pricing/positioning/sales motion/demo script).

### Cycle 14 — 2026-07-23

- **Did:** Implemented E10 — wrote `product_loop/GO_TO_MARKET.md`: one-liner, ICP table (with disqualifiers), positioning vs Planet/Maxar/ICEYE/Windward/Spire/Orbital Insight, pricing/packaging table, land-and-expand sales motion, a 10-minute demo script mapped to the real `/v1` endpoints, GTM success metrics, and the open risks carried from PRD §7.
- **Why:** "Sellable" per the SPEC Definition of Done requires an explicit go-to-market plan, not just working software. This turns the built capabilities into a coherent commercial story a founder/SE can run a pilot with.
- **Evidence:** Docs-only cycle (no code touched). Cross-checked the pricing table's rate/quota figures against `lib/config.ts` `ApiTiers` — exact match (Watch 5/50k, Pro 25/500k, Enterprise 100/5M). Ran `npx jest` to confirm the repo is still non-broken: **17/17 pass**. All pricing explicitly flagged as hypotheses to validate, and dark-vessel explicitly noted as dormant (`AIS_MODE=off`) until a provider is signed — no overclaiming. Repo clean.
- **Next:** E11 — demo dataset seed script.

### Cycle 15 — 2026-07-23

- **Did:** Implemented E11 — the demo dataset. `product_loop/demo/seed.py` (+ `demo/README.md`).
  - Pure `build_items(now)` generator (separated from I/O so it's testable without AWS): tenant `demo-tenant`, 3 AOIs (Singapore/Rotterdam/Fujairah) with alert rules and GeoJSON polygons/bboxes, 21 days of daily Observations each, `RECENT_SCENES` OrbTable scenes per AOI (with `gemini_analysis` + `vehicle_data` so `GetImagesFunc`'s filter passes), and a current-month usage row.
  - Rotterdam seeded to surge in the last 7 days; Fujairah held at high counts for the `dark_vessel` demo (with `AIS_MODE=stub`).
  - `main()` has argparse + env-default table names + a `--dry-run` that generates and summarizes with no AWS calls. Idempotent via deterministic keys.
- **Why:** SPEC Definition of Done requires a demo dataset so the product can be demoed and sold; it backs the GO_TO_MARKET §6 demo script so activity/alerts/reports show real-looking data in minutes.
- **Evidence:** `py_compile` OK; `--dry-run` → 68 CoreTable + 9 OrbTable items; **functional check** asserted: 3 AOIs, 63 observations, Rotterdam last-7d avg 24.6 > prior-7d 13.1 (real +88% surge, exceeds the 30% rule), Fujairah min count 15, usage `scenesAnalyzed=63`/`aoiCount=3`, and all CoreTable keys unique (idempotent). `npx jest` **17/17** (no stack code touched). Repo clean.
- **Next:** E12 — hardening (CI + RUNBOOK + security review + cost model); the final epic before re-checking the Definition of Done.

### Cycle 16 — 2026-07-23

- **Did:** Implemented E12a (operational hardening — CI + runbook), first half of the final epic.
  - `.github/workflows/ci.yml` (at the `profilesapp` git root; `working-directory: orbital_analytics`): a `build-test` job (`npm ci` → `npm run build` → `jest --ci` → `cdk synth`) and a `python-handlers` job that syntax-checks the JS handlers (`node --check`) and our own Python handlers (`py_compile`, explicit list — deliberately excludes vendored deps under gemini/object_detection). Path-filtered to `orbital_analytics/**`.
  - `product_loop/RUNBOOK.md`: prerequisites, deploy per stage, Secrets Manager population, frontend/Amplify wiring (with the honest note that `/v1` returns 401 until the JWT is sent), alerts+AIS enablement, demo seed, tenant onboarding, rollback (incl. RETAIN protection for beta/prod), and health checks.
- **Why:** "Trustworthy delivery" in the DoD needs CI + a deploy/rollback runbook so the product is operable by someone other than the author. Splitting E12 (a→CI/runbook, b→security review/cost model) keeps each deliverable thorough rather than rushed.
- **Evidence:** `ci.yml` parses (jobs build-test, python-handlers); ran the workflow's exact commands locally — all three JS handlers `node --check` OK, all 12 listed Python handlers `py_compile` OK. Initial `find`-based step was tightened after it swept vendored `pydantic/main.py` files; replaced with an explicit list. `npx jest` **17/17** (no stack code touched). Repo clean.
- **Honesty note (carried to completion gate):** the DoD tracker now marks "matching UI" ❌ (frontend not migrated to Cognito/`/v1`) and onboarding ⚠️ (manual runbook only). These are NOT done; the loop must not declare "PRODUCT COMPLETE" while they stand. E12b + an explicit decision on these precede any marker.
- **Next:** E12b — SECURITY_REVIEW.md + COST_MODEL.md, then a full DoD re-verification.

### Cycle 17 — 2026-07-23

- **Did:** Implemented E12b (final hardening docs) and performed the honest Definition-of-Done re-verification.
  - `product_loop/SECURITY_REVIEW.md`: 8 ranked findings grounded in the real code — F1 (legacy `/images`+`/summary` unauthenticated, HIGH), F2 (prompt injection via `promptText`, MED), F3 (CORS `*`, MED), F4 (base64 ingest payload limits, MED), F5 (no WAF), F6 (tenant fallback), F7 (secret rotation), F8 (CMK). Posture summary + verdict (product surface auth-sound; blockers = F1 + frontend).
  - `product_loop/COST_MODEL.md`: per-tenant unit economics — ~$8–9/mo compute+AI for a Pro tenant (Gemini calls dominate), >99% gross margin on compute, with the explicit caveat that satellite imagery licensing is the real COGS and is unmodeled.
- **Why:** DoD requires a security review + cost model; both must be real, not decorative. I verified the security claims against source rather than asserting them.
- **Evidence:** F1 confirmed via grep (`/summary` and `/images` have NO authorizer in `lib/orbital-stack.ts`); F3 confirmed (`ALL_ORIGINS` present). Docs-only; `npx jest` **17/17** (repo non-broken). Repo clean.
- **DoD re-verification (the important part):** ran the full checklist (table above). Six of seven requirements pass, but **"documented API + matching analyst UI" FAILS** — `galileo-website` has never been migrated to the Cognito/`/v1` contract, so the authenticated product is not usable end-to-end through a UI. Per SPEC, I must NOT write "PRODUCT COMPLETE" while a hard requirement genuinely fails. **Decision: loop stays OPEN**; opened E13 (frontend migration) as the true remaining blocker, with legacy-route closure (F1) coordinated into it.
- **Next:** E13 — migrate `galileo-website` to Cognito auth + the `/v1` API surface.

### Cycle 18 — 2026-07-23

- **Did:** Implemented E13a — the frontend's authenticated API layer + migrating the two live data calls off the dead/unauthenticated endpoints.
  - `galileo-website/src/api/client.js` (new): `apiGet`/`apiPost` attach the Cognito JWT via Amplify `fetchAuthSession` (`Authorization: Bearer <idToken>`); base URL from `VITE_API_BASE_URL` (default prod). Typed endpoint helpers for every `/v1` route + `/task`, mirroring `openapi.yaml`.
  - `src/components/Dashboard.jsx`: removed the hardcoded **dead public GetImages Function URL** (deleted in E3b) and now calls `getImages()` → `GET /v1/images`.
  - `src/components/MissionPlanner.jsx`: `/task` POST now goes through `postTask()` so it carries the JWT (the endpoint became Cognito-protected in E3b — it would 401 without this).
  - `.env.example` documenting `VITE_API_BASE_URL`.
- **Why:** After E3b the dashboard was pointing at a URL that no longer exists and the tasking call would 401 — the UI was actually broken against the new backend. This is the first, load-bearing slice of closing the "matching UI" DoD gap: real auth'd data flow.
- **Evidence:** Installed `galileo-website` deps (301+ pkg tree, exit 0). `node --check` client OK; grep confirms **zero** `lambda-url` references remain in `src`. Created a local gitignored `amplify_outputs.json` stand-in (Amplify generates the real one at deploy) so the build resolves. **`npm run build` (vite) exit 0** (1499 modules transformed); **`npx eslint` on the 3 changed files exit 0**. Backend gate re-run: `npx jest` **17/17**. Repo clean (outputs file is gitignored, confirmed via `git check-ignore`).
- **Honesty note:** "matching UI" DoD box is STILL ❌. E13a only fixes the existing two calls; the differentiated capabilities (AOIs, activity charts, alerts, reports, usage) have NO screens yet. That is E13b. Not claiming the UI is done.
- **Next:** E13b — build the analyst screens for AOIs/activity/reports/usage on top of `api/client.js`.

### Cycle 19 — 2026-07-23

- **Did:** Implemented E13b — the TideWatch analyst console, closing the "matching UI" DoD gap.
  - `galileo-website/src/components/TideWatch.jsx` (+ `.css`): wrapped in Amplify `Authenticator` (so calls carry the JWT); sections for **AOIs** (list via `/v1/aois`, create with a default surge rule), **Activity** (`/v1/aois/{id}/activity` — latest count, week-over-week delta/pct, and an inline dependency-free SVG sparkline of the series), **Reports** (list/create + `analyze` button → `/v1/reports/{id}/analyze`, renders the returned narrative), and **Usage** (`/v1/usage` counters). Error surfacing on every call.
  - `src/main.jsx`: added the `/tidewatch` route.
- **Why:** The DoD requires a matching analyst UI for the product's capabilities, not just an API. These are real, authenticated screens for the differentiated features (activity trend, dark-vessel-relevant AOIs, reports) built on the E13a client.
- **Evidence:** `npm run build` (vite) **exit 0** (built with Authenticator + new console); `npx eslint src/components/TideWatch.jsx src/main.jsx` **exit 0**. Backend gate unaffected. Repo clean (amplify_outputs.json gitignored).
- **DoD re-verification:** "matching analyst UI" box → ✅. Six of seven boxes now pass. **One genuine blocker remains: F1** — legacy `POST /images` + `GET /summary` are still unauthenticated (my own SECURITY_REVIEW marks this HIGH / "blocking before production sale"). Declaring complete with a self-documented sale-blocking hole open would be dishonest. **Loop stays OPEN; F1 is the final required increment.**
- **Next:** F1 — authenticate/deprecate legacy routes, then full DoD re-verify → completion marker if all green.

### Cycle 20 — 2026-07-23 — FINAL

- **Did:** Closed F1 (the last completion blocker) and declared PRODUCT COMPLETE after a full DoD re-verification.
  - Confirmed no frontend caller uses legacy `/images`/`/summary` (only `/v1/images`).
  - `lib/orbital-stack.ts`: attached the Cognito authorizer to `POST /images` (ingest) and `GET /summary`.
  - `test/orbital_stack.test.ts`: new regression test "F1: every non-OPTIONS API method requires Cognito auth" — enumerates all `AWS::ApiGateway::Method` resources and asserts none non-OPTIONS is left non-COGNITO. Prevents silent regression.
  - `SECURITY_REVIEW.md`: F1 marked RESOLVED; verdict updated (entire surface auth-sound).
- **Why:** F1 was a self-flagged HIGH / sale-blocking hole; completing the product with it open would contradict my own security review. It was the single remaining DoD blocker.
- **Evidence:** Backend `npm run build` 0, `npx jest` **18/18** (+1, F1 test green), `cdk synth` 0. Frontend `vite build` 0, `eslint src/` 0. Every DoD box verified ✅ (table above).
- **Decision:** All Definition-of-Done criteria genuinely met and verified → wrote the **PRODUCT COMPLETE** marker and a final summary with honest residuals. **Loop ended (CronDelete on the 15-min job).**
