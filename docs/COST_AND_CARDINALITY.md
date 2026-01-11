# Cost and Cardinality: Understanding Time Series Explosion

This document explains how metric cardinality affects cost and performance, and how OpenTelemetry Collector shaping addresses these issues.

## What is Cardinality?

**Cardinality** in metrics refers to the number of unique time series created by the combination of metric names and label values.

### Example: Simple Counter

A simple counter with no labels creates **1 time series**:
```
http_requests_total = 1000
```

### Example: Counter with Labels

A counter with labels creates **multiple time series**, one for each unique combination:
```
http_requests_total{method="GET", status="200"} = 500
http_requests_total{method="GET", status="404"} = 50
http_requests_total{method="POST", status="200"} = 400
http_requests_total{method="POST", status="500"} = 50
```
This creates **4 time series**.

### Example: High Cardinality

When you add high-cardinality labels, the number of time series grows exponentially:

```
http_requests_total{
  method="GET",
  status="200",
  user_id="user_1",      # 1000 unique values
  path="/orders/12345",  # 1000 unique values
  pod="frontend-abc123", # 10 unique values
  instance="10.0.1.5"    # 10 unique values
}
```

**Calculation**:
- methods: 2 (GET, POST)
- status codes: 5 (200, 404, 500, etc.)
- user_ids: 1000
- paths: 1000
- pods: 10
- instances: 10

**Total time series**: 2 × 5 × 1000 × 1000 × 10 × 10 = **1,000,000,000 time series**

Even with just 100 user_ids and 100 paths: 2 × 5 × 100 × 100 × 10 × 10 = **10,000,000 time series**

## Why Cardinality Matters

### 1. Storage Cost

Each time series requires storage for:
- Metric metadata (name, labels)
- Data points (timestamp, value)
- Index entries

**Example**:
- 10,000 time series × 1 data point/minute × 30 days = 432,000,000 data points
- At ~100 bytes per data point = **~43 GB per month**

With shaping (500 time series):
- 500 time series × 1 data point/minute × 30 days = 21,600,000 data points
- At ~100 bytes per data point = **~2.2 GB per month**

**Savings: 95% reduction in storage**

### 2. Query Performance

High cardinality slows down queries:

- **Index size**: Larger indexes take longer to search
- **Data scanning**: More time series = more data to scan
- **Aggregation**: Grouping by labels is slower with more unique values

**Example**:
- Querying 10,000 time series: ~5-10 seconds
- Querying 500 time series: ~0.1-0.5 seconds

**Improvement: 10-100x faster queries**

### 3. Dashboard Performance

Dashboards with high-cardinality metrics:
- Load slowly
- Consume excessive memory
- Become unresponsive
- May timeout

**Example**:
- Dashboard with 10,000 time series: 30-60 seconds to load
- Dashboard with 500 time series: 1-2 seconds to load

**Improvement: 15-30x faster dashboard loading**

### 4. Alerting Performance

Alert rules evaluate all matching time series:
- High cardinality = more evaluations
- Slower alert evaluation
- Higher memory usage
- Potential alert rule timeouts

**Example**:
- Alert on 10,000 time series: 5-10 seconds per evaluation
- Alert on 500 time series: 0.1-0.5 seconds per evaluation

**Improvement: 10-100x faster alert evaluation**

## The Firehose Problem

### What Happens in Firehose Mode

In firehose mode, we collect metrics with all labels:

```javascript
// Service emits:
http_requests_total{
  service: "frontend",
  method: "GET",
  status_code: "200",
  user_id: "user_12345",        // High cardinality!
  path: "/orders/67890",         // High cardinality!
  pod: "frontend-abc123",        // Changes with deployments
  instance: "10.0.1.5",          // Changes with scaling
  container: "frontend",         // Usually constant
  build_id: "build-20240115"    // Changes with builds
}
```

**Result**: Thousands or millions of time series

### Real-World Impact

**Scenario**: E-commerce application
- 3 services (frontend, api, worker)
- 2 pods per service
- 10,000 active users per day
- 100 unique API paths
- 5 HTTP methods
- 5 status codes

**Calculation**:
3 services × 2 pods × 10,000 users × 100 paths × 5 methods × 5 status codes = **150,000,000 potential time series**

Even with 1% of combinations actually occurring: **1,500,000 time series**

**Cost** (estimated):
- Storage: ~650 GB/month
- Query time: 30-60 seconds
- Dashboard load: 60+ seconds
- Alert evaluation: 10-20 seconds

## The Shaped Solution

### What Happens in Shaped Mode

In shaped mode, we remove high-cardinality labels and normalize values:

```javascript
// Service emits (same as before):
http_requests_total{
  service: "frontend",
  method: "GET",
  status_code: "200",
  user_id: "user_12345",        // Will be removed
  path: "/orders/67890",         // Will be normalized
  pod: "frontend-abc123",        // Will be removed
  instance: "10.0.1.5",          // Will be removed
  container: "frontend",         // Will be removed
  build_id: "build-20240115"     // Will be removed
}

// Collector shapes to:
http_requests_total{
  service: "frontend",
  method: "GET",
  status_code: "200",
  path: "/orders/{id}"           // Normalized!
  // user_id, pod, instance, container, build_id removed
}
```

