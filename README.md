# Elastic Metrics Firehose to Shaped Demo

A portable demo repository demonstrating how OpenTelemetry Collector metric shaping reduces time series cardinality and cost while preserving SLO-level metrics, with metrics sent to Elastic Serverless via OTLP.

## Overview

This demo showcases two modes of metric collection:

1. **Firehose Mode**: High-cardinality Prometheus-style metrics with wasteful labels (pod, instance, container, user_id, path)
2. **Shaped Mode**: OpenTelemetry Collector processors remove/normalize labels and pre-aggregate into human-meaningful metrics (p95 latency, error rate, request rate, saturation)

## Prerequisites

### Local (kind/k3d)
- Docker Desktop or Docker Engine
- kubectl
- kind or k3d
- make
- Node.js 18+ (for building services)
- Go 1.21+ (optional, for load generator)

### Cloud (EKS)
- AWS CLI configured
- Terraform 1.5+ (optional, for EKS cluster)
- kubectl
- make

## Quick Start (Local with kind)

1. **Set environment variables:**
```bash
export ELASTIC_OTLP_ENDPOINT=https://your-endpoint.ingest.elastic.cloud:443
export ELASTIC_API_KEY=your-api-key-here
export ELASTIC_DATASET=metrics-demo  # optional
export DEMO_MODE=firehose  # or 'shaped'
```

2. **Create and deploy:**
```bash
make demo-local
```

This will:
- Create a kind cluster
- Build Docker images
- Load images into kind
- Deploy all services and the OTel Collector
- Start the load generator

3. **Access the demo:**
- Frontend UI: `kubectl port-forward -n elastic-metrics-demo svc/frontend 8080:8080`
- Visit http://localhost:8080/demo to see the demo UI

4. **Switch between modes:**
```bash
./scripts/switch-mode.sh firehose  # or 'shaped'
```

5. **Teardown:**
```bash
make teardown
```

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

## Services

- **frontend**: HTTP service that calls the API service
- **api**: Middle service that calls the worker
- **worker**: Simulates CPU/memory work and occasionally errors
- **loadgen**: Generates traffic using k6

## Metrics Emitted

### High-Cardinality (Firehose Mode)
- `http_request_duration_seconds` with labels: `user_id`, `path`, `pod`, `instance`, `container`, `build_id`
- `http_request_total` with same labels
- `http_error_total` with same labels
- `cpu_work_units` with same labels
- `queue_depth` with same labels

### Shaped (Shaped Mode)
- `http_request_rate` (per second, aggregated)
- `http_request_duration_p95` (approximate)
- `http_error_rate` (percentage)
- `cpu_work_units_total` (aggregated)
- `queue_saturation` (normalized)

Labels normalized:
- `path`: `/orders/{id}` instead of `/orders/12345`
- Removed: `user_id`, `pod`, `container`, `instance`, `build_id`
- Kept: `service.name`, `http.method`, `http.status_code`, `route`

## Switching Modes

The demo supports two collector configurations:

1. **Firehose**: Minimal processing, passes all metrics through
2. **Shaped**: Aggressive label removal, path normalization, optional aggregation

Switch modes:
```bash
./scripts/switch-mode.sh firehose
# or
./scripts/switch-mode.sh shaped
```

The script patches the collector ConfigMap and restarts the collector pod.

## Validating in Elastic

After deployment, check Elastic for metrics:

1. **Discover**: Search for `metricset.name: "otel"` or `service.name: "frontend"`
2. **Metrics Explorer**: Look for:
   - `http_request_duration_seconds` (firehose)
   - `http_request_rate` (shaped)
   - `http_error_rate` (shaped)
3. **Time Series Count**: Use Elastic's cardinality analysis or check metric count

### Expected Time Series Reduction

- **Firehose**: ~10,000+ time series (with high-cardinality labels)
- **Shaped**: ~100-500 time series (after shaping)

## Directory Structure

```
.
├── services/
│   ├── frontend/      # Frontend service
│   ├── api/           # API service
│   └── worker/        # Worker service
├── loadgen/           # k6 load generation scripts
├── otel/              # OTel Collector configs
│   ├── collector-firehose.yaml
│   ├── collector-shaped.yaml
│   └── README.md
├── k8s/               # Kubernetes manifests
│   ├── base/          # Base resources
│   └── overlays/      # kustomize overlays
│       ├── local-kind/
│       └── eks/
├── scripts/           # Deployment scripts
├── terraform/         # Optional EKS Terraform
├── docs/              # Documentation
└── Makefile
```

## Documentation

- [Demo Guide](docs/DEMO_GUIDE.md) - Talk track and presentation flow
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Cost and Cardinality](docs/COST_AND_CARDINALITY.md) - Explanation of time series reduction

## Environment Variables

See `.env.example` for all required and optional variables.

Required:
- `ELASTIC_OTLP_ENDPOINT`: Elastic OTLP HTTP endpoint
- `ELASTIC_API_KEY`: Elastic API key

Optional:
- `ELASTIC_DATASET`: Dataset name for routing (default: `metrics-demo`)
- `DEMO_MODE`: `firehose` or `shaped` (default: `firehose`)

## Make Targets

- `make build` - Build all Docker images
- `make load-kind` - Load images into kind cluster
- `make deploy` - Deploy to Kubernetes
- `make demo-local` - Full local setup (kind + build + deploy)
- `make teardown` - Remove cluster and resources
- `make sanity-check` - Verify services are running

## EKS Deployment

See [terraform/README.md](terraform/README.md) for EKS deployment instructions.

## License

MIT
