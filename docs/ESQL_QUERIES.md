# ESQL Queries for Elastic Metrics Demo

Use these ESQL queries in Kibana to find and analyze metrics from the demo.

## Basic Queries

### Find All Recent Metrics (Last Hour)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
| LIMIT 100
```

### Count Metrics by Service
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
| STATS metric_count = count() BY service.name
| SORT metric_count DESC
| LIMIT 20
```

### Find Metrics by Service Name
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
| LIMIT 100
```

### Count Metrics by Service (Alternative using resource.attributes)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
| STATS metric_count = count() BY resource.attributes.service.name
| SORT metric_count DESC
| LIMIT 20
```

### Metrics Over Time (Last 15 Minutes)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS count() BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

## Request Rate Metrics

### Request Rate Over Time by Service
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
| STATS avg_requests = avg(metrics.http.server.active_requests) 
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

### Error Rate by Service
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
  AND (attributes.http.response.status_code LIKE "4*" 
       OR attributes.http.response.status_code LIKE "5*"
       OR attributes.status_code LIKE "4*"
       OR attributes.status_code LIKE "5*")
| STATS error_count = count() 
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

## Latency Metrics

### Request Duration (P95, P99)
**Note:** Histogram metrics like `http_request_duration_seconds` are exported as multiple time series (count, sum, buckets) in OpenTelemetry. 
If duration metrics are not available, you can use request rate and error rate as latency indicators.

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.http_request_total IS NOT NULL
| STATS 
    request_count = sum(metrics.http_request_total)
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Alternative:** If histogram metrics are exported, they may appear as separate fields like:
- `metrics.http_request_duration_seconds_count`
- `metrics.http_request_duration_seconds_sum`
- `metrics.http_request_duration_seconds_bucket`

Check your actual metric field names using:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
| LIMIT 1
```

## Cardinality Analysis

### Count Time Series by Label Combination
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS time_series_count = count() 
  BY service.name, 
     attributes.http.request.method, 
     attributes.http.response.status_code, 
     attributes.path
| SORT time_series_count DESC
| LIMIT 50
```

### Check for High-Cardinality Labels (Firehose Mode)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND attributes.user_id IS NOT NULL
| STATS time_series_count = count() 
  BY service.name, attributes.user_id, attributes.path
| SORT time_series_count DESC
| LIMIT 50
```

### Count Unique Time Series (Cardinality Check)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS total_metrics = count() 
  BY service.name, 
     attributes.http.request.method,
     attributes.http.response.status_code,
     attributes.path,
     attributes.user_id
| STATS unique_series = count() 
  BY service.name
```

## Service Health Metrics

### CPU Utilization by Service
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.process.cpu.utilization IS NOT NULL
| STATS avg_cpu = avg(metrics.process.cpu.utilization) 
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

### Memory Usage by Service
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
  AND metrics.process.memory.usage IS NOT NULL
| STATS avg_memory = avg(metrics.process.memory.usage) 
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

## Path Normalization Check

### Check if Paths are Normalized (Shaped Mode)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h 
  AND service.name IN ("frontend", "api", "worker")
  AND attributes.path IS NOT NULL
| STATS path_count = count() BY attributes.path
| SORT path_count DESC
| LIMIT 20
```

This should show `/orders/{id}` instead of `/orders/12345` in shaped mode.

## Recent Metrics Summary

### All Metrics Summary (Last Hour)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS 
    total_metrics = count(),
    unique_services = count_distinct(service.name)
  BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

### Metrics by Deployment (Kubernetes)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
| STATS deployment_count = count() 
  BY resource.attributes.k8s.deployment.name
| SORT deployment_count DESC
| LIMIT 20
```

## Troubleshooting: Check if Metrics are Arriving

### Check All Data Streams
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
| STATS count() BY data_stream.dataset, time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

### Check for Demo Services
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND (service.name == "frontend" 
       OR service.name == "api" 
       OR service.name == "worker"
       OR resource.attributes.service.name == "frontend"
       OR resource.attributes.service.name == "api"
       OR resource.attributes.service.name == "worker")
| LIMIT 10
```

### List All Available Metric Names
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| STATS metric_count = count() BY _metric_names_hash
| SORT metric_count DESC
| LIMIT 50
```

## HTTP Request Metrics

### HTTP Request Count by Method and Status
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
  AND attributes.http.request.method IS NOT NULL
| STATS request_count = count()
  BY service.name,
     attributes.http.request.method,
     attributes.http.response.status_code,
     time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC, request_count DESC
```

### HTTP Request Rate (Requests per Minute)
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
  AND attributes.http.request.method IS NOT NULL
| STATS requests = count()
  BY service.name, time_bucket = bucket(@timestamp, 1m)
| STATS total_requests = sum(requests),
        avg_per_minute = avg(requests)
  BY service.name
```

## Compare Firehose vs Shaped Mode

### Check Label Cardinality
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name IN ("frontend", "api", "worker")
| EVAL mode = CASE(attributes.user_id IS NOT NULL, "firehose", "shaped")
| STATS series_count = count()
  BY service.name, mode
| SORT series_count DESC
```

## Quick Health Check

### Service Health Overview
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

If `services_seen` is 3, all services are sending metrics!
