#!/bin/bash
set -e

NAMESPACE=${NAMESPACE:-elastic-metrics-demo}

echo "Running sanity checks..."

# Check namespace exists
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    echo "❌ Namespace $NAMESPACE does not exist"
    exit 1
fi
echo "✅ Namespace exists"

# Check pods are running
echo "Checking pods..."
PODS=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}')
for pod in $PODS; do
    STATUS=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.phase}')
    if [ "$STATUS" != "Running" ]; then
        echo "⚠️  Pod $pod is not Running (status: $STATUS)"
    else
        echo "✅ Pod $pod is Running"
    fi
done

# Check services
echo "Checking services..."
SERVICES=$(kubectl get svc -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}')
for svc in $SERVICES; do
    ENDPOINTS=$(kubectl get endpoints "$svc" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || echo "")
    if [ -z "$ENDPOINTS" ]; then
        echo "⚠️  Service $svc has no endpoints"
    else
        echo "✅ Service $svc has endpoints"
    fi
done

# Test frontend health endpoint
echo "Testing frontend health endpoint..."
FRONTEND_POD=$(kubectl get pod -n "$NAMESPACE" -l app=frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$FRONTEND_POD" ]; then
    if kubectl exec -n "$NAMESPACE" "$FRONTEND_POD" -- wget -q -O- http://localhost:8080/health &> /dev/null; then
        echo "✅ Frontend health check passed"
    else
        echo "⚠️  Frontend health check failed"
    fi
else
    echo "⚠️  No frontend pod found"
fi

# Test collector health endpoint
echo "Testing collector health endpoint..."
COLLECTOR_POD=$(kubectl get pod -n "$NAMESPACE" -l app=otel-collector -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$COLLECTOR_POD" ]; then
    if kubectl exec -n "$NAMESPACE" "$COLLECTOR_POD" -- wget -q -O- http://localhost:13133 &> /dev/null; then
        echo "✅ Collector health check passed"
    else
        echo "⚠️  Collector health check failed"
    fi
else
    echo "⚠️  No collector pod found"
fi

echo ""
echo "Sanity checks complete!"
