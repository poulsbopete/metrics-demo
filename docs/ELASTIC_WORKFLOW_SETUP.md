# Elastic Workflow Setup for Automated Service Level Objective Management

This guide explains how to set up and use the Elastic Workflow to automatically create and manage Service Level Objectives for the metrics demo.

---

## Overview

The workflow automates:
- **Service Discovery**: Finds all services from metrics data (frontend, api, worker)
- **Service Level Objective Creation**: Creates three Service Level Objectives:
  - **Availability**: 95% target (less than 5% failures)
  - **Latency**: 85% of requests under 500ms
  - **Error Rate**: 95% target (less than 5% errors)
- **Idempotent Operation**: Checks for existing Service Level Objectives before creating to prevent duplicates

---

## Prerequisites

1. **Elastic Cloud Account** with Kibana access
2. **API Key** with the following privileges:
   - `read` access to `metrics-generic.otel-default` index
   - `write` access to Service Level Objectives API
   - Access to Workflows feature
3. **Metrics Data**: Ensure the demo is running and sending metrics to Elastic

---

## Setup Instructions

### Step 1: Get Your Elastic Endpoint

1. Log into your Elastic Cloud deployment
2. Navigate to **Kibana** → **Management** → **Stack Management**
3. Copy your Kibana endpoint (e.g., `https://your-deployment.kb.us-east-1.aws.elastic.cloud`)
   - **Note**: Use the Kibana endpoint, not the OTLP ingest endpoint

### Step 2: Create an API Key

1. Navigate to **Kibana** → **Management** → **Stack Management** → **API Keys**
2. Click **Create API key**
3. Set:
   - **Name**: `metrics-demo-slo-workflow`
   - **Expiration**: Set as needed (or leave blank for no expiration)
   - **Privileges**: 
     - `read` on `metrics-generic.otel-default`
     - `write` on Service Level Objectives
     - Access to Workflows
4. Click **Create** and copy the API key

### Step 3: Import the Workflow

1. Navigate to **Kibana** → **Management** → **Stack Management** → **Workflows**
2. Click **Create workflow** → **Import workflow**
3. Upload the file: `kibana/workflow-slo-management.yaml`
4. Or copy/paste the workflow YAML from that file

### Step 4: Configure Workflow Variables

1. In the workflow editor, go to **Variables** section
2. Set the following variables:
   - **ELASTIC_ENDPOINT**: Your Kibana endpoint (e.g., `https://your-deployment.kb.us-east-1.aws.elastic.cloud`)
   - **ELASTIC_API_KEY**: Your API key from Step 2

### Step 5: Test the Workflow

1. Click **Run workflow** (manual trigger)
2. Check the console output for:
   - Service discovery results
   - Service Level Objective creation status
   - Any errors

### Step 6: Enable Scheduled Execution (Optional)

1. In the workflow editor, go to **Triggers** section
2. Enable the scheduled trigger:
   - **Frequency**: Every 24 hours (or as desired)
3. Save the workflow

---

## Workflow Details

### Service Level Objectives Created

#### 1. Metrics Demo - Availability
- **Target**: 95% availability
- **Indicator**: Count of successful requests (non-4xx/5xx) / total requests
- **Grouped by**: `service.name`
- **Time Window**: 30 days rolling

#### 2. Metrics Demo - Latency
- **Target**: 85% of requests under 500ms
- **Indicator**: Requests with duration <= 500ms / total requests
- **Grouped by**: `service.name`
- **Time Window**: 30 days rolling

#### 3. Metrics Demo - Error Rate
- **Target**: 95% success rate (less than 5% errors)
- **Indicator**: Count of successful requests (non-4xx/5xx) / total requests
- **Grouped by**: `service.name`
- **Time Window**: 30 days rolling

### Idempotent Behavior

The workflow checks for existing Service Level Objectives by name before creating:
- If "Metrics Demo - Availability" exists → Skip creation
- If "Metrics Demo - Latency" exists → Skip creation
- If "Metrics Demo - Error Rate" exists → Skip creation

