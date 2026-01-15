# Serverless Observability Setup Analysis

## Overview
This document analyzes how to replace the `start-local` Elastic installation with a serverless observability instance, based on the `logs-essentials-copy` Instruqt track implementation.

## Current Setup (start-local)
- Uses `curl -fsSL https://elastic.co/start-local | sh` to install Elastic locally
- Requires Docker and significant disk space (~5GB minimum)
- Runs Elasticsearch and Kibana in Docker containers
- Endpoint: `http://localhost:9200` or `http://host.docker.internal:9200`
- No authentication required for local instance

## Serverless Observability Setup (from logs-essentials-copy)

### Key Configuration Parameters

- **`PROJECT_TYPE`**: Must be `observability` (other options: `elasticsearch`, `security`)
- **`PRODUCT_TIER`**: Determines feature set when `PROJECT_TYPE=observability`
  - `logs_essentials` - Basic observability features (logs-focused)
  - `complete` - Full observability features including metrics, APM, and logs (recommended for metrics demo)
- **`REGIONS`**: Cloud region (e.g., `aws-us-east-1`)

**Important**: `observability` is the `PROJECT_TYPE`, not a `PRODUCT_TIER` value.

### Architecture
The `logs-essentials-copy` track uses a **separate VM** (`es3-api`) that:
1. Runs the `elastic-pmm/es3-api-v2` image (contains Python API script)
2. Creates a serverless observability project via `bin/es3-api.py`
3. Sets up NGINX proxies for Kibana (port 8080) and Elasticsearch (port 9200)
4. Serves project details via JSON server on port 8081

### Key Components

#### 1. Separate VM Configuration (`config.yml`)
```yaml
virtualmachines:
- name: es3-api
  image: elastic-pmm/es3-api-v2
  shell: /bin/bash
  environment:
    PROJECT_TYPE: observability
    PRODUCT_TIER: logs_essentials  # or "complete" for full features
    REGIONS: aws-us-east-1
  memory: 4096
  cpus: 1
- name: metrics-demo  # Our existing VM
  image: instruqt/k3s-v1-33-4
  # ... existing config
```

#### 2. Setup Script (`setup-es3-api`)
- Waits for host bootstrap
- Calls `python3 bin/es3-api.py` with:
  - `--operation create`
  - `--project-type observability`
  - `--product-tier logs_essentials` (or `complete`)
  - `--regions aws-us-east-1`
  - `--api-key $PME_CLOUD_INSTRUQT_API_KEY`
  - `--wait-for-ready`
- Generates API key via Elasticsearch API
- Fetches Fleet Server URL (for observability projects)
- Configures NGINX proxies
- Saves results to `/tmp/project_results.json`
- Starts JSON server on port 8081

#### 3. Project Results JSON Structure
```json
{
  "aws-us-east-1": {
    "id": "deployment-id",
    "endpoints": {
      "kibana": "https://...",
      "elasticsearch": "https://...",
      "fleet": "https://..."  // for observability projects
    },
    "credentials": {
      "username": "elastic",
      "password": "...",
      "api_key": "..."
    }
  }
}
```

#### 4. Cleanup Script (`cleanup-es3-api`)
- Retrieves deployment ID from agent variables
- Calls `python3 bin/es3-api.py` with `--operation delete`
- Cleans up the serverless project

## Integration Options for metrics-demo

### Option 1: Separate VM (Recommended - matches logs-essentials-copy)
**Pros:**
- Clean separation of concerns
- Matches proven pattern from logs-essentials-copy
- No conflicts with K3s setup
- Can reuse existing `es3-api-v2` image

**Cons:**
- Requires additional VM resources
- More complex configuration

**Implementation:**
1. Add `es3-api` VM to `config.yml`
2. Add `setup-es3-api` and `cleanup-es3-api` to track_scripts
3. Update `setup-metrics-demo` to:
   - Wait for es3-api VM to be ready
   - Fetch project details from `http://es3-api:8081` (or via agent variables)
   - Set `ELASTIC_OTLP_ENDPOINT` and `ELASTIC_API_KEY` from project results
   - Set `USE_LOCAL_ELASTIC=false`

### Option 2: Same VM (if es3-api-v2 image supports it)
**Pros:**
- Single VM, simpler setup
- Lower resource usage

**Cons:**
- May conflict with K3s setup
- Requires checking if `es3-api-v2` image supports K3s
- More complex script coordination

### Option 3: Hybrid - Use es3-api script on metrics-demo VM
**Pros:**
- Single VM
- Can use K3s image

**Cons:**
- Need to install Python dependencies and es3-api.py script
- More complex setup
- May not have access to `PME_CLOUD_INSTRUQT_API_KEY` on regular VM

## Recommended Approach: Option 1 (Separate VM)

### Changes Required

#### 1. Update `config.yml`
```yaml
version: "3"
virtualmachines:
- name: es3-api
  image: elastic-pmm/es3-api-v2
  shell: /bin/bash
  environment:
    PROJECT_TYPE: observability
    PRODUCT_TIER: complete  # Use "complete" for full observability features
    REGIONS: aws-us-east-1
  memory: 4096
  cpus: 1
- name: metrics-demo
  image: instruqt/k3s-v1-33-4
  shell: /bin/bash
  environment:
    DEMO_MODE: firehose
    ELASTIC_DATASET: metrics-demo
    USE_LOCAL_ELASTIC: "false"  # Changed from "true"
    # ELASTIC_OTLP_ENDPOINT and ELASTIC_API_KEY will be set by setup script
  memory: 16384
  cpus: 4
  allow_external_ingress:
  - http
  - https
  - high-ports
```

