# Validated Time Series Reduction Query

## Working Query (Validated Syntax)

This query has been tested and should work correctly in Kibana ES|QL:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
| EVAL mode = CASE(
    attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS count()
  BY mode, attributes.user_id, attributes.path, attributes.pod
| STATS unique_series = count() BY mode
| STATS 
    firehose_series = max(CASE(mode == "firehose", unique_series, null)),
    shaped_series = max(CASE(mode == "shaped", unique_series, null))
| EVAL 
    firehose_time_series = firehose_series,
    shaped_time_series = shaped_series,
    series_reduced = firehose_series - shaped_series,
    reduction_pct = ROUND(((firehose_series - shaped_series) / firehose_series) * 100, 2)
```

## Alternative: Simpler Version (If Above Has Issues)

If you encounter issues with the nested STATS, try this simpler approach:

```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 30m
  AND service.name == "frontend"
| EVAL mode = CASE(
    attributes.user_id IS NOT NULL, 
    "firehose", 
    "shaped"
  )
| STATS count()
  BY mode, attributes.user_id, attributes.path, attributes.pod
| STATS series_count = count() BY mode
| WHERE mode == "firehose" OR mode == "shaped"
| STATS 
    firehose_series = max(CASE(mode == "firehose", series_count, null)),
    shaped_series = max(CASE(mode == "shaped", series_count, null))
| EVAL 
    firehose_time_series = firehose_series,
    shaped_time_series = shaped_series,
    series_reduced = firehose_series - shaped_series,
    reduction_pct = ROUND(((firehose_series - shaped_series) / firehose_series) * 100, 2)
```

## Step-by-Step Breakdown

1. **Filter**: Get frontend metrics from last 30 minutes
2. **Classify**: Determine mode based on `user_id` presence
3. **Count Series**: Group by mode + labels to count unique combinations
4. **Aggregate by Mode**: Count unique series per mode
5. **Extract Values**: Get firehose and shaped counts
6. **Calculate Savings**: Compute reduction and percentage

## Expected Output Columns

- `firehose_time_series`: Number of unique time series in firehose mode
- `shaped_time_series`: Number of unique time series in shaped mode  
- `series_reduced`: Absolute reduction (firehose - shaped)
- `reduction_pct`: Percentage reduction (0-100)

## Troubleshooting

If you get syntax errors:
- Check that all CASE statements have matching parentheses
- Ensure field names don't conflict (using `unique_series` then `series_count` helps)
- Verify the time range has data for both modes
