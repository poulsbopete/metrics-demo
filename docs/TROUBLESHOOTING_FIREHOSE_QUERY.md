# Troubleshooting Firehose Series Query

If your query returns no results, try these debugging steps:

## Step 1: Check if ANY data exists

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
| LIMIT 10
```

**If this returns nothing:** No metrics are being indexed yet. Check:
- Is the OTel Collector running?
- Are services sending metrics?
- Wait 2-5 minutes for indexing

## Step 2: Check if frontend service has data

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
| LIMIT 10
```

**If this returns nothing:** Frontend metrics aren't arriving. Check service logs.

## Step 3: Check what fields actually exist

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
| LIMIT 1
```

Then expand a document in Kibana to see the actual field structure.

## Step 4: Check if user_id field exists

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| LIMIT 10
```

**If this returns nothing:** Either:
- You're in "shaped" mode (user_id is removed)
- The field name is different
- No data with user_id yet

## Step 5: Check DEMO_MODE

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
| STATS 
  with_user_id = count() FILTER(attributes.user_id IS NOT NULL),
  total = count()
```

**Expected in Firehose mode:** `with_user_id > 0`

## Step 6: Alternative field names to try

The fields might be stored differently. Try these variations:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
| LIMIT 1
```

Then check the document for:
- `attributes.user_id` OR `user_id` OR `metric.attributes.user_id`
- `attributes.path` OR `path` OR `metric.attributes.path`
- `attributes.pod` OR `pod` OR `resource.attributes.k8s.pod.name`

## Step 7: Check time range

Your original query uses `NOW() - 30m` to `NOW() - 15m`. Try a more recent range:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

## Step 8: Simplified query (no time filter on attributes)

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

## Step 9: Check if you're actually in Firehose mode

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
| STATS 
  firehose_count = count() FILTER(attributes.user_id IS NOT NULL),
  shaped_count = count() FILTER(attributes.user_id IS NULL),
  total = count()
```

**Expected in Firehose mode:** `firehose_count > 0`

## Step 10: Verify index name

The index might be different. Check available indices:

```esql
SHOW TABLES
```

Or in Kibana Discover, check what data views/indices are available.

## Common Issues:

1. **No data yet**: Metrics take 1-5 minutes to index
2. **Wrong mode**: Check `kubectl get configmap -n elastic-metrics-demo demo-config`
3. **Field names**: OpenTelemetry might store attributes differently
4. **Time range**: Data might be older/newer than expected
5. **Index name**: Might be `metrics-*` or a different pattern
