#!/bin/bash
set -e

KIND_CLUSTER=${KIND_CLUSTER:-metrics-demo}
NAMESPACE=${NAMESPACE:-elastic-metrics-demo}

echo "Setting up kind cluster: $KIND_CLUSTER"

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo "Error: kind is not installed. Please install it first."
    echo "Visit: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi

# Check if cluster already exists
if kind get clusters | grep -q "^${KIND_CLUSTER}$"; then
    echo "Cluster $KIND_CLUSTER already exists. Skipping creation."
else
    echo "Creating kind cluster..."
    kind create cluster --name "$KIND_CLUSTER" --wait 5m
    echo "Kind cluster created successfully!"
fi

# Verify cluster is ready
echo "Waiting for cluster to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=300s

echo "Kind cluster setup complete!"
