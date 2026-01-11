# Elastic Validation Queries

This document provides KQL and ES|QL queries to validate the demo and prove cardinality reduction while preserving metrics.

---

## Table of Contents

1. [Ingestion Validation](#ingestion-validation)
2. [Service Discovery](#service-discovery)
3. [Cardinality Analysis](#cardinality-analysis)
4. [Metrics Preservation](#metrics-preservation)
5. [Before/After Comparison](#beforeafter-comparison)

---

## Ingestion Validation

### Check if Metrics Are Arriving

**Method 1: KQL in Discover**
```
service.name: ("frontend" OR "api" OR "worker") AND @timestamp >= now()-15m
```

**Method 2: ES|QL in Dev Tools**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name IN ("frontend", "api", "worker")
| LIMIT 10
```

**Expected Result:**
- Documents appear in last 15 minutes
- Fields: `service.name`, `metrics.http_request_total`, `@timestamp`

**If Empty:**
- Check collector logs: `kubectl logs -n elastic-metrics-demo -l app=otel-collector`
- Verify API key in secret
- Check network connectivity to Elastic endpoint

---

### Verify Data Stream

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS count() BY data_stream.dataset, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:** `generic.otel` dataset with increasing document counts.

---

## Service Discovery

### Find All Services

**KQL:**
```
service.name: * AND @timestamp >= now()-15m
```

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS metric_count = count() BY service.name
| SORT metric_count DESC
```

**Expected:** 3 services (frontend, api, worker) with non-zero counts.

**Alternative (if service.name not populated):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS metric_count = count() BY resource.attributes.service.name
| SORT metric_count DESC
```

---

### Verify Service Health

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name IN ("frontend", "api", "worker")
| STATS 
    metric_count = count(),
    services_seen = count_distinct(service.name)
  BY time_bucket = bucket(@timestamp, 30s)
| SORT time_bucket DESC
```

**Expected:** `services_seen = 3` (all services sending metrics).

---

## Cardinality Analysis

### Firehose Mode: Count Unique Label Combinations

**Goal:** Prove high cardinality before shaping.

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS series_count = count() 
  BY attributes.user_id, attributes.path
| SORT series_count DESC
| LIMIT 50
```

**Expected Result:**
- 50+ unique combinations of `user_id` × `path`
- Each combination represents a unique time series

**Interpretation:**
- High cardinality = many unique combinations
- If you see 100+ combinations, that's 100+ time series for this metric

---

### Firehose Mode: Count Unique User IDs

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS unique_users = count_distinct(attributes.user_id)
  BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:** 10-100+ unique user IDs per minute.

---

### Firehose Mode: Count Unique Paths (Full)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.path IS NOT NULL
| STATS unique_paths = count_distinct(attributes.path)
  BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:** 20-100+ unique paths (e.g., `/orders/12345`, `/orders/67890`, etc.).

---

### Shaped Mode: Count Unique Paths (Normalized)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.path IS NOT NULL
| STATS unique_paths = count_distinct(attributes.path)
  BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:** 5-10 unique paths (e.g., `/orders/{id}`, `/users/{id}`, `/health`).

**Comparison:**
- Before: 100+ unique paths
- After: 5-10 unique paths
- **Reduction: 90-95%**

---

### Shaped Mode: Verify Labels Removed

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name == "frontend"
| STATS 
    with_user_id = count() FILTER(attributes.user_id IS NOT NULL),
    with_pod = count() FILTER(attributes.pod IS NOT NULL),
    with_build_id = count() FILTER(attributes.build_id IS NOT NULL),
    total = count()
  BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:**
- `with_user_id = 0` (user_id removed)
- `with_pod = 0` (pod removed)
- `with_build_id = 0` (build_id removed)
- `total > 0` (metrics still arriving)

---

### Cardinality Proxy: Count Distinct Dimensions

**Method:** Count unique combinations of key dimensions.

**Firehose Mode:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS series_count = count()
  BY service.name,
     attributes.method,
     attributes.path,
     attributes.status_code,
     attributes.user_id,
     attributes.pod
| STATS total_series = count() BY service.name
```

**Shaped Mode:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS series_count = count()
  BY service.name,
     attributes.method,
     attributes.path,
     attributes.status_code
| STATS total_series = count() BY service.name
```

**Expected Reduction:** 90-95% fewer unique combinations.

---

## Metrics Preservation

### Request Rate (Before/After)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS request_count = count()
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:**
- Request counts per minute should be similar before/after shaping
- Variation < 10% is acceptable (due to timing)

**Validation:**
- Compare request counts in last 5 minutes (before) vs next 5 minutes (after)
- Should be within 10% of each other

---

### Error Rate (Before/After)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*")
| STATS error_count = count()
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Expected:**
- Error counts should match before/after (if errors exist)
- Error rate = error_count / total_count should be consistent

**Combined Query (Error Rate %):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS 
    total_requests = count(),
    errors = count() FILTER(attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*")
  BY time_bucket = bucket(@timestamp, 1m)
| EVAL error_rate = (errors / total_requests) * 100
| SORT time_bucket DESC
```

---

### Request Rate by Method

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.method IS NOT NULL
| STATS request_count = count()
  BY service.name, attributes.method, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC, request_count DESC
```

**Expected:**
- Method distribution (GET, POST, etc.) should be similar before/after

---

### Path Distribution (Normalized)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.path IS NOT NULL
| STATS path_count = count() BY attributes.path
| SORT path_count DESC
| LIMIT 20
```

**Expected (Shaped Mode):**
- Top paths: `/health`, `/orders/{id}`, `/users/{id}`, `/products/{id}`
- No numeric IDs in paths (all normalized)

---

## Before/After Comparison

### Using demo.mode Resource Attribute

**Note:** The collector adds a `demo.mode` resource attribute (`firehose` or `shaped`) for easy filtering.

**Filter by Mode (KQL):**
```
resource.attributes.demo.mode: firehose
```
or
```
resource.attributes.demo.mode: shaped
```

**Filter by Mode (ES|QL):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND resource.attributes.demo.mode == "firehose"
```

---

### Side-by-Side Cardinality Comparison

**Firehose Mode (Before):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND resource.attributes.demo.mode == "firehose"
  AND service.name == "frontend"
| STATS firehose_series = count()
  BY attributes.user_id, attributes.path
| STATS firehose_total = count()
```

**Shaped Mode (After):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND resource.attributes.demo.mode == "shaped"
  AND service.name == "frontend"
| STATS shaped_series = count()
  BY attributes.path
| STATS shaped_total = count()
```

**Compare Results:**
- `firehose_total` vs `shaped_total` (should be similar, within 10%)
- Unique combinations: firehose (100+) vs shaped (5-10)

---

### Time Series Count Estimation

**Method:** Count unique combinations of all label dimensions.

**Firehose:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND resource.attributes.demo.mode == "firehose"
  AND service.name == "frontend"
| STATS count() 
  BY service.name,
     attributes.method,
     attributes.path,
     attributes.status_code,
     attributes.user_id,
     attributes.pod,
     attributes.build_id
| STATS firehose_series_count = count()
```

**Shaped:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND resource.attributes.demo.mode == "shaped"
  AND service.name == "frontend"
| STATS count()
  BY service.name,
     attributes.method,
     attributes.path,
     attributes.status_code
| STATS shaped_series_count = count()
```

**Expected:**
- `firehose_series_count`: 1000-10000+
- `shaped_series_count`: 50-200
- **Reduction: 90-98%**

---

## Using KQL in Discover (UI Method)

### Find High-Cardinality Labels

**Steps:**
1. Open Discover → Data View: `metrics-*`
2. Filter: `service.name: frontend AND @timestamp >= now()-15m`
3. Add aggregation: **Terms** on `attributes.user_id`
4. Set size: 50
5. View unique values

**Expected (Firehose):** 50+ unique user IDs

**Expected (Shaped):** 0 results (field removed)

---

### Compare Path Cardinality

**Steps:**
1. Filter: `service.name: frontend AND attributes.path: *`
2. Add aggregation: **Terms** on `attributes.path`
3. Set size: 20
4. Sort by: Count (descending)

**Expected (Firehose):** Many paths with numeric IDs

**Expected (Shaped):** 5-10 normalized paths

---

### Verify Labels Removed

**Steps:**
1. Filter: `service.name: frontend AND @timestamp >= now()-5m`
2. Try to filter by: `attributes.user_id: *`
3. Result should be empty (field doesn't exist)

**Alternative:**
1. Expand a document
2. Look for `attributes.user_id` field
3. Should not be present

---

## Cardinality Proxy Method (Simplified)

### Step 1: Choose a Metric

Use `http_request_total` or any counter metric that's consistently emitted.

### Step 2: Count Unique Dimensions (Firehose)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND metrics.http_request_total IS NOT NULL
| STATS count() 
  BY attributes.user_id, attributes.path, attributes.pod
| STATS unique_combinations = count()
```

**Record:** `unique_combinations = X` (e.g., 5000)

### Step 3: Count Unique Dimensions (Shaped)

**ES|QL:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND metrics.http_request_total IS NOT NULL
| STATS count() 
  BY attributes.path
| STATS unique_combinations = count()
```

**Record:** `unique_combinations = Y` (e.g., 10)

### Step 4: Calculate Reduction

**Formula:** `(X - Y) / X * 100 = % reduction`

**Example:** `(5000 - 10) / 5000 * 100 = 99.8% reduction`

---

## Expected Results Summary

| Query Type | Firehose Mode | Shaped Mode | Change |
|------------|---------------|-------------|--------|
| Unique user_id × path combos | 100-1000+ | 0 (removed) | **100% reduction** |
| Unique paths | 50-200+ | 5-10 | **90-95% reduction** |
| Unique pod names | 10-50+ | 0 (removed) | **100% reduction** |
| Request rate visibility | ✅ | ✅ | **Preserved** |
| Error rate visibility | ✅ | ✅ | **Preserved** |
| Total time series (estimated) | 10,000+ | 200-500 | **95-98% reduction** |

---

## Troubleshooting Queries

### If Service Names Don't Match

**Try:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS count() BY resource.attributes.service.name
```

### If Field Names Differ

**Search for fields:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| LIMIT 1
```

Then inspect available fields and adjust queries accordingly.

### If Cardinality Not Dropping

**Check:**
1. Wait 3-5 minutes after switching modes
2. Filter to recent metrics only: `@timestamp >= now()-3m`
3. Verify collector config updated:
   ```bash
   kubectl get configmap otel-collector-config -n elastic-metrics-demo -o yaml
   ```

---

**Last Updated:** 2026-01-11  
**Query Version:** 1.0
