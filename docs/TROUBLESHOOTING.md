# Troubleshooting Guide

Common issues and solutions for the Elastic Metrics Firehose to Signal demo.

## General Issues

### Services Not Starting

**Symptoms**: Pods stuck in `Pending` or `CrashLoopBackOff`

**Solutions**:
1. Check resource availability:
   ```bash
   kubectl describe pod <pod-name> -n elastic-metrics-demo
   ```
2. Check if images are loaded (for kind):
   ```bash
   kind load docker-image frontend:latest --name metrics-demo
   kind load docker-image api:latest --name metrics-demo
   kind load docker-image worker:latest --name metrics-demo
   ```
3. Check node resources:
   ```bash
   kubectl top nodes
   ```

### Collector Not Receiving Metrics

**Symptoms**: No metrics in Elastic, collector logs show no incoming metrics

**Solutions**:
1. Verify collector is running:
   ```bash
   kubectl get pods -n elastic-metrics-demo -l app=otel-collector
   ```
2. Check collector logs:
   ```bash
   kubectl logs -n elastic-metrics-demo deployment/otel-collector
   ```
3. Verify service endpoints:
   ```bash
   kubectl get endpoints -n elastic-metrics-demo
   ```
4. Test from a service pod:
   ```bash
   kubectl exec -n elastic-metrics-demo <frontend-pod> -- wget -O- http://otel-collector:4318/v1/metrics
   ```

### Metrics Not Appearing in Elastic

**Symptoms**: Collector is running, but no metrics in Kibana

**Solutions**:
1. Check Elastic connection:
   ```bash
   kubectl logs -n elastic-metrics-demo deployment/otel-collector | grep -i error
   ```
2. Verify credentials:
   ```bash
   kubectl get secret elastic-otlp-secret -n elastic-metrics-demo -o jsonpath='{.data.ELASTIC_API_KEY}' | base64 -d
   ```
3. Test Elastic endpoint:
   ```bash
   curl -H "Authorization: ApiKey $ELASTIC_API_KEY" $ELASTIC_OTLP_ENDPOINT
   ```
4. Check collector config:
   ```bash
   kubectl get configmap otel-collector-config -n elastic-metrics-demo -o yaml
   ```

### High Memory Usage

**Symptoms**: Collector pod OOMKilled or high memory usage

**Solutions**:
1. Increase memory limits in `deployment-otel-collector.yaml`:
   ```yaml
   resources:
     limits:
       memory: 1Gi  # Increase from 512Mi
   ```
2. Adjust `memory_limiter` processor:
   ```yaml
   memory_limiter:
     limit_mib: 512  # Increase from 256
   ```
3. Reduce batch size:
   ```yaml
   batch:
     send_batch_size: 512  # Reduce from 1024
   ```

## Mode Switching Issues

### Services Not Picking Up New Mode

**Symptoms**: After switching modes, services still emit old labels

**Solutions**:
1. Verify ConfigMap was updated:
   ```bash
   kubectl get configmap demo-config -n elastic-metrics-demo -o yaml
   ```
2. Restart services manually:
   ```bash
   kubectl rollout restart deployment/frontend -n elastic-metrics-demo
   kubectl rollout restart deployment/api -n elastic-metrics-demo
   kubectl rollout restart deployment/worker -n elastic-metrics-demo
   ```
3. Check environment variables in pods:
   ```bash
   kubectl exec -n elastic-metrics-demo <pod-name> -- env | grep DEMO_MODE
   ```

### Collector Config Not Applied

**Symptoms**: Collector still using old configuration

**Solutions**:
1. Verify ConfigMap:
   ```bash
   kubectl get configmap otel-collector-config -n elastic-metrics-demo -o yaml
   ```
2. Restart collector:
   ```bash
   kubectl rollout restart deployment/otel-collector -n elastic-metrics-demo
   kubectl rollout status deployment/otel-collector -n elastic-metrics-demo
   ```
3. Check collector logs for config errors:
   ```bash
   kubectl logs -n elastic-metrics-demo deployment/otel-collector | grep -i error
   ```

## Load Generator Issues

### Load Generator Not Running

**Symptoms**: No traffic being generated

**Solutions**:
1. Check job status:
   ```bash
   kubectl get job loadgen -n elastic-metrics-demo
   kubectl get pods -n elastic-metrics-demo -l app=loadgen
   ```
2. Check job logs:
   ```bash
   kubectl logs -n elastic-metrics-demo job/loadgen
   ```
3. Verify frontend service is accessible:
   ```bash
   kubectl exec -n elastic-metrics-demo <loadgen-pod> -- wget -O- http://frontend:8080/health
   ```
4. Recreate job:
   ```bash
   kubectl delete job loadgen -n elastic-metrics-demo
   kubectl apply -f k8s/base/job-loadgen.yaml
   ```

## Network Issues

### Services Can't Reach Each Other

**Symptoms**: 503 errors, connection refused

**Solutions**:
1. Verify services exist:
   ```bash
   kubectl get svc -n elastic-metrics-demo
   ```
