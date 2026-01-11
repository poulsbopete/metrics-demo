# Demo Guide: Elastic Metrics Firehose to Signal

This guide provides a talk track for presenting the Elastic Metrics Firehose to Signal demo. The demo is structured in four acts, each demonstrating a key concept about metric cardinality and cost optimization.

## Prerequisites

Before starting the demo, ensure:
- All services are deployed and running
- Load generator is producing traffic
- Elastic Serverless endpoint is configured and receiving metrics
- Kibana is accessible for visualization

## Act 1: The Firehose Problem (5 minutes)

### Setup
- Start in **firehose mode**: `./scripts/switch-mode.sh firehose`
- Show the frontend demo UI: `kubectl port-forward -n elastic-metrics-demo svc/frontend 8080:8080`
- Visit http://localhost:8080/demo

### Talk Track

**"Let's start by looking at what happens when we collect metrics without any shaping."**

1. **Show the Demo UI**
   - Point out the "Current Mode: FIREHOSE" indicator
   - Explain that in firehose mode, we're collecting all metrics with all labels
   - Show the list of labels being emitted

2. **Explain High-Cardinality Labels**
   - `user_id`: Random user IDs create thousands of unique time series
   - `path`: Full paths like `/orders/12345` instead of normalized `/orders/{id}`
   - `pod`, `instance`, `container`: Kubernetes metadata that changes with every deployment
   - `build_id`: Git SHA or build number that changes frequently

3. **Show Elastic/Kibana**
   - Navigate to Discover or Metrics Explorer
   - Search for: `metricset.name: "otel" AND service.name: "frontend"`
   - Show the high number of unique time series
   - Point out the cardinality explosion:
     ```
     If we have:
     - 3 services
     - 2 pods each
     - 1000 unique user_ids
     - 50 unique paths
     - 10 HTTP methods
     - 5 status codes
     
     That's: 3 × 2 × 1000 × 50 × 10 × 5 = 15,000,000 potential time series!
     ```

4. **Demonstrate the Problem**
   - Show a dashboard with noisy metrics
   - Point out how difficult it is to see meaningful patterns
   - Explain the cost implications:
     - Each time series consumes storage
     - Queries become slower
     - Dashboards become unusable

### Key Message
**"This is what happens when you collect metrics without thinking about cardinality. Every unique combination of labels creates a new time series, and the cost grows exponentially."**

---

## Act 2: Understanding the Collector Configuration (5 minutes)

### Setup
- Open the collector configuration files
- Show both `collector-firehose.yaml` and `collector-shaped.yaml`

### Talk Track

**"Now let's look at how we can fix this using OpenTelemetry Collector processors."**

1. **Show Firehose Config** (`otel/collector-firehose.yaml`)
   - Point out minimal processing
   - Show `k8sattributes` processor adding Kubernetes metadata
   - Explain that it passes everything through unchanged

2. **Show Shaped Config** (`otel/collector-shaped.yaml`)
   - **attributes/delete processor**: Removes wasteful labels
     ```yaml
     - key: user_id
       action: delete
     - key: pod
       action: delete
     ```
   - **transform/path_normalize processor**: Normalizes paths
     ```yaml
     - set(attributes["path"], replace_pattern(attributes["path"], "^/orders/\\d+", "/orders/{id}"))
     ```
   - **k8sattributes processor**: Adds useful metadata (but pod/container already removed)

3. **Explain the Strategy**
   - **Delete**: Remove labels that don't add value for SLO monitoring
   - **Normalize**: Replace high-cardinality values with patterns
   - **Keep**: Preserve labels needed for meaningful aggregation (service, method, status_code)

4. **Show the Result**
   - Firehose: ~10,000+ time series
   - Shaped: ~100-500 time series
   - **95% reduction in cardinality**

### Key Message
**"By using OpenTelemetry Collector processors, we can shape metrics before they reach Elastic, reducing cardinality while preserving the signal we need for SLO monitoring."**

---

## Act 3: The Transformation (5 minutes)

### Setup
- Switch to shaped mode: `./scripts/switch-mode.sh shaped`
- Wait for services to restart
- Refresh Kibana

### Talk Track

**"Let's see what happens when we apply shaping."**

1. **Switch Modes**
   - Run: `./scripts/switch-mode.sh shaped`
   - Explain what's happening:
     - Collector config is updated
     - Services restart with new DEMO_MODE
     - New metrics start flowing with reduced labels

