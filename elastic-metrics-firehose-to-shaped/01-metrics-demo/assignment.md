---
slug: metrics-demo
id: metrics-demo-challenge
type: challenge
title: Elastic Metrics Firehose to Shaped Demo
teaser: Demonstrate how OpenTelemetry Collector metric shaping reduces time series cardinality and cost by 90-98%
notes:
- type: text
  contents: |
    # Elastic Metrics Firehose to Shaped Demo
    
    This demo showcases how OpenTelemetry Collector metric shaping reduces time series cardinality and cost while preserving Service Level Objective-level metrics.
    
    ## Overview
    
    The demo demonstrates two modes of metric collection:
    
    1. **Firehose Mode**: High-cardinality Prometheus-style metrics with wasteful labels (pod, instance, container, user_id, path)
    2. **Shaped Mode**: OpenTelemetry Collector processors remove/normalize labels and pre-aggregate into human-meaningful metrics
    
    ## Architecture
    
    ```
    ┌─────────────┐
    │  Load Gen   │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐     ┌─────────┐     ┌─────────┐
    │  Frontend   │────▶│   API   │────▶│  Worker │
    └──────┬──────┘     └────┬────┘     └────┬────┘
           │                 │                │
           └─────────────────┴────────────────┘
                             │
                             ▼
                  ┌──────────────────┐
                  │ OTel Collector   │
                  │ (Firehose/Shaped)│
                  └─────────┬────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Elastic Serverless│
                  │    (OTLP/HTTP)    │
                  └──────────────────┘
    ```
    
    ## Expected Results
    
    - **Firehose**: ~10,000+ time series (with high-cardinality labels)
    - **Shaped**: ~100-500 time series (after shaping)
    - **Reduction**: 90-98% reduction in time series
    
tabs:
- id: metrics-demo-terminal
  title: Terminal
  type: terminal
  hostname: metrics-demo
  path: /opt/metrics-demo
- id: metrics-demo-kibana
  title: Kibana
  type: service
  hostname: metrics-demo
  path: /
  port: 5601
difficulty: intermediate
timelimit: 3600
enhanced_loading: null
---
# Elastic Metrics Firehose to Shaped Demo

## Objective

Demonstrate how OpenTelemetry Collector metric shaping reduces time series cardinality by 90-98% while preserving Service Level Objective-level metrics.

## Prerequisites

The demo environment is already set up. You have:
- A Kubernetes cluster (kind) running
- All services deployed
- OTel Collector configured
- Load generator running

## Steps

### 1. Verify the Demo is Running

```bash
kubectl get pods -n elastic-metrics-demo
```

You should see:
- frontend, api, worker services running
- otel-collector running
- loadgen running

### 2. Check Current Mode

```bash
kubectl get configmap -n elastic-metrics-demo demo-config -o jsonpath='{.data.DEMO_MODE}'
```

### 3. View the Demo UI

The frontend service has a demo page. Port-forward to access it:

```bash
kubectl port-forward -n elastic-metrics-demo svc/frontend 8080:8080
```

Then visit: http://localhost:8080/demo

### 4. Switch Between Modes

```bash
# Switch to firehose mode
./scripts/switch-mode.sh firehose

# Wait 10-15 minutes for data to accumulate

# Switch to shaped mode
./scripts/switch-mode.sh shaped

# Wait 10-15 minutes for data to accumulate
```

### 5. Query Metrics in Kibana

Use ES|QL queries to compare time series counts:

**Firehose Mode - Count Unique Series:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

**Shaped Mode - Count Unique Series:**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NULL
| STATS count()
  BY attributes.path
| STATS shaped_series = count()
```

**Compare Both:**
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
| STATS 
    firehose_series = max(CASE(mode == "firehose", series_count, null)),
    shaped_series = max(CASE(mode == "shaped", series_count, null))
| EVAL 
    firehose_time_series = firehose_series,
    shaped_time_series = shaped_series,
    series_reduced = firehose_series - shaped_series,
    reduction_pct = ROUND(((firehose_series - shaped_series) / firehose_series) * 100, 2)
```

## Expected Results

- **Firehose Mode**: 1,000-10,000+ unique time series
- **Shaped Mode**: 50-500 unique time series
- **Reduction**: 90-98% reduction in time series

## Documentation

See the `/opt/metrics-demo/docs/` directory for:
- `DEMO_GUIDE.md` - Talk track and presentation flow
- `ESQL_QUERIES.md` - Example ES|QL queries
- `ELASTIC_DASHBOARD_BUILD.md` - How to build dashboards
- `SAVINGS_QUERY.md` - Query for calculating savings

## Troubleshooting

If services aren't running:
```bash
./scripts/sanity-check.sh
```

To check logs:
```bash
kubectl logs -n elastic-metrics-demo -l app=otel-collector --tail=50
kubectl logs -n elastic-metrics-demo -l app=frontend --tail=50
```