2. Check service selectors match pod labels:
   ```bash
   kubectl get svc frontend -n elastic-metrics-demo -o yaml
   kubectl get pods -n elastic-metrics-demo -l app=frontend
   ```
3. Test connectivity:
   ```bash
   kubectl exec -n elastic-metrics-demo <frontend-pod> -- wget -O- http://api:8080/health
   ```

### Collector Can't Reach Elastic

**Symptoms**: Export errors in collector logs

**Solutions**:
1. Verify endpoint is correct:
   ```bash
   kubectl get secret elastic-otlp-secret -n elastic-metrics-demo -o jsonpath='{.data.ELASTIC_OTLP_ENDPOINT}' | base64 -d
   ```
2. Test from collector pod:
   ```bash
   kubectl exec -n elastic-metrics-demo <collector-pod> -- wget --header="Authorization: ApiKey $ELASTIC_API_KEY" $ELASTIC_OTLP_ENDPOINT
   ```
3. Check network policies (if using):
   ```bash
   kubectl get networkpolicies -n elastic-metrics-demo
   ```

## Kind-Specific Issues

### Images Not Found

**Symptoms**: `ImagePullBackOff` errors

**Solutions**:
1. Load images into kind:
   ```bash
   make load-kind
   # Or manually:
   kind load docker-image frontend:latest --name metrics-demo
   kind load docker-image api:latest --name metrics-demo
   kind load docker-image worker:latest --name metrics-demo
   ```
2. Verify images are loaded:
   ```bash
   docker exec metrics-demo-control-plane crictl images | grep -E "frontend|api|worker"
   ```

### Cluster Not Starting

**Symptoms**: `kind create cluster` fails

**Solutions**:
1. Check Docker is running:
   ```bash
   docker ps
   ```
2. Check for existing cluster:
   ```bash
   kind get clusters
   ```
3. Delete and recreate:
   ```bash
   kind delete cluster --name metrics-demo
   kind create cluster --name metrics-demo
   ```

## Elastic-Specific Issues

### Authentication Errors

**Symptoms**: 401 Unauthorized errors

**Solutions**:
1. Verify API key is correct:
   ```bash
   kubectl get secret elastic-otlp-secret -n elastic-metrics-demo -o jsonpath='{.data.ELASTIC_API_KEY}' | base64 -d
   ```
2. Test API key:
   ```bash
   curl -H "Authorization: ApiKey $ELASTIC_API_KEY" $ELASTIC_OTLP_ENDPOINT
   ```
3. Regenerate API key if needed (in Elastic Cloud console)

### Wrong Endpoint

**Symptoms**: Connection refused or timeout

**Solutions**:
1. Verify endpoint format:
   - Should be: `https://<deployment-id>.ingest.<region>.elastic.cloud:443`
   - Check Elastic Cloud console for correct endpoint
2. Test endpoint:
   ```bash
   curl -v $ELASTIC_OTLP_ENDPOINT
   ```

## Performance Issues

### Slow Queries in Kibana

**Symptoms**: Kibana queries take a long time

**Solutions**:
1. Check if still in firehose mode (high cardinality):
   ```bash
   kubectl get configmap demo-config -n elastic-metrics-demo -o jsonpath='{.data.DEMO_MODE}'
   ```
2. Switch to shaped mode:
   ```bash
   ./scripts/switch-mode.sh shaped
   ```
3. Wait for new metrics to flow (may take a few minutes)

### High CPU/Memory Usage

**Symptoms**: Nodes or pods using excessive resources

**Solutions**:
1. Check resource usage:
   ```bash
   kubectl top pods -n elastic-metrics-demo
   kubectl top nodes
   ```
2. Reduce load generator intensity (edit `k6-script.js`)
3. Reduce service replicas:
   ```bash
   kubectl scale deployment frontend --replicas=1 -n elastic-metrics-demo
   ```

## Getting Help

If you encounter issues not covered here:

1. Check service logs:
   ```bash
   kubectl logs -n elastic-metrics-demo deployment/<service-name>
   ```
2. Check events:
   ```bash
   kubectl get events -n elastic-metrics-demo --sort-by='.lastTimestamp'
   ```
3. Describe resources:
   ```bash
   kubectl describe pod <pod-name> -n elastic-metrics-demo
   ```
4. Review the [Demo Guide](DEMO_GUIDE.md) for expected behavior

## Common Error Messages

### "ImagePullBackOff"
- **Cause**: Image not found or not loaded into kind
- **Fix**: Run `make load-kind` or load images manually

### "CrashLoopBackOff"
- **Cause**: Container crashing on startup
- **Fix**: Check logs: `kubectl logs <pod-name> -n elastic-metrics-demo`

### "Pending"
- **Cause**: Insufficient resources or scheduling issues
- **Fix**: Check `kubectl describe pod <pod-name> -n elastic-metrics-demo`

### "Connection refused"
- **Cause**: Service not running or wrong endpoint
- **Fix**: Verify service exists and pods are running

### "401 Unauthorized"
- **Cause**: Invalid API key
- **Fix**: Verify and update Elastic API key in secret
