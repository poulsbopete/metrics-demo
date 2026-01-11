# OpenTelemetry Collector Configurations

This directory contains two collector configurations demonstrating different approaches to metric collection.

## Firehose Configuration (`collector-firehose.yaml`)

**Purpose**: Pass through all metrics with minimal processing, demonstrating high-cardinality issues.

### Processors:
1. **memory_limiter**: Prevents OOM by limiting memory usage
2. **k8sattributes**: Adds Kubernetes metadata (pod, namespace, labels)
3. **batch**: Batches metrics for efficient export

### What it does:
- Receives OTLP metrics from services
- Adds Kubernetes attributes (pod name, namespace, etc.)
- Passes all labels through unchanged
- Exports to Elastic Serverless

### Result:
- High time series cardinality (10,000+ series)
- All labels preserved: `user_id`, `path`, `pod`, `instance`, `container`, `build_id`
- Useful for demonstrating the problem

## Shaped Configuration (`collector-shaped.yaml`)

**Purpose**: Aggressively reduce cardinality while preserving SLO-level metrics.

### Processors:
1. **memory_limiter**: Prevents OOM
2. **attributes/delete**: Removes high-cardinality labels:
   - `user_id`
   - `pod`
   - `container`
   - `instance`
   - `build_id`
   - `git_sha`
3. **transform/path_normalize**: Normalizes path patterns:
   - `/orders/12345` → `/orders/{id}`
   - `/users/111` → `/users/{id}`
   - `/products/333` → `/products/{id}`
4. **k8sattributes**: Adds Kubernetes metadata (but pod/container already removed)
5. **batch**: Batches metrics

### What it does:
- Receives OTLP metrics
- **Deletes** wasteful labels (`user_id`, `pod`, `container`, `instance`, `build_id`)
- **Normalizes** path labels to reduce cardinality
- Ensures consistent `service.name` and `deployment.environment`
- Exports to Elastic Serverless

### Result:
- Low time series cardinality (100-500 series)
- Only meaningful labels preserved: `service`, `method`, `route`, `status_code`, `path` (normalized)
- SLO-level metrics still available (latency, error rate, request rate)

## Key Differences

| Aspect | Firehose | Shaped |
|--------|----------|--------|
| **Time Series** | 10,000+ | 100-500 |
| **Labels Preserved** | All (including `user_id`, `pod`, etc.) | Only meaningful ones |
| **Path Labels** | `/orders/12345` | `/orders/{id}` |
| **Cost** | High | Low |
| **Use Case** | Demonstrating problem | Production-ready |

## Switching Between Configs

Use the `switch-mode.sh` script:

```bash
./scripts/switch-mode.sh firehose  # Use firehose config
./scripts/switch-mode.sh shaped     # Use shaped config
```

The script patches the collector ConfigMap and restarts the collector pod.

## Customization

### Adding More Label Removal

Edit `collector-shaped.yaml` and add to the `attributes/delete` processor:

```yaml
attributes/delete:
  actions:
    - key: your_label_name
      action: delete
```

### Adding Path Normalization Rules

Edit `collector-shaped.yaml` and add to the `transform/path_normalize` processor:

```yaml
- set(attributes["path"], replace_pattern(attributes["path"], "^/your-pattern/\\d+", "/your-pattern/{id}"))
```

### Filtering Metrics

Uncomment the `filter/noisy_metrics` processor to drop entire metric families:

```yaml
filter/noisy_metrics:
  metrics:
    exclude:
      match_type: regexp
      metric_names:
        - "^go_.*"
        - "^process_.*"
```

## Environment Variables

Both configs use environment variables for Elastic connection:

- `ELASTIC_OTLP_ENDPOINT`: Elastic OTLP HTTP endpoint
- `ELASTIC_API_KEY`: Elastic API key
- `ELASTIC_DATASET`: Optional dataset name for routing

These are set via Kubernetes Secrets and ConfigMaps.
