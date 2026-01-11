# Elastic Dashboard Build Guide

This guide provides step-by-step instructions to build three dashboards for the metrics demo.

---

## Dashboard A: Golden Signals Overview

**Purpose:** Show the four golden signals (request rate, error rate, latency, saturation) to prove signal preservation.

**Time to Build:** 10-15 minutes

---

### Step 1: Create New Dashboard

1. Navigate to **Dashboards** → **Create Dashboard**
2. Name: `Golden Signals Overview`
3. Description: `Four golden signals for metrics demo services`

---

### Step 2: Add Request Rate Visualization

**Panel Title:** `Request Rate (req/sec)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS request_count = count()
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```
4. **Chart type:** Line chart
5. **X-axis:** `time_bucket`
6. **Y-axis:** `request_count`
7. **Split by:** `service.name` (color coding)
8. **Y-axis label:** `Requests per Second`
9. Click **Save and return**

---

### Step 3: Add Error Rate Visualization

**Panel Title:** `Error Rate (%)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS 
    total_requests = count(),
    errors = count() FILTER(attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*")
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| EVAL error_rate = (errors / total_requests) * 100
| SORT time_bucket DESC
```
4. **Chart type:** Line chart
5. **X-axis:** `time_bucket`
6. **Y-axis:** `error_rate` (percentage)
7. **Split by:** `service.name`
8. **Y-axis label:** `Error Rate (%)`
9. Click **Save and return**

---

### Step 4: Add Latency (P95) Visualization

**Panel Title:** `P95 Latency (ms)`

**Note:** If histogram metrics are not available, use request duration samples or skip this panel.

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL**
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.http_request_duration_seconds_sum IS NOT NULL
| STATS 
    p95_latency = percentile(metrics.http_request_duration_seconds_sum, 95)
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| EVAL p95_ms = p95_latency * 1000
| SORT time_bucket DESC
```
4. **Chart type:** Line chart
5. **X-axis:** `time_bucket`
6. **Y-axis:** `p95_ms` (milliseconds)
7. **Split by:** `service.name`
8. **Y-axis label:** `P95 Latency (ms)`
9. Click **Save and return**

**Fallback (if histogram not available):**
- Use average request duration or remove this panel
- Or show "Latency metrics require histogram support"

---

### Step 5: Add Saturation Visualization

**Panel Title:** `Saturation (Queue Depth)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL**
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.queue_depth IS NOT NULL
| STATS avg_queue = avg(metrics.queue_depth)
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```
4. **Chart type:** Area chart
5. **X-axis:** `time_bucket`
6. **Y-axis:** `avg_queue`
7. **Split by:** `service.name`
8. **Y-axis label:** `Queue Depth`
9. Click **Save and return**

**Alternative (CPU Work Units):**
If `queue_depth` not available, use:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.cpu_work_units IS NOT NULL
| STATS avg_cpu_work = avg(metrics.cpu_work_units)
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

---

### Step 6: Arrange Panels

**Layout:**
- **Row 1:** Request Rate (full width)
- **Row 2:** Error Rate (left), Latency (right)
- **Row 3:** Saturation (full width)

**Time Range:** Set dashboard time picker to "Last 1 hour"

**Auto-refresh:** Enable 30-second auto-refresh

---

## Dashboard B: Cardinality & Cost Pressure

**Purpose:** Visualize high-cardinality dimensions and show the impact of label explosion.

**Time to Build:** 10-15 minutes

---

### Step 1: Create Dashboard

1. Navigate to **Dashboards** → **Create Dashboard**
2. Name: `Cardinality & Cost Pressure`
3. Description: `High-cardinality label analysis`

---

### Step 2: Add Top User IDs (Firehose Mode)

**Panel Title:** `Top User IDs (High Cardinality)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL)
| STATS user_count = count() BY attributes.user_id
| SORT user_count DESC
| LIMIT 20
```
4. **Chart type:** Bar chart (horizontal)
5. **X-axis:** `user_count`
6. **Y-axis:** `attributes.user_id`
7. Click **Save and return**

**Expected:** 20+ unique user IDs (proves high cardinality)

---

### Step 3: Add Top Paths (Before Normalization)

**Panel Title:** `Top Paths (Firehose Mode)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.path IS NOT NULL
  AND (resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL)
