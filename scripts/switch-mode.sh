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

# Get Elastic credentials from secret if not in environment
if [ -z "$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$ELASTIC_API_KEY" ]; then
    ELASTIC_OTLP_ENDPOINT=$(kubectl get secret -n "$NAMESPACE" elastic-otlp-secret -o jsonpath='{.data.ELASTIC_OTLP_ENDPOINT}' 2>/dev/null | base64 -d)
    ELASTIC_API_KEY=$(kubectl get secret -n "$NAMESPACE" elastic-otlp-secret -o jsonpath='{.data.ELASTIC_API_KEY}' 2>/dev/null | base64 -d)
    ELASTIC_DATASET=${ELASTIC_DATASET:-$(kubectl get secret -n "$NAMESPACE" elastic-otlp-secret -o jsonpath='{.data.ELASTIC_DATASET}' 2>/dev/null | base64 -d)}
    export ELASTIC_OTLP_ENDPOINT
    export ELASTIC_API_KEY
    export ELASTIC_DATASET
fi

# Verify required variables are set (skip API key check for local Elastic)
if [ "$USE_LOCAL_ELASTIC" != "true" ]; then
    if [ -z "$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$ELASTIC_API_KEY" ]; then
        echo "Error: ELASTIC_OTLP_ENDPOINT and ELASTIC_API_KEY must be set or available in secret"
        exit 1
    fi
fi

echo "Switching to $MODE mode..."

# Determine collector config file (use local configs if USE_LOCAL_ELASTIC is set)
COLLECTOR_CONFIG=""
if [ "$USE_LOCAL_ELASTIC" = "true" ]; then
    if [ "$MODE" = "firehose" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-local.yaml"
    elif [ "$MODE" = "shaped" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-shaped-local.yaml"
    fi
else
    if [ "$MODE" = "firehose" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-firehose.yaml"
    elif [ "$MODE" = "shaped" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-shaped.yaml"
    fi
fi

# Verify collector config file exists
if [ ! -f "$COLLECTOR_CONFIG" ]; then
    echo "Error: Collector config file not found: $COLLECTOR_CONFIG"
    exit 1
fi

# Read collector config and expand environment variables
if command -v envsubst >/dev/null 2>&1; then
    COLLECTOR_YAML=$(cat "$COLLECTOR_CONFIG" | envsubst)
else
    # Fallback: use sed to replace variables
    COLLECTOR_YAML=$(cat "$COLLECTOR_CONFIG" | \
        sed "s|\${ELASTIC_OTLP_ENDPOINT}|$ELASTIC_OTLP_ENDPOINT|g" | \
        sed "s|\${ELASTIC_API_KEY}|$ELASTIC_API_KEY|g" | \
        sed "s|\${ELASTIC_DATASET}|${ELASTIC_DATASET:-metrics-demo}|g")
fi

# Verify the YAML was expanded correctly (should not contain ${})
if echo "$COLLECTOR_YAML" | grep -q '\${'; then
    echo "Warning: Some environment variables may not have been expanded in collector config"
fi

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
if ! kubectl rollout restart deployment/otel-collector -n "$NAMESPACE"; then
    echo "Error: Failed to restart collector deployment"
    exit 1
fi

echo "Waiting for collector to be ready..."
if ! kubectl rollout status deployment/otel-collector -n "$NAMESPACE" --timeout=180s; then
    echo "Warning: Collector rollout status check timed out or failed"
    echo "Checking collector pod status..."
    kubectl get pods -n "$NAMESPACE" -l app=otel-collector
    echo ""
    echo "You may need to check the collector logs:"
    echo "  kubectl logs -n $NAMESPACE -l app=otel-collector --tail=50"
fi

# Restart services to pick up new DEMO_MODE
echo ""
echo "Restarting services..."
kubectl rollout restart deployment/frontend -n "$NAMESPACE" || echo "Warning: Failed to restart frontend"
kubectl rollout restart deployment/api -n "$NAMESPACE" || echo "Warning: Failed to restart api"
kubectl rollout restart deployment/worker -n "$NAMESPACE" || echo "Warning: Failed to restart worker"

# Wait for services to be ready (non-blocking, with timeout)
echo ""
echo "Waiting for services to be ready (this may take a minute)..."
kubectl wait --for=condition=available --timeout=120s deployment/frontend -n "$NAMESPACE" 2>/dev/null || echo "Note: Frontend may still be starting"
kubectl wait --for=condition=available --timeout=120s deployment/api -n "$NAMESPACE" 2>/dev/null || echo "Note: API may still be starting"
kubectl wait --for=condition=available --timeout=120s deployment/worker -n "$NAMESPACE" 2>/dev/null || echo "Note: Worker may still be starting"

# Verify the mode switch
CURRENT_MODE=$(kubectl get configmap -n "$NAMESPACE" demo-config -o jsonpath='{.data.DEMO_MODE}' 2>/dev/null || echo "")
if [ "$CURRENT_MODE" = "$MODE" ]; then
    echo ""
    echo "✓ Successfully switched to $MODE mode!"
else
    echo ""
    echo "⚠ Mode switch may not have completed. Current mode: ${CURRENT_MODE:-unknown}"
fi

echo ""
echo "Current pod status:"
kubectl get pods -n "$NAMESPACE" -l 'app in (frontend,api,worker,otel-collector)'

echo ""
echo "To check detailed status:"
echo "  kubectl get pods -n $NAMESPACE"
echo ""
echo "To view collector logs:"
echo "  kubectl logs -n $NAMESPACE -l app=otel-collector --tail=50"