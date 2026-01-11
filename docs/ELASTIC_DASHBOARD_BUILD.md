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
4. **Chart type:** Select **Line** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `time_bucket` in the field
6. **Vertical axis (Y-axis):** Enter `request_count` in the field
7. **Breakdown (Split by):** Enter `service.name` in the field. This will create separate lines for each service (frontend, api, worker) with different colors
8. **Y-axis label (optional):** You can customize the label to "Requests per Second" if desired
9. Click **Apply and close** to save the visualization

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
| EVAL is_error = CASE(
    attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*", 
    1, 
    0
  )
| STATS 
    total_requests = count(),
    errors = sum(is_error)
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| EVAL error_rate = (errors / total_requests) * 100
| SORT time_bucket DESC
```
4. **Chart type:** Select **Line** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `time_bucket` in the field
6. **Vertical axis (Y-axis):** Enter `error_rate` in the field
7. **Breakdown (Split by):** Enter `service.name` in the Breakdown field. This creates separate lines for each service with different colors
8. **Y-axis label (optional):** You can customize the label to "Error Rate (%)" if desired
9. Click **Apply and close** to save the visualization

---

### Step 4: Add Latency (P95) Visualization

**Panel Title:** `P95 Latency (ms)`

**Note:** OpenTelemetry histograms are exported as multiple time series. The actual field names may vary. This query provides a working fallback and instructions for finding the correct fields.

**Steps:**
1. Click **Add visualization**
2. Select **ES|QL** as data source
3. **ES|QL Query (fallback - request count as proxy):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS 
    request_count = count()
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```
4. **Chart type:** Select **Line** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `time_bucket` in the field
6. **Vertical axis (Y-axis):** Enter `request_count` in the field
7. **Breakdown (Split by):** Enter `service.name` in the Breakdown field. This creates separate lines for each service with different colors
8. **Y-axis label (optional):** You can customize the label to "Request Count (latency proxy)" if desired
9. Click **Apply and close** to save the visualization

**Alternative (if histogram fields are available):**
First, check what duration fields exist:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| LIMIT 1
```
Then inspect the `metrics.*` fields. If you find fields like:
- `metrics.http_request_duration_seconds_sum`
- `metrics.http_request_duration_seconds_count`

You can calculate average latency:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.http_request_duration_seconds_sum IS NOT NULL
  AND metrics.http_request_duration_seconds_count IS NOT NULL
| EVAL avg_latency_seconds = metrics.http_request_duration_seconds_sum / metrics.http_request_duration_seconds_count
| STATS 
    avg_latency = avg(avg_latency_seconds)
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| EVAL avg_latency_ms = avg_latency * 1000
| SORT time_bucket DESC
```

**Note:** P95 latency requires histogram bucket data which may not be directly queryable. Use average latency as shown above, or remove this panel if duration metrics are not available.

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
  AND attributes.user_id IS NOT NULL
| STATS user_count = count() BY attributes.user_id
| SORT user_count DESC
| LIMIT 20
```
4. **Chart type:** Select **Bar** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `attributes.user_id` (the categories - user IDs as strings)
6. **Vertical axis (Y-axis):** Enter `user_count` (the numeric values - counts)
7. Click **Apply and close** to save the visualization

**Alternative (Table view):** If you prefer a table format instead of a chart:
- Select **Table** as the chart type
- The table will automatically show `user_count` and `attributes.user_id` columns
- You can sort by clicking column headers

**Note:** In Kibana's Bar chart, categories (strings) go on the horizontal axis and values (numbers) go on the vertical axis. This creates vertical bars, which is the standard orientation.

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
  AND attributes.user_id IS NOT NULL
| STATS path_count = count() BY attributes.path
| SORT path_count DESC
| LIMIT 20
```
4. **Chart type:** Select **Bar** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `attributes.path` (the categories - paths as strings)
6. **Vertical axis (Y-axis):** Enter `path_count` (the numeric values - counts)
7. Click **Apply and close** to save the visualization

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
  AND attributes.user_id IS NULL
