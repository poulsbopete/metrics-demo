# Elastic Alert Rules for Metrics Demo

This document defines three alert examples that demonstrate how shaping improves alert quality.

**Note:** For automated Service Level Objective and alert creation, see `docs/ELASTIC_WORKFLOW_SETUP.md` which provides an Elastic Workflow to automatically create Service Level Objectives and alerts.

---

## Alert 1: High Error Rate

**Purpose:** Alert when error rate exceeds threshold, proving metrics preservation.

---

### Alert Configuration

**Name:** `High Error Rate - Demo Services`

**Rule Type:** Threshold

**Index/Data View:** `metrics-*` or `metrics-generic.otel-default`

**Query (KQL):**
```
service.name: ("frontend" OR "api" OR "worker") 
AND (attributes.status_code: "4*" OR attributes.status_code: "5*")
AND @timestamp >= now()-5m
```

**Aggregation:**
- **Group by:** `service.name`
- **Metric:** `Count`
- **Threshold:** `> 2%` of total requests

**Time Window:** Last 5 minutes

**Frequency:** Check every 1 minute

---

### ES|QL-Based Alert (Alternative)

**Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name IN ("frontend", "api", "worker")
| STATS 
    total_requests = count(),
    errors = count() FILTER(attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*")
  BY service.name
| EVAL error_rate = (errors / total_requests) * 100
| WHERE error_rate > 2
```

**Condition:** If query returns any rows, trigger alert.

---

### Alert Actions

**Notify:**
- Email/Slack: "Error rate exceeded 2% for service: {service.name}"
- Include: Error count, total requests, error rate %

**Example Message:**
```
Alert: High Error Rate
Service: frontend
Error Rate: 5.2%
Errors: 52
Total Requests: 1000
Time Window: Last 5 minutes
```

---

### Recommended Thresholds

| Service Type | Error Rate Threshold | Rationale |
|--------------|---------------------|-----------|
| Critical API | 1% | Very low tolerance |
| Standard API | 2% | Typical Service Level Objective target |
| Background Worker | 5% | Higher tolerance for async jobs |

**Adjust based on:** Service criticality, Service Level Objective targets, historical baselines.

---

### How Shaping Improves This Alert

**Before (Firehose):**
- Alert may fire on pod restarts (new time series)
- High cardinality = slower query evaluation
- False positives from transient pod churn

**After (Shaped):**
- Alert fires only on actual error rate increases
- Faster evaluation (fewer time series)
- More reliable (no pod name in labels)

**Talk Point:** "With shaped metrics, this alert fires on real problems, not infrastructure churn."

---

## Alert 2: Latency Service Level Objective Burn

**Purpose:** Alert when latency exceeds Service Level Objective threshold or burn rate.

---

### Alert Configuration

**Name:** `Latency P95 Service Level Objective Violation`

**Rule Type:** Threshold

**Index/Data View:** `metrics-*`

**Query (KQL):**
```
service.name: ("frontend" OR "api" OR "worker")
AND metrics.http_request_duration_seconds_p95: *
AND @timestamp >= now()-5m
```

**Aggregation:**
- **Group by:** `service.name`
- **Metric:** `Average` of `metrics.http_request_duration_seconds_p95`
- **Threshold:** `> 500ms` (0.5 seconds)

**Time Window:** Last 5 minutes

**Frequency:** Check every 1 minute

---

### ES|QL-Based Alert (Alternative)

**Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.http_request_duration_seconds_sum IS NOT NULL
| STATS 
    p95_latency = percentile(metrics.http_request_duration_seconds_sum, 95)
  BY service.name
| EVAL p95_ms = p95_latency * 1000
| WHERE p95_ms > 500
```

**Condition:** If query returns any rows, trigger alert.

---

### Burn Rate Alert (Advanced)

**Purpose:** Alert when error budget is burning too fast.

**Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.http_request_duration_seconds_sum IS NOT NULL
| STATS 
    p95_latency = percentile(metrics.http_request_duration_seconds_sum, 95),
    request_count = count()
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| EVAL p95_ms = p95_latency * 1000
| EVAL service_level_objective_violations = request_count FILTER(p95_ms > 500)
| STATS 
    total_requests = sum(request_count),
    violations = sum(service_level_objective_violations)
  BY service.name
| EVAL burn_rate = (violations / total_requests) * 100
| WHERE burn_rate > 5
```

**Condition:** Burn rate > 5% triggers alert.

---

### Recommended Thresholds

| Service Type | P95 Latency Threshold | Rationale |
|--------------|----------------------|------------|
| User-facing API | 200ms | Fast response expected |
| Standard API | 500ms | Typical web service |
| Background Worker | 1000ms | Async processing OK |

**Adjust based on:** User expectations, Service Level Objective targets, historical p95 values.

---

### Alert Actions

**Notify:**
- Email/Slack: "P95 latency exceeded threshold for service: {service.name}"
- Include: P95 latency, threshold, request count

**Example Message:**
```
Alert: Latency Service Level Objective Violation
Service: api
P95 Latency: 750ms
Threshold: 500ms
Exceeded by: 250ms (50%)
Time Window: Last 5 minutes
```

---

### How Shaping Improves This Alert

**Before (Firehose):**
- P95 calculated per pod (high variance)
- Alert fires on individual pod issues
- Hard to see service-level trends

**After (Shaped):**
- P95 calculated at service level (aggregated)
- Alert fires on service-wide issues
- Clearer metrics (no pod noise)

**Talk Point:** "Shaped metrics give you service-level latency, not pod-level noise."

---

## Alert 3: Saturation (Queue Depth / Resource Exhaustion)

**Purpose:** Alert when system is approaching capacity limits.

---

### Alert Configuration (Queue Depth)

**Name:** `Queue Depth Saturation`

**Rule Type:** Threshold

**Index/Data View:** `metrics-*`

**Query (KQL):**
```
service.name: ("frontend" OR "api" OR "worker")
AND metrics.queue_depth: *
AND @timestamp >= now()-5m
```

**Aggregation:**
- **Group by:** `service.name`
- **Metric:** `Average` of `metrics.queue_depth`
- **Threshold:** `> 100` (adjust based on service capacity)

**Time Window:** Last 5 minutes

**Frequency:** Check every 1 minute

---

### ES|QL-Based Alert

**Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.queue_depth IS NOT NULL
| STATS avg_queue = avg(metrics.queue_depth)
  BY service.name
| WHERE avg_queue > 100
```

**Condition:** If query returns any rows, trigger alert.

---

### Alternative: CPU Work Units

**Query:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 5m
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.cpu_work_units IS NOT NULL
| STATS avg_cpu_work = avg(metrics.cpu_work_units)
  BY service.name
| WHERE avg_cpu_work > 1000
```

---

### Recommended Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Queue Depth | 100 | Service-specific (adjust) |
| CPU Work Units | 1000 | Service-specific (adjust) |
| Memory Usage | 80% | Standard threshold |

**Adjust based on:** Service capacity, historical baselines, Service Level Objective targets.

---

### Alert Actions

**Notify:**
- Email/Slack: "Saturation alert for service: {service.name}"
- Include: Current value, threshold, trend

**Example Message:**
```
Alert: Queue Depth Saturation
Service: worker
Queue Depth: 150
Threshold: 100
Exceeded by: 50 (50%)
Time Window: Last 5 minutes
Action: Consider scaling workers
```

---

### How Shaping Improves This Alert

**Before (Firehose):**
- Alert fires per pod (many alerts)
- Hard to see service-level saturation
- Alert fatigue from pod churn

**After (Shaped):**
- Alert fires at service level (one alert)
- Clear service-wide saturation metrics
- Actionable (scale service, not individual pods)

**Talk Point:** "One alert per service, not one per pod. That's the difference."

---

## Alert Quality Comparison

### Before Shaping (Firehose Mode)

| Issue | Impact |
|-------|--------|
| High cardinality | Slower alert evaluation |
| Pod churn | False positives |
| Per-pod alerts | Alert fatigue |
| Inconsistent labels | Hard to aggregate |

### After Shaping (Shaped Mode)

| Benefit | Impact |
|---------|--------|
| Low cardinality | Faster alert evaluation |
| No pod labels | Fewer false positives |
| Service-level alerts | Actionable alerts |
| Consistent labels | Easy aggregation |

---

## Creating Alerts in Kibana

### Step-by-Step: Error Rate Alert

1. Navigate to **Observability** → **Alerts** → **Create rule**
2. **Rule type:** Threshold
3. **Name:** `High Error Rate - Demo Services`
4. **Data view:** `metrics-*`
5. **Query (KQL):**
   ```
   service.name: ("frontend" OR "api" OR "worker")
   ```
6. **Time field:** `@timestamp`
7. **Aggregation:**
   - **Group by:** `service.name` (Terms)
   - **Metric:** `Count`
   - **Time window:** Last 5 minutes
8. **Threshold:**
   - **Condition:** `> 2%` of total requests
   - **Calculation:** `(errors / total) * 100`
9. **Actions:**
   - Add email/Slack notification
   - Include context: `{service.name}`, `{error_rate}%`
10. **Save rule**

---

### Step-by-Step: ES|QL-Based Alert

1. Navigate to **Observability** → **Alerts** → **Create rule**
2. **Rule type:** ES|QL query
3. **Name:** `Latency P95 Service Level Objective Violation`
4. **Query:**
   ```esql
   FROM metrics-generic.otel-default
   | WHERE @timestamp >= NOW() - 5m
     AND service.name IN ("frontend", "api", "worker")
     AND metrics.http_request_duration_seconds_sum IS NOT NULL
   | STATS 
       p95_latency = percentile(metrics.http_request_duration_seconds_sum, 95)
     BY service.name
   | EVAL p95_ms = p95_latency * 1000
   | WHERE p95_ms > 500
   ```
5. **Condition:** If query returns any rows, trigger alert
6. **Actions:** Add notification
7. **Save rule**

---

## Alert Scoping Best Practices

### By Service

**Query:**
```
service.name: frontend
```

**Use when:** Different thresholds per service.

### By Environment

**Query:**
```
deployment.environment: production
```

**Use when:** Different thresholds for prod vs staging.

### By Service + Environment

**Query:**
```
service.name: frontend AND deployment.environment: production
```

**Use when:** Production-specific alerts.

---

## Alert Testing

### Test Error Rate Alert

1. Generate errors: Visit `/demo?bomb=1` and trigger error endpoints
2. Wait 5 minutes
3. Check alert status in **Observability** → **Alerts**
4. Verify notification received

### Test Latency Alert

1. Add artificial delay to service (if possible)
2. Generate traffic
3. Wait 5 minutes
4. Check alert status

### Test Saturation Alert

1. Increase queue depth (if possible)
2. Generate traffic
3. Wait 5 minutes
4. Check alert status

---

## Monitoring Alert Health

### Check Alert Execution

**Where:** **Observability** → **Alerts** → **Rule details**

**Look for:**
- Last execution time
- Execution status (success/failure)
- Number of alerts fired

### Alert History

**Where:** **Observability** → **Alerts** → **Alert history**

**Review:**
- Alert frequency
- False positive rate
- Resolution time

---

## Recommended Alert Thresholds Summary

| Alert | Metric | Threshold | Window | Frequency |
|-------|--------|-----------|--------|-----------|
| High Error Rate | Error % | > 2% | 5 min | 1 min |
| Latency Service Level Objective | P95 latency | > 500ms | 5 min | 1 min |
| Saturation | Queue depth | > 100 | 5 min | 1 min |

**Adjust thresholds based on:**
- Service Service Level Objectives
- Historical baselines
- Business requirements

---

## Operational Impact

### Before Shaping

- **Alert volume:** High (per-pod alerts)
- **False positives:** Common (pod churn)
- **Evaluation time:** Slow (high cardinality)
- **Actionability:** Low (which pod to fix?)

### After Shaping

- **Alert volume:** Low (service-level alerts)
- **False positives:** Rare (no pod churn)
- **Evaluation time:** Fast (low cardinality)
- **Actionability:** High (fix the service)

---

**Last Updated:** 2026-01-11  
**Alert Version:** 1.0
