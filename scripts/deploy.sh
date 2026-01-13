#!/bin/bash
set -e

# Get script directory and repo root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment variables
if [ -f "$REPO_ROOT/.env" ]; then
    export $(cat "$REPO_ROOT/.env" | grep -v '^#' | xargs)
fi

# Required variables (skip check if using local Elastic)
if [ "$USE_LOCAL_ELASTIC" != "true" ]; then
    if [ -z "$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$ELASTIC_API_KEY" ]; then
        echo "Error: ELASTIC_OTLP_ENDPOINT and ELASTIC_API_KEY must be set"
        exit 1
    fi
fi

# Optional variables with defaults
DEMO_MODE=${DEMO_MODE:-firehose}
ELASTIC_DATASET=${ELASTIC_DATASET:-metrics-demo}
NAMESPACE=${NAMESPACE:-elastic-metrics-demo}
OVERLAY=${OVERLAY:-local-kind}

echo "Deploying with mode: $DEMO_MODE"
echo "Using overlay: $OVERLAY"

# Determine collector config file (use local configs if USE_LOCAL_ELASTIC is set)
COLLECTOR_CONFIG=""
if [ "$USE_LOCAL_ELASTIC" = "true" ]; then
    if [ "$DEMO_MODE" = "firehose" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-local.yaml"
    elif [ "$DEMO_MODE" = "shaped" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-shaped-local.yaml"
    else
        echo "Error: DEMO_MODE must be 'firehose' or 'shaped'"
        exit 1
    fi
else
    if [ "$DEMO_MODE" = "firehose" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-firehose.yaml"
    elif [ "$DEMO_MODE" = "shaped" ]; then
        COLLECTOR_CONFIG="$REPO_ROOT/otel/collector-shaped.yaml"
    else
        echo "Error: DEMO_MODE must be 'firehose' or 'shaped'"
        exit 1
    fi
fi

# Read collector config
COLLECTOR_YAML=$(cat "$COLLECTOR_CONFIG")

# For local Elastic, adjust the endpoint based on the Kubernetes environment
if [ "$USE_LOCAL_ELASTIC" = "true" ]; then
    # Detect if we're using K3s (which doesn't support host.docker.internal)
    if command -v k3s &> /dev/null && kubectl cluster-info &> /dev/null; then
        # K3s: Get the host gateway IP (the IP pods use to reach the host)
        # This is typically the first IP of the default route
        HOST_IP=$(ip route | grep default | awk '{print $3}' | head -1)
        if [ -z "$HOST_IP" ]; then
            # Fallback: try to get the host IP from the node
            HOST_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "127.0.0.1")
        fi
        if [ -z "$HOST_IP" ] || [ "$HOST_IP" = "127.0.0.1" ]; then
            # Last resort: use the node's IP from K3s
            HOST_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "host.docker.internal")
        fi
        echo "Using K3s - setting Elastic endpoint to host IP: $HOST_IP:9200"
        # Replace host.docker.internal with the actual host IP
        COLLECTOR_YAML=$(echo "$COLLECTOR_YAML" | sed "s|host.docker.internal:9200|${HOST_IP}:9200|g")
    else
        # Kind or Docker Desktop: use host.docker.internal (already in config)
        echo "Using kind/Docker - Elastic endpoint: host.docker.internal:9200"
    fi
fi

# Read k6 script
K6_SCRIPT=$(cat "$REPO_ROOT/loadgen/k6-script.js")

# Create namespace if it doesn't exist
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Create/update secret (skip API key for local Elastic)
if [ "$USE_LOCAL_ELASTIC" = "true" ]; then
    kubectl create secret generic elastic-otlp-secret \
        --from-literal=ELASTIC_OTLP_ENDPOINT="http://host.docker.internal:9200" \
        --from-literal=ELASTIC_API_KEY="" \
        --from-literal=ELASTIC_DATASET="$ELASTIC_DATASET" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
else
    kubectl create secret generic elastic-otlp-secret \
        --from-literal=ELASTIC_OTLP_ENDPOINT="$ELASTIC_OTLP_ENDPOINT" \
        --from-literal=ELASTIC_API_KEY="$ELASTIC_API_KEY" \
        --from-literal=ELASTIC_DATASET="$ELASTIC_DATASET" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
fi

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

# Apply kustomize with image overrides if set
cd "$REPO_ROOT/k8s/overlays/$OVERLAY"

# Override images if environment variables are set
if [ -n "$FRONTEND_IMAGE" ] || [ -n "$API_IMAGE" ] || [ -n "$WORKER_IMAGE" ]; then
    # Backup original kustomization.yaml
    cp kustomization.yaml kustomization.yaml.bak
    
    # Use kustomize edit to set images
    if [ -n "$FRONTEND_IMAGE" ]; then
        kustomize edit set image frontend="$FRONTEND_IMAGE"
        echo "Set frontend image to: $FRONTEND_IMAGE"
    fi
    if [ -n "$API_IMAGE" ]; then
        kustomize edit set image api="$API_IMAGE"
        echo "Set api image to: $API_IMAGE"
    fi
    if [ -n "$WORKER_IMAGE" ]; then
        kustomize edit set image worker="$WORKER_IMAGE"
        echo "Set worker image to: $WORKER_IMAGE"
    fi
fi

kubectl apply -k .

# Restore original kustomization.yaml if we modified it
if [ -f kustomization.yaml.bak ]; then
    mv kustomization.yaml.bak kustomization.yaml
fi

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

# Apply loadgen deployment (will be included in kustomize)
# The deployment runs continuously and adapts to frontend status changes

echo ""
echo "Deployment complete!"
echo ""
echo "To check status:"
echo "  kubectl get pods -n $NAMESPACE"
echo ""
echo "To view frontend:"
echo "  kubectl port-forward -n $NAMESPACE svc/frontend 8080:8080"
echo "  Then visit: http://localhost:8080/demo"
