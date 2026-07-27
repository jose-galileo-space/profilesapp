# GO_TO_MARKET.md — Galileo TideWatch

**Version:** 0.1 (cycle 14)
**Status:** Draft for design-partner validation
**Sources:** `PRD.md`, `ROADMAP.md`, `lib/config.ts` (ApiTiers)

## 1. One-liner

TideWatch turns satellite imagery into answers about maritime activity: define an area of interest, and get vessel counts, week-over-week change, dark-vessel flags, and analyst-grade reports, without touching a single pixel yourself.

## 2. Ideal customer profile (ICP)

Primary: commodity trading desks and marine/cargo insurers.
Secondary: port and terminal operators.

| Buyer | Trigger to buy | Value we deliver |
|-------|----------------|------------------|
| Commodity trader | Needs an early, independent read on supply/demand (port congestion, vessel buildup) | Quantified activity deltas per port/AOI, faster than official statistics |
| Marine / cargo insurer | Must verify vessel presence and detect AIS-dark activity for risk and sanctions compliance | Independent, auditable EO evidence + dark-vessel flags |
| Port / terminal operator | Wants berth-utilization and anchorage-queue visibility | Operational dashboards and threshold alerts |

Disqualifiers (not our ICP yet): buyers needing sub-hourly revisit, full-ocean tracking (AIS-first vendors do this better today), or raw-imagery licensing.

## 3. Positioning vs competitors

| Competitor | Their shape | Where TideWatch wins |
|-----------|-------------|----------------------|
| Planet / Maxar / ICEYE | Imagery vendors — customer builds the analytics | We ship answers (counts, deltas, alerts, reports), not scenes to process |
| Windward / Spire | AIS-first tracking | We detect vessels from EO independent of AIS, so we see dark vessels they miss |
| Orbital Insight / Descartes Labs | Broad geospatial analytics platforms | We are a focused maritime product with a fast time-to-value, not a platform integration project |

Wedge: EO-primary dark-vessel detection plus grounded LLM briefings, packaged as a per-AOI subscription.

## 4. Pricing and packaging

SaaS subscription + usage, per tenant. Rate/quota enforced by API Gateway usage plans (`ApiTiers` in `lib/config.ts`); consumption metered per tenant (`GET /v1/usage`, E9).

| Tier | Target buyer | Price (hypothesis) | AOIs | API rate / monthly quota |
|------|--------------|--------------------|------|--------------------------|
| Watch | Single desk / pilot | ~$2k/mo | up to 5 | 5 req/s, 50k/mo |
| Pro | Trading desk / insurer team | ~$8k/mo | up to 50 | 25 req/s, 500k/mo |
| Enterprise | Multi-team | Custom | unlimited | 100 req/s, 5M/mo |

Usage add-ons: per-scene analysis credits, per-report generation, higher revisit cadence.
All prices are hypotheses to validate with design partners (see `PRD.md` §7). Do not quote as committed pricing.

## 5. Sales motion

1. Design-partner phase (now): 3-5 named logos, free or discounted pilots in exchange for feedback and a reference. Goal is to validate willingness-to-pay and the revisit-cadence assumption.
2. Land: a single high-value AOI (a port the buyer cares about), a 2-week pilot showing activity trend + one real alert.
3. Expand: add AOIs and seats, move from Watch to Pro, attach usage add-ons.
4. Motion: founder-led / solutions-engineer-led sell; technical champion is a trading analyst or an underwriting/risk lead.

## 6. Demo script (10 minutes)

1. Sign in (Cognito) to the tenant dashboard.
2. Create an AOI over a well-known port (`POST /v1/aois` with a polygon), set a `surge_pct` alert rule.
3. Show the activity endpoint (`GET /v1/aois/{id}/activity`): vessel-count time series + week-over-week delta.
4. Trigger a surge in the seeded data and show the alert firing to email/webhook.
5. (If AIS configured) show a dark-vessel flag: EO-detected vessels with no AIS match.
6. Build a report: select the AOI, prompt "summarize activity changes this week", run `POST /v1/reports/{id}/analyze`, show the grounded narrative.
7. Show `GET /v1/usage` and map it to the pricing tier.

Requires the E11 demo dataset so steps 3-6 have real-looking data.

## 7. Success metrics (GTM)

- 3+ design partners signed within the pilot phase.
- At least one partner confirms willingness to pay at the Pro tier.
- Time-to-first-briefing under 15 minutes in a live demo.

## 8. Open risks (carried from PRD §7)

- Willingness-to-pay unvalidated.
- Imagery licensing terms must be settled before commercial sale.
- Stock-YOLO maritime accuracy is unmeasured; a labeled harbor test set is needed before quoting precision/recall.
- AIS provider contract required before dark-vessel is a live, sellable feature (today `AIS_MODE=off`).