This allows you to run the workflow multiple times without creating duplicates.

---

## Customization

### Adjust Service Level Objective Targets

Edit the workflow YAML and modify the `objective.target` values:

```yaml
"objective": {
  "target": 0.95  # Change to 0.99 for 99% target, etc.
}
```

### Add More Services

Modify the service discovery query to include additional services:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp > NOW() - 7d 
  AND service.name IS NOT NULL
  AND service.name IN ("frontend", "api", "worker", "new-service")
```

### Change Time Window

Modify the `timeWindow` in each Service Level Objective:

```yaml
"timeWindow": {
  "duration": "7d",  # Change to 7d, 14d, 30d, etc.
  "type": "rolling"
}
```

---

## Troubleshooting

### Workflow Fails with "401 Unauthorized"

**Issue**: API key doesn't have correct privileges.

**Solution**:
1. Verify API key has `write` access to Service Level Objectives
2. Check API key hasn't expired
3. Regenerate API key if needed

### Workflow Fails with "Index Not Found"

**Issue**: Metrics index name doesn't match.

**Solution**:
1. Check your actual index name in Kibana → Discover
2. Update the workflow queries to use the correct index pattern
3. Common patterns: `metrics-generic.otel-default`, `metrics-*`, `metrics-otel-*`

### No Services Found

**Issue**: Service discovery query returns no results.

**Solution**:
1. Verify metrics are flowing to Elastic
2. Check service names match (frontend, api, worker)
3. Adjust the time range in the discovery query (currently 7 days)
4. Check the `service.name` field exists in your metrics

### Service Level Objectives Created But Not Visible

**Issue**: Service Level Objectives created but don't appear in Kibana.

**Solution**:
1. Refresh the Service Level Objectives page
2. Check the workflow console output for creation status
3. Verify the Service Level Objectives API response shows success (201 status)

---

## Manual Service Level Objective Creation

If you prefer to create Service Level Objectives manually, see the examples in `docs/ELASTIC_ALERTS.md` or use the Kibana UI:

1. Navigate to **Observability** → **Service Level Objectives**
2. Click **Create Service Level Objective**
3. Select **Custom KQL** indicator type
4. Configure using the queries from the workflow

---

## Integration with Alerts

After Service Level Objectives are created, you can create alerts based on Service Level Objective burn rates:

1. Navigate to **Observability** → **Alerts**
2. Create a new alert rule
3. Select **Service Level Objective burn rate** as the rule type
4. Choose one of the created Service Level Objectives
5. Set burn rate threshold (e.g., 2x error budget burn)

See `docs/ELASTIC_ALERTS.md` for detailed alert configuration examples.

---

## Workflow Output

The workflow provides console output showing:
- Service discovery results
- Service Level Objective creation status
- Final summary with all created Service Level Objectives

Example output:
```
================================================
Service Level Objective Management Workflow - Final Report
================================================

Service Level Objective Creation Results:
- Availability: 201 (Created)
- Latency: 201 (Created)
- Error Rate: 201 (Created)

Current Service Level Objectives:
Total: 3
Names: Metrics Demo - Availability, Metrics Demo - Latency, Metrics Demo - Error Rate
```

---

## Best Practices

1. **Run Manually First**: Test the workflow manually before enabling scheduled execution
2. **Monitor Workflow Runs**: Check workflow execution history regularly
3. **Adjust Targets**: Start with relaxed targets (95% availability) and tighten as needed
4. **Tag Service Level Objectives**: The workflow tags Service Level Objectives with `metrics-demo` and `automated` for easy filtering
5. **Review Regularly**: Review Service Level Objective performance and adjust targets based on actual service behavior

---

## Related Documentation

- `docs/ELASTIC_ALERTS.md` - Alert configuration examples
- `docs/ELASTIC_DASHBOARD_BUILD.md` - Dashboard creation guide
- `docs/ELASTIC_VALIDATION_QUERIES.md` - Validation queries for metrics

---

**Last Updated:** 2026-01-11  
**Workflow Version:** 1.0
