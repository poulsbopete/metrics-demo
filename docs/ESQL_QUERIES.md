# ESQL Queries for Elastic Metrics Demo

Use these ESQL queries in Kibana to find and analyze metrics from the demo.

## Basic Queries

### Find All OTel Metrics
```esql
FROM metrics-*
| WHERE metricset.name == "otel"
| STATS count() BY metricset.name, service.name
| SORT count() DESC
```

### Find Metrics by Service
```esql
FROM metrics-*
| WHERE metricset.name == "otel" AND service.name IN ("frontend", "api", "worker")
| STATS count() BY service.name, metricset.name
| SORT service.name, count() DESC
```

### Find HTTP Request Metrics
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND metricset.name LIKE "*http*"
| STATS count() BY service.name, metricset.name
| SORT count() DESC
```

### Find High-Cardinality Labels (Firehose Mode)
```esql
FROM metrics-*
| WHERE metricset.name == "otel"
| STATS count() BY service.name, attributes.user_id, attributes.path
| SORT count() DESC
| LIMIT 100
```

### Count Unique Time Series (Cardinality Check)
```esql
FROM metrics-*
| WHERE metricset.name == "otel"
| STATS count() BY service.name, metricset.name, attributes.*
| STATS count_distinct = count() BY service.name
```

## Request Rate Metrics

### Request Rate Over Time
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND metricset.name LIKE "*request*"
| STATS avg(metric.value) AS avg_value, count() AS count BY service.name, bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

### Error Rate by Service
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND (metricset.name LIKE "*error*" OR attributes.status_code LIKE "5*" OR attributes.status_code LIKE "4*")
| STATS count() AS error_count BY service.name, bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

## Latency Metrics

### Request Duration (P95, P99)
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND metricset.name LIKE "*duration*"
| STATS 
    avg(metric.value) AS avg_latency,
    percentile(metric.value, 95) AS p95,
    percentile(metric.value, 99) AS p99
  BY service.name, bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

## Cardinality Analysis

### Count Time Series by Label Combination
```esql
FROM metrics-*
| WHERE metricset.name == "otel"
| STATS count() AS time_series_count 
  BY service.name, 
     attributes.method, 
     attributes.status_code, 
     attributes.path,
     attributes.user_id
| SORT time_series_count DESC
| LIMIT 50
```

### Compare Firehose vs Shaped Mode
```esql
FROM metrics-*
| WHERE metricset.name == "otel"
| STATS count_distinct = count() AS unique_series 
  BY service.name, 
     CASE 
       WHEN attributes.user_id IS NOT NULL THEN "firehose"
       ELSE "shaped"
     END AS mode
```

## Service Health Metrics

### CPU Work Units
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND metricset.name LIKE "*cpu*work*"
| STATS sum(metric.value) AS total_work_units BY service.name, bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

### Queue Depth
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND metricset.name LIKE "*queue*"
| STATS avg(metric.value) AS avg_queue_depth, max(metric.value) AS max_queue_depth 
  BY service.name, bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

## Path Normalization Check

### Check if Paths are Normalized
```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND attributes.path IS NOT NULL
| STATS count() AS count BY attributes.path
| SORT count DESC
| LIMIT 20
```

This should show `/orders/{id}` instead of `/orders/12345` in shaped mode.

## Recent Metrics (Last 5 Minutes)

```esql
FROM metrics-*
| WHERE metricset.name == "otel" 
  AND @timestamp >= NOW() - 5m
| STATS count() AS metric_count 
  BY service.name, 
     metricset.name, 
     bucket(@timestamp, 30s)
| SORT @timestamp DESC
```

## All Metrics Summary

```esql
FROM metrics-*
| WHERE metricset.name == "otel"
| STATS 
    count() AS total_metrics,
    count_distinct(service.name) AS unique_services,
    count_distinct(metricset.name) AS unique_metric_names
  BY bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

## Troubleshooting: Check if Metrics are Arriving

```esql
FROM metrics-*
| WHERE @timestamp >= NOW() - 15m
| STATS count() AS doc_count BY data_stream.dataset, bucket(@timestamp, 1m)
| SORT @timestamp DESC
```

If you see `metrics-demo` or `otel` in the dataset, metrics are arriving!
