#!/bin/bash
set -e

# Get script directory and repo root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment variables
if [ -f "$REPO_ROOT/.env" ]; then
    export $(cat "$REPO_ROOT/.env" | grep -v '^#' | xargs)
fi

# Required variables
if [ -z "$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$ELASTIC_API_KEY" ]; then
    echo "Error: ELASTIC_OTLP_ENDPOINT and ELASTIC_API_KEY must be set"
    exit 1
fi

# Optional variables with defaults
DEMO_MODE=${DEMO_MODE:-firehose}
ELASTIC_DATASET=${ELASTIC_DATASET:-metrics-demo}
NAMESPACE=${NAMESPACE:-elastic-metrics-demo}
OVERLAY=${OVERLAY:-local-kind}

echo "Deploying with mode: $DEMO_MODE"
echo "Using overlay: $OVERLAY"

# Determine collector config file
COLLECTOR_CONFIG=""
if [ "$DEMO_MODE" = "firehose" ]; then
    COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-firehose.yaml"
elif [ "$DEMO_MODE" = "shaped" ]; then
    COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-shaped.yaml"
else
    echo "Error: DEMO_MODE must be 'firehose' or 'shaped'"
    exit 1
fi

# Read collector config
COLLECTOR_YAML=$(cat "$COLLECTOR_CONFIG")

# Read k6 script
K6_SCRIPT=$(cat "$REPO_ROOT/loadgen/k6-script.js")

# Create namespace if it doesn't exist
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Create/update secret
kubectl create secret generic elastic-otlp-secret \
    --from-literal=ELASTIC_OTLP_ENDPOINT="$ELASTIC_OTLP_ENDPOINT" \
    --from-literal=ELASTIC_API_KEY="$ELASTIC_API_KEY" \
    --from-literal=ELASTIC_DATASET="$ELASTIC_DATASET" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Create/update demo config
kubectl create configmap demo-config \
    --from-literal=DEMO_MODE="$DEMO_MODE" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Create/update loadgen script
kubectl create configmap loadgen-script \
    --from-literal=k6-script.js="$K6_SCRIPT" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Apply kustomize
cd "$REPO_ROOT/k8s/overlays/$OVERLAY"
kubectl apply -k .
cd "$REPO_ROOT"

# Update collector config AFTER kustomize (to override the placeholder)
kubectl create configmap otel-collector-config \
    --from-literal=collector.yaml="$COLLECTOR_YAML" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Wait for deployments
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/frontend -n "$NAMESPACE" || true
kubectl wait --for=condition=available --timeout=300s deployment/api -n "$NAMESPACE" || true
kubectl wait --for=condition=available --timeout=300s deployment/worker -n "$NAMESPACE" || true
kubectl wait --for=condition=available --timeout=300s deployment/otel-collector -n "$NAMESPACE" || true

# Delete existing loadgen job if it exists
kubectl delete job loadgen -n "$NAMESPACE" --ignore-not-found=true

# Create loadgen job
kubectl apply -f "$REPO_ROOT/k8s/base/job-loadgen.yaml"

echo ""
echo "Deployment complete!"
echo ""
echo "To check status:"
echo "  kubectl get pods -n $NAMESPACE"
echo ""
echo "To view frontend:"
echo "  kubectl port-forward -n $NAMESPACE svc/frontend 8080:8080"
echo "  Then visit: http://localhost:8080/demo"
