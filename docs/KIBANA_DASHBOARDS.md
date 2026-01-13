# Kibana Dashboards Import Guide

This guide explains how to import the pre-built Kibana dashboards for the metrics-demo.

## Dashboard Overview

The `kibana/metrics-demo.ndjson` file contains three dashboards:

1. **Cardinality & Cost Pressure**
   - Shows unique label combinations (cardinality proxy)
   - Top paths in firehose mode
   - Top user IDs (high cardinality)
   - Top paths in shaped mode
   - Label value distribution

2. **Before vs After (Firehose vs Shaped)**
   - Path cardinality comparison over time
   - Label presence comparison (firehose vs shaped)
   - Firehose and Shaped unique series counts
   - Reduction percentage panel
   - Request count comparison

3. **Golden Signals Overview**
   - Request Rate (req/sec)
   - Error Rate (%)
   - P95 Latency (ms)
   - Saturation (Queue Depth)

## Import Methods

### Method 1: Kibana UI (Recommended)

1. **Access Kibana:**
   - For Elastic Cloud: Log into your deployment and click "Kibana"
   - For self-managed: Navigate to your Kibana URL (typically `http://localhost:5601`)

2. **Navigate to Saved Objects:**
   - Click the hamburger menu (☰) in the top left
   - Go to **Stack Management** > **Saved Objects**

3. **Import the Dashboards:**
   - Click the **Import** button (top right)
   - Click **Select file** or drag and drop `kibana/metrics-demo.ndjson`
   - Review the objects to be imported (should show 3 dashboards)
   - Click **Import** (or **Import 3 objects**)

4. **Access the Dashboards:**
   - Go to **Dashboard** in the main menu
   - You should see the three dashboards listed:
     - Cardinality & Cost Pressure
     - Before vs After (Firehose vs Shaped)
     - Golden Signals Overview

### Method 2: Kibana API

If you have access to the Kibana API endpoint and an API key:

```bash
# Set your Kibana endpoint and API key
export KIBANA_ENDPOINT="https://your-kibana-endpoint"
export KIBANA_API_KEY="your-api-key-here"

# Import the dashboards
curl -X POST "$KIBANA_ENDPOINT/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -H "Authorization: ApiKey $KIBANA_API_KEY" \
  --form file=@kibana/metrics-demo.ndjson
```

**For Elastic Cloud Serverless:**
```bash
# Get your Kibana endpoint from the Elastic Cloud console
# API keys can be created in: Stack Management > API Keys

curl -X POST "https://your-deployment.kb.us-east-1.aws.elastic.cloud/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -H "Authorization: ApiKey $KIBANA_API_KEY" \
  --form file=@kibana/metrics-demo.ndjson
```

### Method 3: Using Elastic Cloud Console

1. **Log into Elastic Cloud:**
   - Go to https://cloud.elastic.co
   - Select your deployment

2. **Open Kibana:**
   - Click the **Kibana** button in your deployment

3. **Import Dashboards:**
   - Follow Method 1 steps (Kibana UI)

## Verifying Import

After importing, verify the dashboards are available:

1. In Kibana, go to **Dashboard** in the main menu
2. You should see three dashboards:
   - Cardinality & Cost Pressure
   - Before vs After (Firehose vs Shaped)
   - Golden Signals Overview

## Troubleshooting

### "Index pattern not found" errors

The dashboards use the `metrics-generic.otel-default` data view. This should be automatically created when metrics are ingested. If you see errors:

1. Ensure metrics are being sent to Elastic
2. Check that the OTel Collector is running: `kubectl get pods -n elastic-metrics-demo -l app=otel-collector`
3. Verify metrics are arriving: Go to **Discover** in Kibana and select the `metrics-generic.otel-default` data view

### "No data" in dashboards

If dashboards show no data:

1. **Check time range:** Ensure the dashboard time range covers when metrics were sent
   - Default queries use `NOW() - 15m` or `NOW() - 30m`
   - Adjust the time picker in Kibana to cover your data

2. **Verify service names:** The dashboards filter for `service.name == "frontend"` (and others)
   - Check that your services are emitting metrics with the correct service names
   - Verify in Discover: `service.name: frontend`

3. **Check mode:** Some dashboards filter by mode (firehose vs shaped)
   - Firehose mode: `attributes.user_id IS NOT NULL`
   - Shaped mode: `attributes.user_id IS NULL`
   - Ensure you have data in the mode you're viewing

### Updating Dashboard Queries

If you need to adjust time ranges or filters:

1. Open the dashboard in Kibana
2. Click **Edit** (pencil icon)
3. Click on a visualization panel
4. Click **Edit visualization** (pencil icon in panel)
5. Modify the ES|QL query as needed
6. Click **Update** and **Save**

## Dashboard Details

### Cardinality & Cost Pressure

**Purpose:** Shows the impact of high-cardinality labels on time series count.

**Key Visualizations:**
- Unique label combinations count
- Top paths with high cardinality
- Top user IDs creating cardinality
- Comparison of firehose vs shaped paths

**Use Case:** Demonstrates why shaping is needed - shows how many unique series are created by high-cardinality labels.

### Before vs After (Firehose vs Shaped)

**Purpose:** Side-by-side comparison showing the reduction in time series.

**Key Visualizations:**
- Path cardinality over time (before/after)
- Label presence comparison
- Series count comparison
- Reduction percentage calculation

**Use Case:** Shows the measurable impact of metric shaping - typically 90-98% reduction.

### Golden Signals Overview

**Purpose:** Monitor the four golden signals for SLO monitoring.

**Key Visualizations:**
- Request Rate: Requests per second over time
- Error Rate: Percentage of errors over time
- P95 Latency: 95th percentile latency (proxy via request count)
- Saturation: Queue depth over time

**Use Case:** Shows that shaping preserves the metrics needed for SLO monitoring while reducing cardinality.

## Next Steps

After importing the dashboards:

1. **Switch between modes** to see the difference:
   ```bash
   ./scripts/switch-mode.sh firehose  # Wait 10-15 minutes
   ./scripts/switch-mode.sh shaped    # Wait 10-15 minutes
   ```

2. **View the dashboards** to see the impact:
   - Open "Before vs After" dashboard
   - Compare firehose vs shaped series counts
   - Check the reduction percentage

3. **Customize as needed:**
   - Edit visualizations to adjust time ranges
   - Add filters for specific services
   - Create additional panels for your use case