| STATS path_count = count() BY attributes.path
| SORT path_count DESC
| LIMIT 20
```
4. **Chart type:** Select **Bar** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `attributes.path` (the categories - paths as strings)
6. **Vertical axis (Y-axis):** Enter `path_count` (the numeric values - counts)
7. Click **Apply and close** to save the visualization

**Expected:** 5-10 normalized paths (e.g., `/orders/{id}`, `/users/{id}`)

**Troubleshooting "No results found":**
- **Check if demo is in shaped mode:** The query filters for `attributes.user_id IS NULL` (shaped mode). If you're still in firehose mode, you'll get no results.
- **Switch to shaped mode first:** Run `./scripts/switch-mode.sh shaped` and wait 1-2 minutes for new metrics to flow
- **Check time range:** Try a longer time range (e.g., `NOW() - 1h`) to see if there's any shaped mode data
- **Verify data exists:** First run this diagnostic query:
  ```esql
  FROM metrics-generic.otel-default
  | WHERE @timestamp >= NOW() - 1h
    AND service.name == "frontend"
    AND attributes.user_id IS NULL
  | LIMIT 10
  ```
  If this returns results, your shaped mode is working. If not, switch to shaped mode and wait a few minutes.

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
  AND attributes.user_id IS NOT NULL
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
  AND attributes.user_id IS NULL
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
| EVAL 
    has_user_id_val = CASE(attributes.user_id IS NOT NULL, 1, 0),
    has_pod_val = CASE(attributes.pod IS NOT NULL, 1, 0),
    has_build_id_val = CASE(attributes.build_id IS NOT NULL, 1, 0),
    has_path_val = CASE(attributes.path IS NOT NULL, 1, 0)
| STATS 
    has_user_id = sum(has_user_id_val),
    has_pod = sum(has_pod_val),
    has_build_id = sum(has_build_id_val),
    has_path = sum(has_path_val),
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
    attributes.user_id IS NOT NULL, 
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

**Note:** Determines mode by checking for `attributes.user_id` presence (firehose mode has user_id, shaped mode does not).

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
    attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS unique_paths = count_distinct(attributes.path)
  BY mode, time_bucket = bucket(@timestamp, 5m)
| SORT time_bucket DESC
```
4. **Chart type:** Select **Bar** from the chart type dropdown, then select **Unstacked** from the second dropdown (this creates side-by-side bars instead of stacked)
5. **Horizontal axis (X-axis):** Enter `time_bucket` (the time buckets)
6. **Vertical axis (Y-axis):** Enter `unique_paths` (the numeric values)
7. **Breakdown (Split by):** Enter `mode` in the Breakdown field to create separate bars for firehose and shaped modes
8. Click **Apply and close** to save the visualization

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
| EVAL 
    mode = CASE(
      attributes.user_id IS NOT NULL, 
      "firehose", 
      "shaped"
    ),
    with_user_id_val = CASE(attributes.user_id IS NOT NULL, 1, 0),
    with_pod_val = CASE(attributes.pod IS NOT NULL, 1, 0),
    with_build_id_val = CASE(attributes.build_id IS NOT NULL, 1, 0)
| STATS 
    with_user_id = sum(with_user_id_val),
    with_pod = sum(with_pod_val),
    with_build_id = sum(with_build_id_val),
    total = count()
  BY mode
```
4. **Chart type:** Select **Stacked bar** from the chart type dropdown
5. **Horizontal axis (X-axis):** Enter `mode` in the field
6. **Vertical axis (Y-axis):** Add multiple fields: `with_user_id`, `with_pod`, `with_build_id` (use "+ Add a field" button if needed)
7. Click **Apply and close** to save the visualization

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
  AND attributes.user_id IS NOT NULL
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
  AND attributes.user_id IS NULL
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
    attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS count()
  BY mode, attributes.user_id, attributes.path, attributes.pod
| STATS series_count = count() BY mode
| EVAL 
    firehose = CASE(mode == "firehose", series_count, null),
    shaped = CASE(mode == "shaped", series_count, null)
| STATS 
    firehose_max = max(firehose),
    shaped_max = max(shaped)
| EVAL reduction_pct = ((firehose_max - shaped_max) / firehose_max) * 100
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
