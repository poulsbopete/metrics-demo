#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <firehose|shaped>"
    exit 1
fi

MODE=$1
if [ "$MODE" != "firehose" ] && [ "$MODE" != "shaped" ]; then
    echo "Error: Mode must be 'firehose' or 'shaped'"
    exit 1
fi

# Get script directory and repo root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment variables
if [ -f "$REPO_ROOT/.env" ]; then
    export $(cat "$REPO_ROOT/.env" | grep -v '^#' | xargs)
fi

NAMESPACE=${NAMESPACE:-elastic-metrics-demo}

echo "Switching to $MODE mode..."

# Determine collector config file
COLLECTOR_CONFIG=""
if [ "$MODE" = "firehose" ]; then
    COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-firehose.yaml"
elif [ "$MODE" = "shaped" ]; then
    COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-shaped.yaml"
fi

# Read collector config
COLLECTOR_YAML=$(cat "$COLLECTOR_CONFIG")

# Update demo config
kubectl create configmap demo-config \
    --from-literal=DEMO_MODE="$MODE" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Update collector config
kubectl create configmap otel-collector-config \
    --from-literal=collector.yaml="$COLLECTOR_YAML" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Restart collector to pick up new config
echo "Restarting collector..."
kubectl rollout restart deployment/otel-collector -n "$NAMESPACE"
kubectl rollout status deployment/otel-collector -n "$NAMESPACE" --timeout=120s

# Restart services to pick up new DEMO_MODE
echo "Restarting services..."
kubectl rollout restart deployment/frontend -n "$NAMESPACE"
kubectl rollout restart deployment/api -n "$NAMESPACE"
kubectl rollout restart deployment/worker -n "$NAMESPACE"

echo ""
echo "Switched to $MODE mode!"
echo "Services are restarting with new configuration."
echo ""
echo "To check status:"
echo "  kubectl get pods -n $NAMESPACE"