| STATS path_count = count() BY attributes.path
| SORT path_count DESC
| LIMIT 20
```
4. **Chart type:** Bar chart (horizontal)
5. **X-axis:** `path_count`
6. **Y-axis:** `attributes.path`
7. Click **Save and return**

**Expected:** Many paths with numeric IDs (e.g., `/orders/12345`, `/orders/67890`)

---

### Step 4: Add Top Paths (After Normalization)

**Panel Title:** `Top Paths (Shaped Mode)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.path IS NOT NULL
  AND (resource.attributes.demo.mode == "shaped" OR attributes.user_id IS NULL)
| STATS path_count = count() BY attributes.path
| SORT path_count DESC
| LIMIT 20
```
4. **Chart type:** Bar chart (horizontal)
5. **X-axis:** `path_count`
6. **Y-axis:** `attributes.path`
7. Click **Save and return**

**Expected:** 5-10 normalized paths (e.g., `/orders/{id}`, `/users/{id}`)

---

### Step 5: Add Unique Combinations Count

**Panel Title:** `Unique Label Combinations (Cardinality Proxy)`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query (Firehose):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL)
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS unique_combinations = count()
```
4. **Chart type:** Metric (single number)
5. **Value:** `unique_combinations`
6. **Label:** `Firehose Mode: Unique Combinations`
7. Click **Save and return**

**Repeat for Shaped Mode:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (resource.attributes.demo.mode == "shaped" OR attributes.user_id IS NULL)
| STATS count()
  BY attributes.path
| STATS unique_combinations = count()
```

**Expected:**
- Firehose: 1000-10000+
- Shaped: 10-50
- **Reduction: 95-99%**

---

### Step 6: Add Label Distribution Table

**Panel Title:** `Label Value Distribution`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS 
    has_user_id = count() FILTER(attributes.user_id IS NOT NULL),
    has_pod = count() FILTER(attributes.pod IS NOT NULL),
    has_build_id = count() FILTER(attributes.build_id IS NOT NULL),
    has_path = count() FILTER(attributes.path IS NOT NULL),
    total = count()
```
4. **Chart type:** Data Table
5. **Columns:** Show all fields (has_user_id, has_pod, has_build_id, has_path, total)
6. Click **Save and return**

**Expected (Firehose):** All counts > 0  
**Expected (Shaped):** `has_user_id = 0`, `has_pod = 0`, `has_build_id = 0`

---

## Dashboard C: Before vs After (Firehose vs Shaped)

**Purpose:** Side-by-side comparison of firehose vs shaped metrics.

**Time to Build:** 15-20 minutes

---

### Step 1: Create Dashboard

1. Navigate to **Dashboards** → **Create Dashboard**
2. Name: `Before vs After: Firehose vs Shaped`
3. Description: `Comparison of metrics before and after shaping`

---

### Step 2: Add Time Range Filter

**Option A: Use Time Range Selector**
- Set dashboard time picker to show both periods
- Use "Last 30 minutes" to see transition

**Option B: Add Filter Control**
1. Click **Add control** → **Time range**
2. Set default: "Last 30 minutes"
3. This allows switching between "before" and "after" periods

---

### Step 3: Add Request Count Comparison

