# Elastic Demo Checklist - Quick Reference

## Before You Start

**Required Values:**
- ✅ Elastic OTLP Endpoint: `https://[deployment-id].ingest.[region].aws.elastic.cloud:443`
- ✅ Elastic API Key: (with `write` permissions for metrics)
- ✅ Dataset name: `metrics-demo` (optional, for routing)
- ✅ Demo mode: `firehose` or `shaped` (set via `DEMO_MODE` env var)

**Prerequisites:**
- Kubernetes cluster running (kind/k3d or EKS)
- Services deployed: `frontend`, `api`, `worker`, `otel-collector`
- Load generator running (k6 jobs)
- 5-10 minutes of traffic generated

---

## Sanity Checks (Do First!)

### 1. Verify Metrics Are Arriving
**Where:** Kibana → Discover → Data View: `metrics-*`

**KQL Query:**
```
service.name: ("frontend" OR "api" OR "worker") AND @timestamp >= now()-15m
```

**What to see:**
- Documents appearing in last 15 minutes
- `service.name` field shows: `frontend`, `api`, `worker`
- `metrics.http_request_total` or similar counter fields present

**If empty:** Check collector logs, verify API key, check network connectivity.

### 2. Verify Service Names
**Where:** Kibana → Discover → Filter by `service.name`

**ESQL Query (Dev Tools):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS metric_count = count() BY service.name
| SORT metric_count DESC
```

**Expected:** 3 services (frontend, api, worker) with non-zero counts.

---

## Firehose Mode Steps

### 1. Confirm High-Cardinality Labels
**Where:** Kibana → Discover → Expand a document

**Look for:**
- `attributes.user_id` (e.g., `user_1234`)
- `attributes.path` (e.g., `/orders/12345`)
- `attributes.pod` (e.g., `frontend-998fb5889-7h55j`)
- `attributes.build_id` (e.g., `build-123`)

**KQL to find high-cardinality:**
```
service.name: frontend AND attributes.user_id: *
```

### 2. Show Cardinality Explosion
**Where:** Kibana → Discover → Aggregations

**ESQL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS series_count = count() BY attributes.user_id, attributes.path
| SORT series_count DESC
| LIMIT 50
```

**Expected:** Many unique combinations (100+ different `user_id` + `path` pairs).

### 3. Show Cost Impact
**Where:** Kibana → Stack Monitoring → Metrics (if available)

**Talk point:** "Each unique label combination = 1 time series. With 10,000 users × 50 paths = 500,000 time series. That's expensive."

---

## Switch to Shaped Mode

### 1. Update Collector Config
**Command:**
```bash
./scripts/switch-mode.sh shaped
```

**Wait:** 30-60 seconds for collector to restart and new metrics to flow.

### 2. Verify Labels Removed
**Where:** Kibana → Discover → Expand new documents

**Look for:**
- ❌ `attributes.user_id` should be **missing**
- ❌ `attributes.pod` should be **missing**
- ❌ `attributes.build_id` should be **missing**
- ✅ `attributes.path` should be **normalized** (e.g., `/orders/{id}` instead of `/orders/12345`)

**KQL to verify:**
```
service.name: frontend AND @timestamp >= now()-5m AND NOT attributes.user_id: *
```

### 3. Compare Cardinality
**ESQL Query (After Shaping):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS series_count = count() BY attributes.path
| SORT series_count DESC
| LIMIT 20
```

**Expected:** Only 5-10 unique paths (normalized), vs 100+ before.

---

## Proof Points (The 5 Bullets)

### ✅ 1. Metrics Still Arriving
**Query:**
```
service.name: ("frontend" OR "api" OR "worker") AND @timestamp >= now()-5m
```
**Expected:** Documents continue flowing.

### ✅ 2. Cardinality Dropped 90%+
**Before:** 100+ unique `user_id` × `path` combinations
**After:** 5-10 normalized paths
**Proof:** Compare ESQL queries above.

### ✅ 3. Request Rate Preserved
**ESQL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS request_count = count() BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```
**Expected:** Similar request counts before/after (within 10%).

### ✅ 4. Error Rate Preserved
**ESQL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*")
| STATS error_count = count() BY time_bucket = bucket(@timestamp, 1m)
```
**Expected:** Error rate consistent (or zero if no errors).

### ✅ 5. Core Metrics Intact
**Dashboard:** "Golden Signals Overview" (see DASHBOARD_BUILD.md)
**Expected:** All 4 gold metrics visible and updating.

---

## If Something Breaks (Top 5 Fixes)

### 1. No Metrics Arriving
**Check:**
- Collector pod logs: `kubectl logs -n elastic-metrics-demo -l app=otel-collector`
- Look for export errors or authentication failures
- Verify API key in secret: `kubectl get secret elastic-otlp-secret -n elastic-metrics-demo -o yaml`

**Fix:** Regenerate API key, update secret, restart collector.

### 2. Wrong Service Names
**Check:** Filter by `resource.attributes.service.name` instead of `service.name`

**KQL:**
```
resource.attributes.service.name: ("frontend" OR "api" OR "worker")
```

### 3. Can't Find High-Cardinality Labels
**Check:** Ensure demo is in `firehose` mode:
```bash
kubectl get configmap demo-config -n elastic-metrics-demo -o jsonpath='{.data.DEMO_MODE}'
```

**Fix:** Switch to firehose: `./scripts/switch-mode.sh firehose`

### 4. Cardinality Not Dropping After Shaping
**Check:** Wait 2-3 minutes for old metrics to age out, then check recent documents only:
```
@timestamp >= now()-3m
```

**Verify:** Collector config updated:
```bash
kubectl get configmap otel-collector-config -n elastic-metrics-demo -o yaml | grep -A 5 "attributes/delete"
```

### 5. ESQL Queries Failing
**Fallback:** Use KQL in Discover:
- Filter: `service.name: frontend`
- Add aggregation: Terms on `attributes.user_id` (before) or `attributes.path` (after)
- Compare unique value counts

---

## Quick Demo Flow

1. **Start:** Show firehose mode metrics with high cardinality
2. **Switch:** Run `./scripts/switch-mode.sh shaped`
3. **Wait:** 60 seconds
4. **Compare:** Show before/after cardinality queries
5. **Prove:** Show gold metrics dashboard (metrics preserved)
6. **Close:** "Same metrics. 50× fewer time series. Lower cost."

---

## Expected Outcomes

| Metric | Firehose | Shaped | Change |
|--------|----------|--------|--------|
| Unique time series | 10,000+ | 200-500 | **95% reduction** |
| Request rate visibility | ✅ | ✅ | **Preserved** |
| Error rate visibility | ✅ | ✅ | **Preserved** |
| Latency visibility | ✅ | ✅ | **Preserved** |
| Cost per hour | High | Low | **~95% savings** |

---

**Last Updated:** 2026-01-11  
**Demo Duration:** 10-15 minutes  
**Audience:** Technical (SREs, DevOps, Observability Engineers)
