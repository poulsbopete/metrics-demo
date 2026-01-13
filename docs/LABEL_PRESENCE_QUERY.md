# Label Presence Query - Firehose vs Shaped

## Issue: No Shaped Data Showing

If you're currently in **shaped mode**, the last 30 minutes will only have shaped data. To see both modes, you need to:

### Option 1: Use Longer Time Range (If You Switched Modes Recently)

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 2h
  AND service.name == "frontend"
| EVAL 
    mode = CASE(
      attributes.user_id IS NOT NULL, 
      "firehose", 
      "shaped"
    ),
    with_user_id_val = CASE(attributes.user_id IS NOT NULL, 1, 0),
    with_pod_val = CASE(attributes.pod IS NOT NULL, 1, 0),
    with_build_id_val = CASE(attributes.build_id IS NOT NULL, 1, 0)
| STATS 
    with_user_id = sum(with_user_id_val),
    with_pod = sum(with_pod_val),
    with_build_id = sum(with_build_id_val),
    total = count()
  BY mode
```

### Option 2: Check When Each Mode Was Active

First, see when you have data for each mode:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 2h
  AND service.name == "frontend"
| EVAL mode = CASE(attributes.user_id IS NOT NULL, "firehose", "shaped")
| STATS count() BY mode, time_bucket = bucket(@timestamp, 5m)
| SORT time_bucket DESC
```

This shows you when each mode had data. Then adjust your time range accordingly.

### Option 3: Generate Both Modes (Recommended for Demo)

1. **Switch to firehose mode** and let it run for 10-15 minutes:
   ```bash
   ./scripts/switch-mode.sh firehose
   ```

2. **Switch to shaped mode** and let it run for 10-15 minutes:
   ```bash
   ./scripts/switch-mode.sh shaped
   ```

3. **Then use this query** with a time range covering both periods:
   ```esql
   FROM metrics-generic.otel-default
   | WHERE @timestamp >= NOW() - 30m
     AND service.name == "frontend"
   | EVAL 
       mode = CASE(
         attributes.user_id IS NOT NULL, 
         "firehose", 
         "shaped"
       ),
       with_user_id_val = CASE(attributes.user_id IS NOT NULL, 1, 0),
       with_pod_val = CASE(attributes.pod IS NOT NULL, 1, 0),
       with_build_id_val = CASE(attributes.build_id IS NOT NULL, 1, 0)
   | STATS 
       with_user_id = sum(with_user_id_val),
       with_pod = sum(with_pod_val),
       with_build_id = sum(with_build_id_val),
       total = count()
     BY mode
   ```

### Option 4: Use Resource Attributes (If Available)

If your collector sets `resource.attributes.demo.mode`, you can use that instead:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
| EVAL 
    mode = COALESCE(resource.attributes.demo.mode, 
                    CASE(attributes.user_id IS NOT NULL, "firehose", "shaped")),
    with_user_id_val = CASE(attributes.user_id IS NOT NULL, 1, 0),
    with_pod_val = CASE(attributes.pod IS NOT NULL, 1, 0),
    with_build_id_val = CASE(attributes.build_id IS NOT NULL, 1, 0)
| STATS 
    with_user_id = sum(with_user_id_val),
    with_pod = sum(with_pod_val),
    with_build_id = sum(with_build_id_val),
    total = count()
  BY mode
```

## Expected Results

When both modes are present:
- **Firehose mode**: `with_user_id`, `with_pod`, `with_build_id` all > 0
- **Shaped mode**: `with_user_id`, `with_pod`, `with_build_id` all = 0 (labels removed)

## Quick Check: Do You Have Firehose Data?

Run this to see if you have any firehose data in the last hour:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 1h
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count() BY time_bucket = bucket(@timestamp, 5m)
| SORT time_bucket DESC
```

If this returns no results, you need to switch to firehose mode first.