2. **Show the Difference in Kibana**
   - Navigate to Metrics Explorer
   - Search for the same metrics
   - Show the dramatic reduction in time series
   - Point out:
     - Same metric names
     - Same core labels (service, method, status_code)
     - Missing high-cardinality labels (user_id, pod, etc.)

3. **Show Normalized Paths**
   - Search for: `metricset.name: "otel" AND attributes.path: "/orders/{id}"`
   - Show that paths are normalized
   - Explain: `/orders/12345`, `/orders/67890` → `/orders/{id}`

4. **Demonstrate Clean Dashboards**
   - Show a dashboard with clean, aggregated metrics
   - Point out:
     - Request rate per service
     - Error rate per service
     - Latency percentiles
   - Explain how these are now usable for SLO monitoring

### Key Message
**"With shaping, we've reduced cardinality by 95% while preserving all the metrics we need for SLO monitoring. Our dashboards are now clean and actionable."**

---

## Act 4: SLO-Level Signal and Alerting (5 minutes)

### Setup
- Show SLO-focused dashboards
- Demonstrate alerting scenarios

### Talk Track

**"Now that we have clean metrics, let's see how they support SLO monitoring and alerting."**

1. **SLO Metrics**
   - **Availability**: `(total_requests - error_requests) / total_requests`
   - **Latency**: p95, p99 percentiles from histograms
   - **Error Rate**: `error_requests / total_requests`
   - **Saturation**: Queue depth, CPU utilization

2. **Show SLO Dashboard**
   - Create or show a dashboard with:
     - Request rate (requests/second)
     - Error rate (percentage)
     - Latency p95 (seconds)
     - Availability (percentage)
   - Explain that these metrics are now:
     - Low cardinality (aggregated by service, not by user)
     - Fast to query
     - Suitable for alerting

3. **Demonstrate Alerting**
   - Show an alert rule:
     ```
     WHEN error_rate > 0.01 (1%)
     FOR 5 minutes
     THEN alert
     ```
   - Explain that with shaped metrics:
     - Alerts are based on service-level aggregates
     - No false positives from individual user errors
     - Fast evaluation (low cardinality)

4. **Compare to Firehose**
   - In firehose mode: Alerting on 10,000+ time series is slow and noisy
   - In shaped mode: Alerting on 100-500 time series is fast and accurate

5. **Cost Implications**
   - **Storage**: 95% reduction in time series = 95% reduction in storage
   - **Query Performance**: Queries are 10-100x faster
   - **Alerting**: Alert evaluation is much faster
   - **Dashboards**: Load faster, more responsive

### Key Message
**"Shaped metrics give us the SLO-level signal we need for monitoring and alerting, while dramatically reducing cost and improving performance."**

---

## Closing (2 minutes)

### Summary Points

1. **The Problem**: High-cardinality labels create exponential time series growth
2. **The Solution**: OpenTelemetry Collector processors shape metrics before export
3. **The Result**: 95% reduction in cardinality while preserving SLO signal
4. **The Benefit**: Lower cost, faster queries, better dashboards, effective alerting

### Next Steps

- Review the collector configurations
- Experiment with different shaping strategies
- Build SLO dashboards in Kibana
- Set up alerting rules

### Resources

- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Elastic Metrics Documentation](https://www.elastic.co/guide/en/observability/current/metrics.html)
- [Cost and Cardinality Guide](COST_AND_CARDINALITY.md)

---

## Tips for Presenters

1. **Timing**: Keep each act to 5 minutes. Practice the transitions.
2. **Visuals**: Use Kibana screenshots or live demos. Show before/after comparisons.
3. **Interactivity**: Let the audience toggle between modes if possible.
4. **Questions**: Be prepared to explain:
   - Why not just filter in Elastic? (Answer: Shaping at the source is more efficient)
   - What if we need user_id later? (Answer: Keep it in traces, not metrics)
   - How do we know what to remove? (Answer: Start with SLO requirements)

## Troubleshooting

If something goes wrong during the demo:
- Check service status: `kubectl get pods -n elastic-metrics-demo`
- Check collector logs: `kubectl logs -n elastic-metrics-demo deployment/otel-collector`
- Verify Elastic connection: Check collector logs for export errors
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more help
