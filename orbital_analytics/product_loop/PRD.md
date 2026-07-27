# PRD — Galileo "TideWatch": Maritime Activity Intelligence

**Version:** 0.1 (draft, cycle 1)
**Status:** Proposed
**Author:** Autonomous Product Build Loop

## 1. The wedge (why this, why now)

The baseline already detects **ships** (YOLOv8n-OBB, DOTA classes) and runs a grounded LLM assessment over each image.
Maritime is the sharpest commercial fit for that exact capability, so we lead with it instead of trying to serve every vertical at once.
Primary vertical: **maritime domain awareness for commercial buyers**.
Initial wedge use case: **vessel and port-activity monitoring from satellite EO**, delivering counts, changes, and "dark vessel" flags over customer-defined areas of interest (AOIs) such as ports, anchorages, terminals, and chokepoints.

## 2. Target customer (ICP)

Primary ICP: **commodity trading desks and marine/cargo insurers**.
Secondary ICP: **port operators and terminal logistics teams**.

| Buyer | Job to be done | Pays for |
|-------|----------------|----------|
| Commodity trader | Read supply/demand signals early (port congestion, vessel buildup, throughput) | Timely, quantified activity deltas per port/AOI |
| Marine/cargo insurer | Verify vessel presence, detect AIS-dark activity, assess risk exposure | Independent, auditable evidence of vessel activity |
| Port/terminal operator | Track berth utilization and anchorage queues | Operational dashboards + alerts |

## 3. Jobs-to-be-done

1. "Tell me how many vessels are at this port/anchorage right now, and how that changed vs last week."
2. "Alert me when vessel activity at my AOI crosses a threshold (surge, drop, or a vessel with no AIS match)."
3. "Give me an auditable report I can hand to an underwriter or trading committee."

## 4. Competitors and differentiation

Competitors: Planet, Maxar, ICEYE, Spire, Descartes Labs, Orbital Insight/Privateer, Windward (AIS-centric).
Most are either raw-imagery vendors (customer must build analytics) or AIS-first (blind to dark vessels).
**Our differentiation:**

- **Analytics-as-a-product, not pixels.** Customer defines an AOI and gets answers (counts, deltas, alerts, reports), not raw scenes to process.
- **EO-primary dark-vessel detection.** We detect vessels from imagery independent of AIS, then optionally cross-reference AIS to flag mismatches.
- **Grounded LLM briefings.** The existing "detections → Gemini structured assessment" pattern becomes an analyst-grade narrative tied to measured evidence, which underwriters and trading desks can cite.
- **Fast time-to-value.** Serverless pipeline already exists; onboarding an AOI is minutes, not an integration project.

## 5. Pricing / packaging hypothesis (to validate)

SaaS + usage, per tenant:

| Tier | Target | Price hypothesis | Includes |
|------|--------|------------------|----------|
| Watch | Single desk / pilot | ~$2k/mo | Up to 5 AOIs, daily revisit, dashboard + email alerts |
| Pro | Trading desk / insurer team | ~$8k/mo | Up to 50 AOIs, priority processing, API access, scheduled reports |
| Enterprise | Multi-team | Custom | Unlimited AOIs, SSO, SLA, dedicated support, higher revisit |

Usage add-ons: per-scene analysis credits, per-report generation, higher revisit cadence.
**Assumption to validate:** willingness-to-pay and revisit-cadence expectations with 3+ design-partner interviews (not yet done — flagged as assumption, not fact).

## 6. Success metrics

- Time from AOI creation to first briefing < 15 min.
- Vessel-count precision/recall vs a labeled harbor test set (target ≥0.85 both, to be measured once a real detector replaces stock YOLO on maritime imagery).
- Design-partner-confirmed willingness to pay at Pro tier.

## 7. Explicit assumptions to validate (do not treat as facts)

- Buyer willingness-to-pay at the tiers above.
- That daily revisit is sufficient for the trading/insurance use cases (may need intra-day).
- That stock YOLOv8n-OBB maritime accuracy is good enough for a pilot before a custom detector is trained.
- Legal/licensing terms of the underlying imagery source (must be settled before commercial sale).