**Panel Title:** `Request Count: Firehose vs Shaped`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
| EVAL mode = CASE(
    resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS request_count = count()
  BY mode, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```
4. **Chart type:** Line chart
5. **X-axis:** `time_bucket`
6. **Y-axis:** `request_count`
7. **Split by:** `mode` (color coding)
8. Click **Save and return**

**Expected:** Two lines (firehose and shaped) with similar request counts

**Note:** Uses `resource.attributes.demo.mode` if available, otherwise falls back to checking for `attributes.user_id` presence.

---

### Step 4: Add Path Cardinality Comparison

**Panel Title:** `Path Cardinality: Before vs After`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
  AND attributes.path IS NOT NULL
| EVAL mode = CASE(
    resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS unique_paths = count_distinct(attributes.path)
  BY mode, time_bucket = bucket(@timestamp, 5m)
| SORT time_bucket DESC
```
4. **Chart type:** Bar chart (grouped)
5. **X-axis:** `time_bucket`
6. **Y-axis:** `unique_paths`
7. **Split by:** `mode`
8. Click **Save and return**

**Expected:**
- Firehose: 50-200 unique paths
- Shaped: 5-10 unique paths

---

### Step 5: Add Label Presence Comparison

**Panel Title:** `Label Presence: Firehose vs Shaped`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
| EVAL mode = CASE(
    resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS 
    with_user_id = count() FILTER(attributes.user_id IS NOT NULL),
    with_pod = count() FILTER(attributes.pod IS NOT NULL),
    with_build_id = count() FILTER(attributes.build_id IS NOT NULL),
    total = count()
  BY mode
```
4. **Chart type:** Stacked bar chart
5. **X-axis:** `mode`
6. **Y-axis:** Stacked values (with_user_id, with_pod, with_build_id)
7. Click **Save and return**

**Expected:**
- Firehose: All labels present
- Shaped: All labels = 0 (removed)

---

### Step 6: Add Summary Metrics

**Panel Title:** `Cardinality Reduction Summary`

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query (Firehose):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND @timestamp < NOW() - 15m
  AND service.name == "frontend"
  AND (resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL)
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```
4. **Chart type:** Metric (single number)
5. **Value:** `firehose_series`
6. **Label:** `Firehose: Unique Series`
7. Click **Save and return**

**Repeat for Shaped:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (resource.attributes.demo.mode == "shaped" OR attributes.user_id IS NULL)
| STATS count()
  BY attributes.path
| STATS shaped_series = count()
```

**Add Reduction % Panel:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
| EVAL mode = CASE(
    resource.attributes.demo.mode == "firehose" OR attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS count()
  BY mode, attributes.user_id, attributes.path, attributes.pod
| STATS series_count = count() BY mode
| STATS 
    firehose = max(series_count) FILTER(mode == "firehose"),
    shaped = max(series_count) FILTER(mode == "shaped")
| EVAL reduction_pct = ((firehose - shaped) / firehose) * 100
```

---

## Dashboard Layout Recommendations

### Golden Signals Overview
```
┌─────────────────────────────────────┐
│     Request Rate (req/sec)          │
├─────────────────────────────────────┤
│  Error Rate (%)    │  P95 Latency   │
├─────────────────────────────────────┤
│     Saturation (Queue Depth)         │
└─────────────────────────────────────┘
```

### Cardinality & Cost Pressure
```
┌──────────────────┬──────────────────┐
│  Top User IDs    │  Top Paths       │
│  (Firehose)      │  (Firehose)      │
├──────────────────┼──────────────────┤
│  Top Paths       │  Unique Combos   │
│  (Shaped)        │  (Comparison)    │
├──────────────────┴──────────────────┤
│     Label Distribution Table        │
└─────────────────────────────────────┘
```

### Before vs After
```
┌─────────────────────────────────────┐
│  Request Count: Firehose vs Shaped  │
├─────────────────────────────────────┤
│  Path Cardinality: Before vs After   │
├─────────────────────────────────────┤
│  Label Presence Comparison          │
├─────────────────────────────────────┤
│  Cardinality Reduction Summary      │
└─────────────────────────────────────┘
```

---

## Exporting Dashboards (NDJSON)

### Manual Export Steps

1. Navigate to **Stack Management** → **Saved Objects**
2. Filter: Type = `dashboard`
3. Select dashboards to export
4. Click **Export**
5. Save as `kibana/dashboards.ndjson`

### Import Steps

1. Navigate to **Stack Management** → **Saved Objects** → **Import**
2. Upload `kibana/dashboards.ndjson`
3. Check **Overwrite saved objects** (if updating)
4. Click **Import**

**Note:** Object IDs in NDJSON must be unique. If importing fails due to ID conflicts, edit the NDJSON to change object IDs.

---

## Troubleshooting

### Visualization Not Loading

**Check:**
- Data view exists and has data
- Time range has data
- Field names match (use Discover to verify)

### ES|QL Queries Failing

**Troubleshooting:**
- Check field names in Discover (field names may differ)
- Verify time range has data
- Simplify query (remove complex aggregations)
- Check for syntax errors (missing pipes, incorrect function names)
- Verify data view/index pattern is correct

### Missing Fields

**Verify:**
- Service is sending metrics
- Collector is exporting correctly
- Field names in actual data (check Discover)

---

**Last Updated:** 2026-01-11  
**Dashboard Version:** 1.0