#### 2. Add Track Scripts
Copy `setup-es3-api` and `cleanup-es3-api` from logs-essentials-copy to `track_scripts/`

#### 3. Update `setup-metrics-demo`
Replace the Elastic installation section with:
```bash
# Wait for es3-api VM to be ready and fetch project details
echo "⏳ Waiting for serverless observability instance to be ready..."
MAX_WAIT=300
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    # Try to fetch project details from es3-api JSON server
    if curl -s http://es3-api:8081 > /dev/null 2>&1; then
        PROJECT_JSON=$(curl -s http://es3-api:8081)
        if [ -n "$PROJECT_JSON" ]; then
            echo "✅ Serverless observability instance is ready"
            break
        fi
    fi
    
    # Alternative: Check agent variables (if es3-api sets them)
    ES_KIBANA_URL=$(agent variable get ES_KIBANA_URL 2>/dev/null || echo "")
    if [ -n "$ES_KIBANA_URL" ]; then
        echo "✅ Serverless observability instance is ready (from agent variables)"
        break
    fi
    
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    if [ $((WAIT_COUNT % 20)) -eq 0 ]; then
        echo "   Still waiting... ($WAIT_COUNT/$MAX_WAIT seconds)"
    fi
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo "❌ ERROR: Serverless observability instance did not become ready"
    exit 1
fi

# Extract endpoints and credentials
REGION="aws-us-east-1"
if [ -n "$PROJECT_JSON" ]; then
    ELASTIC_OTLP_ENDPOINT=$(echo "$PROJECT_JSON" | jq -r --arg region "$REGION" '.[$region].endpoints.elasticsearch')
    ELASTIC_API_KEY=$(echo "$PROJECT_JSON" | jq -r --arg region "$REGION" '.[$region].credentials.api_key')
    ES_USERNAME=$(echo "$PROJECT_JSON" | jq -r --arg region "$REGION" '.[$region].credentials.username')
    ES_PASSWORD=$(echo "$PROJECT_JSON" | jq -r --arg region "$REGION" '.[$region].credentials.password')
else
    # Fallback to agent variables
    ELASTIC_OTLP_ENDPOINT=$(agent variable get ES_URL 2>/dev/null || echo "")
    ELASTIC_API_KEY=$(agent variable get ES_API_KEY 2>/dev/null || echo "")
    ES_USERNAME=$(agent variable get ES_USERNAME 2>/dev/null || echo "elastic")
    ES_PASSWORD=$(agent variable get ES_PASSWORD 2>/dev/null || echo "")
fi

# Validate we have required values
if [ -z "$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$ELASTIC_API_KEY" ]; then
    echo "❌ ERROR: Failed to retrieve serverless observability credentials"
    exit 1
fi

# Export for use in deployment
export ELASTIC_OTLP_ENDPOINT
export ELASTIC_API_KEY
export USE_LOCAL_ELASTIC="false"

echo "✅ Serverless observability instance configured"
echo "   Endpoint: $ELASTIC_OTLP_ENDPOINT"
echo "   Username: $ES_USERNAME"
```

#### 4. Update `track.yml`
Add lifecycle scripts:
```yaml
lifecycle:
  setup:
    - script: track_scripts/setup-es3-api
      host: es3-api
    - script: track_scripts/setup-metrics-demo
      host: metrics-demo
  cleanup:
    - script: track_scripts/cleanup-es3-api
      host: es3-api
    - script: track_scripts/cleanup-metrics-demo
      host: metrics-demo
```

#### 5. Update Collector Configuration
The collector configs (`collector-firehose.yaml`, `collector-shaped.yaml`) already use:
- `otlphttp/elastic` exporter
- `endpoint: ${ELASTIC_OTLP_ENDPOINT}`
- `headers: Authorization: "ApiKey ${ELASTIC_API_KEY}"`

No changes needed - they'll work with serverless endpoints.

#### 6. Update `deploy.sh`
The script already handles `USE_LOCAL_ELASTIC=false` correctly. No changes needed.

## Benefits of Serverless Approach

1. **No Disk Space Issues**: No need for 5GB+ disk space for Elastic installation
2. **No Docker Dependency**: Don't need Docker running for Elastic (only for app images)
3. **Faster Setup**: Serverless instance creation is typically faster than Docker pull + setup
4. **Production-like**: Uses actual Elastic Cloud serverless, more realistic demo
5. **Better Reliability**: No "no space left on device" errors
6. **Automatic Cleanup**: Serverless instance is automatically deleted after lab

## Considerations

1. **API Key Required**: Need `PME_CLOUD_INSTRUQT_API_KEY` environment variable (set by Instruqt)
2. **Network Access**: VM needs internet access to create serverless project
3. **Cost**: Serverless instances may have usage costs (but Instruqt handles cleanup)
4. **Region**: Default is `aws-us-east-1`, can be configured
5. **Product Tier** (when `PROJECT_TYPE=observability`): 
   - `logs_essentials` - Basic observability features (logs-focused)
   - `complete` - Full observability features including metrics, APM, and logs (recommended for metrics demo)
   
   **Note**: `observability` is the `PROJECT_TYPE`, not a `PRODUCT_TIER` value. The `PRODUCT_TIER` is a separate setting that determines which features are enabled in the observability project.

## Testing Checklist

- [ ] Verify es3-api VM starts correctly
- [ ] Verify serverless project is created successfully
- [ ] Verify project details are accessible via JSON server
- [ ] Verify metrics-demo VM can connect to serverless endpoint
- [ ] Verify collector can send metrics to serverless endpoint
- [ ] Verify cleanup script deletes serverless project
- [ ] Test with both `firehose` and `shaped` demo modes
