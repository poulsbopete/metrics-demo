#!/bin/bash
set -e

KIND_CLUSTER=${KIND_CLUSTER:-metrics-demo}
NAMESPACE=${NAMESPACE:-elastic-metrics-demo}
OVERLAY=${OVERLAY:-local-kind}

echo "Tearing down demo..."

# Delete Kubernetes resources
if kubectl get namespace "$NAMESPACE" &> /dev/null; then
    echo "Deleting namespace $NAMESPACE..."
    kubectl delete namespace "$NAMESPACE" --wait=true --timeout=120s || true
fi

# Optionally delete kind cluster
read -p "Do you want to delete the kind cluster '$KIND_CLUSTER'? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if kind get clusters | grep -q "^${KIND_CLUSTER}$"; then
        echo "Deleting kind cluster..."
        kind delete cluster --name "$KIND_CLUSTER"
        echo "Kind cluster deleted!"
    else
        echo "Cluster $KIND_CLUSTER does not exist."
    fi
else
    echo "Keeping kind cluster."
fi

echo "Teardown complete!"
