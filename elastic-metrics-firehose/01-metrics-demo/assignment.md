---
slug: metrics-demo
id: cict03kvx3k8
type: challenge
title: Elastic Metrics Firehose to Shaped Demo
teaser: Demonstrate how OpenTelemetry Collector metric shaping reduces time series
  cardinality and cost by 90-98%
notes:
- type: text
  contents: |+
    <style>
      body { font-size: 14px; line-height: 1.6; }
      h1 { font-size: 24px; }
      h2 { font-size: 20px; }
      h3 { font-size: 18px; }
      p, li { font-size: 14px; }
      code { font-size: 13px; }
      pre { font-size: 12px; }
    </style>

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
    - **Shaped**: ~100-200 time series (90-98% reduction)

tabs:
- id: qnfrbfyzkv3k
  title: Terminal
  type: terminal
  hostname: metrics-demo
- id: fide47ctx7wz
  title: Kibana
  type: service
  hostname: metrics-demo
  path: /
  port: 5601
- id: 3mutjcadrdy3
  title: Frontend
  type: service
  hostname: metrics-demo
  path: /
  port: 3000
difficulty: ""
timelimit: 3600
enhanced_loading: true
---
## Tasks

### 1. Verify the Setup

The setup script has already:
- ✅ Installed required tools (Docker, kubectl, kind)
- ✅ Started local Elasticsearch and Kibana
- ✅ Created a kind Kubernetes cluster
- ✅ Built and deployed the demo services

**View Setup Logs (Optional):**
If you want to see what happened during setup, you can view the logs:
```bash
# Quick view (shows last 50 lines):
view-setup-logs

# Or view the full log:
cat /tmp/setup.log

# Or follow the logs in real-time (if setup is still running):
tail -f /tmp/setup.log
```

Verify everything is running:

```bash
kubectl get pods -n elastic-metrics-demo
```

### 2. Access the Services

**Frontend Service:**
```bash
kubectl port-forward -n elastic-metrics-demo svc/frontend 3000:3000
```
Keep this command running in the background (or in a separate terminal). Once the port-forward is active, you can access the frontend using the **Frontend** tab above, or open http://localhost:3000 in your browser.

**Kibana:**
- Use the **Kibana** tab above, or open http://localhost:5601
- The local Elastic stack is already running

### 3. Explore Metrics in Kibana

1. Go to **Discover** in Kibana
2. Select the `metrics-generic.otel-default` data view
3. Set time range to "Last 15 minutes"
4. You should see metrics flowing in

### 4. Import Dashboards

1. In Kibana, go to **Stack Management** > **Saved Objects** > **Import**
2. Upload the file: `/opt/metrics-demo/kibana/metrics-demo.ndjson`
3. Click **Import**
4. Go to **Dashboard** to view the three dashboards:
   - Cardinality & Cost Pressure
   - Before vs After (Firehose vs Shaped)
   - Golden Signals Overview

### 5. Observe Firehose Mode

Currently, the demo is in **Firehose mode** with high-cardinality labels.

In Kibana, run this ES|QL query to see unique series:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

### 6. Switch to Shaped Mode

Switch to shaped mode to see the reduction:

```bash
cd /opt/metrics-demo
./scripts/switch-mode.sh shaped
```

Wait 2-3 minutes for the collector to restart and metrics to flow.

### 7. Compare Results

After switching to shaped mode, run the same query but look for metrics WITHOUT `user_id`:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NULL
| STATS count()
  BY attributes.path
| STATS shaped_series = count()
```

Notice the dramatic reduction in unique series!

### 8. View the Reduction Dashboard

Open the **"Before vs After (Firehose vs Shaped)"** dashboard to see:
- Series count comparison
- Reduction percentage (typically 90-98%)
- Request count preserved (showing SLO metrics are maintained)

## Key Takeaways

1. **High-cardinality labels** (like `user_id`, `pod`) create thousands of time series
2. **Metric shaping** removes unnecessary labels while preserving SLO metrics
3. **Cost reduction** of 90-98% is achievable without losing observability
4. **Golden Signals** (latency, error rate, request rate, saturation) are preserved

## Troubleshooting

If metrics aren't appearing:
1. Check pod status: `kubectl get pods -n elastic-metrics-demo`
2. Check OTel Collector logs: `kubectl logs -n elastic-metrics-demo -l app=otel-collector`
3. Verify Elasticsearch is running: `curl http://localhost:9200`
4. Wait 2-3 minutes after deployment for metrics to start flowing

## Next Steps

- Explore the ES|QL queries in the dashboards
- Try switching back to firehose mode: `./scripts/switch-mode.sh firehose`
- Experiment with different time ranges
- Review the documentation in `/opt/metrics-demo/docs/`