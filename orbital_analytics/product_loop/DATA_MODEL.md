# DATA_MODEL.md — TideWatch persistence (E1)

**Version:** 0.1 (cycle 4)
**Principle:** Extend, don't rewrite. `OrbTable` keeps its exact keys and role. Product-management entities live in a new single-table `CoreTable`.

## 1. Two tables, clear split

| Table | Role | Keys | Status |
|-------|------|------|--------|
| `OrbTable` (existing) | Raw scene + detection + analysis records, one row per image | PK `imageId`, SK `ownerId`; GSI `OwnerIndex` (`ownerId` + `timestamp`) | Unchanged. `ownerId` is reinterpreted as `tenantId` going forward (semantic only, no schema change, so Ingest/ObjDetect/Gemini/GetImages keep working). |
| `CoreTable` (new) | Product-management entities: Tenant, AOI, Observation time series, Report, Usage | PK `pk`, SK `sk`; GSI `GSI1` (`gsi1pk` + `gsi1sk`) | Added this cycle (additive). |

Why a second table rather than overloading `OrbTable`: `OrbTable`'s keys are image-centric (`imageId`/`ownerId`) and every existing handler depends on them. A generic single-table design needs generic `pk`/`sk`, so a clean new table is safer and more maintainable than contorting the existing one.

## 2. CoreTable single-table design

Generic keys: `pk` (partition), `sk` (sort). One GSI (`GSI1`) with `gsi1pk`/`gsi1sk` for cross-tenant lookups.

### Entities and key layout

| Entity | pk | sk | gsi1pk | gsi1sk | Key attributes |
|--------|----|----|--------|--------|----------------|
| Tenant | `TENANT#<tenantId>` | `TENANT#<tenantId>` | — | — | name, plan (`watch`/`pro`/`enterprise`), createdAt |
| AOI | `TENANT#<tenantId>` | `AOI#<aoiId>` | `AOI#<aoiId>` | `META` | name, geometry (GeoJSON polygon), bbox, revisit, alertRules, createdAt |

**AOI.alertRules** (E5) — list of rule objects evaluated by `AlertsFunc` on each new Observation:

```json
[
  {"id": "r1", "type": "vessel_max", "threshold": 40},
  {"id": "r2", "type": "vessel_min", "threshold": 2},
  {"id": "r3", "type": "surge_pct",  "threshold": 50},
  {"id": "r4", "type": "dark_vessel", "threshold": 3}
]
```

`vessel_max` fires when count > threshold, `vessel_min` when count < threshold, `surge_pct` when count is ≥ threshold% above the trailing average of the last 10 observations.
`dark_vessel` (E8) fires when `EO_detected − AIS_reported ≥ threshold`, i.e. at least N vessels are seen in imagery but broadcasting no AIS; it only evaluates when an AIS source is configured (`AIS_MODE` != off), never on fabricated data.
Fired alerts publish to the `TideWatchAlerts` SNS topic (`AlertsTopicArn` output); operators subscribe email/HTTPS endpoints.
| Observation | `AOI#<aoiId>` | `OBS#<isoTimestamp>#<imageId>` | — | — | vesselCount, byClass, imageId, sceneStatus |
| Report | `TENANT#<tenantId>` | `REPORT#<reportId>` | `REPORT#<reportId>` | `META` | title, aoiIds, promptText, status, createdAt |
| Usage | `TENANT#<tenantId>` | `USAGE#<YYYY-MM>` | — | — | scenesAnalyzed, reportsGenerated, aoiCount |

### Access patterns (all O(1) query, no scans)

1. Get tenant: GetItem `pk=TENANT#<t>, sk=TENANT#<t>`.
2. List a tenant's AOIs: Query `pk=TENANT#<t>` AND `begins_with(sk, "AOI#")`.
3. Get one AOI by id (tenant-agnostic, used by the analytics pipeline): Query `GSI1` `gsi1pk=AOI#<aoiId>`.
4. AOI activity time series (for change/delta, E4): Query `pk=AOI#<aoiId>` AND `begins_with(sk, "OBS#")`, `ScanIndexForward=false` for newest-first.
5. List a tenant's reports: Query `pk=TENANT#<t>` AND `begins_with(sk, "REPORT#")`.
6. Monthly usage for a tenant (billing, E9): GetItem `pk=TENANT#<t>, sk=USAGE#<YYYY-MM>`.

## 3. Tenancy model

- `tenantId` is the single tenancy axis. Today it defaults to `jose-test-user` (matching the current hardcoded owner) via an `x-tenant-id` request header.
- **E3 replaces the header with the authenticated Cognito token claim.** Until then the header is a scaffold, not a security boundary — documented as such, not asserted as auth.
- Every CoreTable read/write is scoped by `pk=TENANT#<tenantId>`, so tenant isolation is structural once E3 supplies a trusted `tenantId`.

## 4. What E1 implements this cycle

- `CoreTable` added to the CDK stack (pk/sk + GSI1), removal policy follows stage config.
- `AoiFunc` Lambda (Python 3.11) with AOI create/list/get/delete against `CoreTable`.
- API routes: `POST /v1/aois`, `GET /v1/aois`, `GET /v1/aois/{aoiId}`, `DELETE /v1/aois/{aoiId}`.
- Test coverage for the new table + routes; `npm run build` + `npx jest` + `cdk synth` green.

Deferred (later epics): Observation writes wired from the analytics step (E4), Report entity handlers (E6), Usage metering (E9), auth on `tenantId` (E3).
