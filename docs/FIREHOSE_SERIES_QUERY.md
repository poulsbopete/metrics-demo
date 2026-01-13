# Firehose Unique Series Count Query

## Working ES|QL Query

**Recommended (Last 15 minutes):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

**Historical Range (15-30 minutes ago):**
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND @timestamp < NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

**Note:** The historical range query may return no results if:
- Metrics weren't being generated during that time period
- Data is still being indexed
- The demo was just started

## Alternative: More Detailed Version

If you want to see the breakdown by service or get more details:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND @timestamp < NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS series_count = count()
  BY service.name, attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count() BY service.name
```

## Simplified Version (Last 15 minutes)

If you want to count all unique series in the last 15 minutes:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS count()
  BY attributes.user_id, attributes.path, attributes.pod
| STATS firehose_series = count()
```

## Notes

1. **Time Range**: 
   - **Recommended**: Use `NOW() - 15m` for the most recent data (most reliable)
   - **Historical**: Use `NOW() - 30m` to `NOW() - 15m` if you want to look at older data (may return no results if demo just started)

2. **Field References**: `attributes.user_id`, `attributes.path`, and `attributes.pod` should work as-is in ES|QL.

3. **Two-Stage STATS**: 
   - First STATS groups by the label combinations (creates one row per unique combination)
   - Second STATS counts those rows (gives you the total unique series count)

4. **Expected Results**: In Firehose mode, you should see a high number (1000-10000+ unique series depending on traffic volume).

5. **Why the time range matters**: 
   - Metrics take 1-5 minutes to be indexed in Elastic
   - If the demo just started, data from 15-30 minutes ago won't exist
   - Using `NOW() - 15m` ensures you're looking at data that definitely exists
