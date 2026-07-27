# ROADMAP — TideWatch on the orbital_analytics baseline

**Version:** 0.1 (cycle 2)
**Principle:** Extend the existing stack, do not rewrite it. Every row maps a `PRD.md` need to a concrete change on real files/resources.

## 1. Gap analysis (PRD need → baseline today → concrete change)

| # | PRD need | Baseline today | Gap → concrete change | Where |
|---|----------|----------------|------------------------|-------|
| G1 | Multi-tenant product | Single hardcoded `jose-test-user`; `GetImagesFunc` Function URL is public (`authType: NONE`) | Introduce tenants; authenticate every request; scope all reads/writes by `tenantId` | `lambdas/api/get_images/main.py`, `lib/orbital-stack.ts`, new Cognito |
| G2 | Secrets not in code | `GOOGLE_API_KEY` passed as plaintext Lambda env var from `process.env` | Move to AWS Secrets Manager; grant read to the 3 Gemini-using Lambdas | `lib/orbital-stack.ts`, gemini/get_images/intelligence handlers |
| G3 | AOI-centric monitoring | Data model is per-image only (`imageId`/`ownerId`) | Add AOI entity + tenant entity in `OrbTable` (single-table design); associate scenes to AOIs | `OrbTable` access patterns, new `lambdas/api` routes |
| G4 | Week-over-week deltas | Each scene analyzed in isolation | Change/delta computation: vessel-count trend per AOI over time | new `lambdas/analytics/change` step or post-processor |
| G5 | Alerting | None | Threshold rules per AOI → notification (SNS email/webhook) on surge/drop/dark-vessel | new `lambdas/alerting`, SNS topic |
| G6 | Auditable reports | Transient JIT mission brief only (per DESIGN v2 "Reports Engine") | Persisted Report entity + `POST /reports/{id}/analyze` | new `lambdas/reports`, `OrbTable` |
| G7 | API product surface | Ad-hoc API GW routes, no docs/versioning/limits | Versioned `/v1` API, OpenAPI spec, usage plan + API keys + rate limits | `lib/orbital-stack.ts` API GW, `product_loop/openapi.yaml` |
| G8 | Billing / metering | None | Per-tenant usage counters (scenes analyzed, reports, AOIs) → metering records | new `lambdas/metering`, `OrbTable` usage items |
| G9 | Dark-vessel value prop | Stock YOLO ship detection only | Cross-reference detections vs AIS (stub adapter now, real feed later); flag mismatches | new `lambdas/analytics/ais_xref` |
| G10 | Demo-in-minutes | No seed data | Demo tenant + seed AOIs + sample scenes/detections | `product_loop/demo/` seed script |
| G11 | Sellable packaging | None | Plans/tiers/quotas enforced; go-to-market doc; landing/pricing content | `lib/config.ts` tiers, `GO_TO_MARKET.md`, website |
| G12 | Trustworthy delivery | Minimal tests, no CI, no runbook | Expand tests, add CI, deployment runbook, security review, per-tenant cost model | `test/`, `.github/`, `product_loop/RUNBOOK.md` |

## 2. Ordered build epics (each = one or more cycles)

Ordering rule: foundational safety and data model first (nothing sellable without tenancy + secrets), then the differentiated value, then commercialization, then hardening.

1. **E1 — Tenancy & data model foundation** (G1 partial, G3): define the single-table access patterns for Tenant + AOI + Scene + Report + Usage; document as `DATA_MODEL.md`; add AOI CRUD Lambda scaffold. Pure additive, must still `cdk synth`.
2. **E2 — Secrets management** (G2): Secrets Manager secret for `GOOGLE_API_KEY`; handlers read from Secrets Manager with env fallback; CDK grants. Verify `npm run build` + `cdk synth`.
3. **E3 — AuthN/AuthZ** (G1): Cognito user pool + API GW authorizer; replace hardcoded owner with token `tenantId` claim; scope queries. Update `orbital_stack.test.ts`.
4. **E4 — Change detection & AOI aggregation** (G4): per-AOI vessel-count time series + week-over-week delta; new analytics step wired after Gemini.
5. **E5 — Alerting** (G5): per-AOI threshold rules + SNS notifications.
6. **E6 — Reports engine** (G6): persisted Report entity + `POST /reports/{id}/analyze` (implements DESIGN v2).
7. **E7 — API productization** (G7): `/v1` versioning, `openapi.yaml`, usage plans, API keys, rate limits.
8. **E8 — Dark-vessel AIS cross-reference** (G9): AIS adapter (stub feed now) + mismatch flags.
9. **E9 — Billing & metering** (G8, G11): per-tenant usage counters + tier quota enforcement in `config.ts`.
10. **E10 — Commercial packaging** (G11): `GO_TO_MARKET.md`, pricing/landing content in `galileo-website`, demo script.
11. **E11 — Demo dataset** (G10): seed tenant + AOIs + sample scenes so a prospect sees value fast.
12. **E12 — Hardening** (G12): tests, CI, `RUNBOOK.md`, security review, per-tenant cost model. Gates Definition of Done.

## 3. Verification per epic

Every code-touching cycle must pass, before journaling done:

- `npm run build` (tsc) and `npx cdk synth --context stage=alpha` for CDK changes.
- `npm test` (jest) with `orbital_stack.test.ts` updated to cover new resources.
- Python handlers: `python -m py_compile` on changed files at minimum.
- No secrets committed; no resource left unreferenced or half-wired.

## 4. Notes / risks

- Auth (E3) changes the shape of `GetImagesFunc` requests — coordinate with `galileo-website` before flipping the Function URL off public.
- Cost model (E12) must reflect DynamoDB single-table + per-scene Lambda + Gemini call costs per tenant.
- AIS real feed (E8) and imagery licensing are external dependencies flagged in `PRD.md` §7 — build against a stub until commercially settled.
