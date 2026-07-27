# COST_MODEL.md — TideWatch per-tenant unit economics

**Date:** 2026-07-23 (cycle 17)
**Purpose:** rough per-tenant monthly AWS + AI cost to sanity-check the pricing tiers in `GO_TO_MARKET.md`.
All figures are order-of-magnitude estimates (us-west-1, on-demand), not a billing guarantee. Rounded up for safety.

## 1. Reference workload (one "Pro" tenant)

- 20 AOIs, daily revisit → ~20 scenes/day → **~600 scenes/month**.
- Each scene runs: Correction (passthrough) → ObjDetect (Docker, 4 GB) → Gemini analysis → 1 Observation write.
- Dashboard: ~50 loads/day (JIT Gemini brief) → ~1,500/month.
- ~30 reports/month (each = 1 Gemini synthesis).

## 2. Cost drivers

| Component | Basis | Est. $/month (Pro) |
|-----------|-------|--------------------|
| ObjDetect Lambda | 600 scenes × ~10 s × 4 GB ≈ 24,000 GB-s | ~$0.40 |
| Correction + trigger + API Lambdas | small, thousands of short invoces | ~$0.50 |
| Gemini analysis (scenes) | 600 calls × ~$0.005 (2.5 Flash, image+text) | ~$3.00 |
| Gemini JIT dashboard briefs | 1,500 calls × ~$0.002 | ~$3.00 |
| Gemini report synthesis | 30 calls × ~$0.003 | ~$0.10 |
| DynamoDB on-demand | ~600 scene writes + ~600 obs + ~18k reads (dashboard/activity) | ~$0.50 |
| S3 storage + requests | ~600 images/mo × ~2 MB retained + requests | ~$0.30 |
| API Gateway | ~25k requests × $3.50/M | ~$0.10 |
| Cognito | few MAU (well under 50k free tier) | ~$0.00 |
| Secrets Manager | 1 secret | ~$0.40 |
| **Subtotal (variable)** | | **~$8–9/month** |

Note: this **excludes satellite imagery acquisition/licensing**, which is the dominant real-world cost and is a pass-through / partner-dependent line item (flagged in `PRD.md` §7). AWS+AI compute is a small fraction of the tasking cost.

## 3. Margin check vs pricing

| Tier | Price (hypothesis) | Compute+AI cost | Gross margin (compute only) |
|------|--------------------|-----------------|-----------------------------|
| Watch (~5 AOIs) | ~$2,000/mo | ~$3/mo | >99% |
| Pro (~20–50 AOIs) | ~$8,000/mo | ~$8–15/mo | >99% |
| Enterprise | Custom | scales ~linearly with scenes | >99% |

Compute/AI is negligible relative to price; **imagery licensing is the real COGS** and must be modeled per imagery partner before committing pricing.

## 4. Scaling notes

- Costs scale ~linearly with scenes/month (AOIs × revisit). The Gemini calls dominate variable AWS+AI cost.
- Levers if AI cost grows: cache JIT dashboard briefs (currently regenerated per load), batch report synthesis, and skip Gemini on unchanged scenes.
- DynamoDB on-demand is fine at this scale; revisit provisioned capacity only at very high per-tenant volumes.

## 5. Assumptions to validate

- Gemini 2.5 Flash per-call pricing (verify against current rate card).
- ObjDetect runtime/memory (measure on real maritime imagery; 10 s / 4 GB is an estimate).
- Imagery licensing cost per scene (the actual COGS — unknown until an imagery partner contract exists).