**Result**: Hundreds of time series instead of millions

### Real-World Impact (Shaped)

**Same scenario as before**:
- 3 services
- 100 normalized paths (instead of 10,000 unique)
- 5 HTTP methods
- 5 status codes

**Calculation**:
3 services × 100 paths × 5 methods × 5 status codes = **7,500 time series**

**Cost** (estimated):
- Storage: ~3.2 GB/month (99.5% reduction)
- Query time: 0.5-1 second (30-60x faster)
- Dashboard load: 2-3 seconds (20-30x faster)
- Alert evaluation: 0.5-1 second (10-20x faster)

## What Labels to Keep vs. Remove

### Keep (Low to Medium Cardinality)

These labels are useful for Service Level Objective monitoring and have manageable cardinality:

- **service**: Number of services (usually < 100)
- **method**: HTTP methods (GET, POST, etc.) - usually < 10
- **status_code**: HTTP status codes (200, 404, 500, etc.) - usually < 10
- **route**: Normalized route patterns (e.g., `/orders/{id}`) - usually < 1000
- **deployment.environment**: dev, staging, prod - usually < 10

### Remove (High Cardinality)

These labels create exponential growth and aren't needed for Service Level Objective monitoring:

- **user_id**: Thousands to millions of unique values
- **session_id**: Millions of unique values
- **request_id**: Unique per request (infinite cardinality)
- **pod**: Changes with every deployment
- **instance**: Changes with scaling
- **container**: Usually constant or low value
- **build_id / git_sha**: Changes frequently, not useful for metrics
- **ip_address**: High cardinality, use in logs/traces instead

### Normalize (Reduce Cardinality)

These labels have high cardinality but can be normalized:

- **path**: `/orders/12345` → `/orders/{id}`
- **user_agent**: `Mozilla/5.0...` → `browser` or `mobile`
- **country_code**: Keep if needed, but consider aggregation

## Service Level Objective-Level Metrics

The goal of shaping is to preserve **Service Level Objective-level metrics** while removing noise.

### Service Level Objective Metrics

**Availability**:
```
availability = (total_requests - error_requests) / total_requests
```
- Needs: `service`, `status_code`
- Doesn't need: `user_id`, `pod`, `path` (can aggregate)

**Latency**:
```
p95_latency = percentile(http_request_duration, 0.95)
```
- Needs: `service`, `method` (optional)
- Doesn't need: `user_id`, `pod`, `path` (can aggregate)

**Error Rate**:
```
error_rate = error_requests / total_requests
```
- Needs: `service`, `status_code`
- Doesn't need: `user_id`, `pod`, `path` (can aggregate)

**Saturation**:
```
queue_saturation = queue_depth / queue_capacity
```
- Needs: `service`
- Doesn't need: `user_id`, `pod` (can aggregate)

### What We Lose vs. What We Gain

**What we lose** (by removing high-cardinality labels):
- Per-user metrics (but use traces/logs for this)
- Per-pod metrics (but use Kubernetes metrics for this)
- Per-path detail (but normalized paths still provide route-level metrics)

**What we gain**:
- 95% reduction in storage cost
- 10-100x faster queries
- 20-30x faster dashboard loading
- Effective alerting
- Clean, actionable dashboards
- Service Level Objective-level monitoring

## Best Practices

### 1. Start with SLO Requirements

Before collecting metrics, define:
- What SLOs do you need to monitor?
- What labels are required for those SLOs?
- What labels can be aggregated?

### 2. Shape at the Source

Use OpenTelemetry Collector to shape metrics before they reach Elastic:
- More efficient than filtering in Elastic
- Reduces network traffic
- Reduces storage from the start

### 3. Use Traces for Detailed Analysis

Keep high-cardinality data in traces, not metrics:
- Traces are sampled (lower volume)
- Traces are queried on-demand (not continuously)
- Traces provide detailed context when needed

### 4. Monitor Cardinality

Track the number of time series:
- Set alerts on cardinality growth
- Review labels regularly
- Remove unused labels

### 5. Normalize Early

Normalize high-cardinality values in the collector:
- Path patterns: `/orders/{id}` instead of `/orders/12345`
- User agents: `browser` instead of full user agent string
- IP addresses: Country/region instead of individual IPs

## Summary

| Aspect | Firehose Mode | Shaped Mode | Improvement |
|--------|---------------|-------------|-------------|
| **Time Series** | 10,000+ | 100-500 | 95% reduction |
| **Storage** | ~650 GB/month | ~3.2 GB/month | 99.5% reduction |
| **Query Time** | 30-60 seconds | 0.5-1 second | 30-60x faster |
| **Dashboard Load** | 60+ seconds | 2-3 seconds | 20-30x faster |
| **Alert Evaluation** | 10-20 seconds | 0.5-1 second | 10-20x faster |
| **Service Level Objective Metrics** | Buried in noise | Clear and actionable | ✅ |

**Key Takeaway**: Shaping metrics reduces cost and improves performance while preserving the Service Level Objective-level metrics needed for effective monitoring and alerting.
