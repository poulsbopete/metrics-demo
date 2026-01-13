# Time Series Reduction Query - Clear Savings Calculation

## Simplified Query (Recommended)

This query clearly shows the time series count for each mode and calculates the reduction percentage:

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

## Alternative: More Detailed Breakdown

If you want to see the breakdown by mode first, then calculate savings:

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
| STATS 
    firehose_max = max(CASE(mode == "firehose", series_count, null)),
    shaped_max = max(CASE(mode == "shaped", series_count, null))
| EVAL 
    firehose_series = firehose_max,
    shaped_series = shaped_max,
    reduction = firehose_max - shaped_max,
    reduction_pct = ROUND(((firehose_max - shaped_max) / firehose_max) * 100, 2),
    savings_message = CONCAT("Reduced from ", TO_STRING(firehose_max), " to ", TO_STRING(shaped_max), " series (", TO_STRING(reduction_pct), "% reduction)")
```

## Even Simpler: Direct Comparison

For the clearest view of savings:

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

## Notes

1. **Time Range**: Adjust `NOW() - 30m` based on when you switched modes
2. **Service**: Change `service.name == "frontend"` to compare other services or remove for all services
3. **Expected Results**:
   - Firehose: 1,000-10,000+ unique series
   - Shaped: 50-500 unique series  
   - Reduction: 90-98%

## Visualization Tips

For the stacked bar chart:
- **Vertical axis**: Use `firehose_series` and `shaped_series` (or `firehose_max` and `shaped_max`)
- **Chart type**: Stacked bar or grouped bar
- **Don't include** `reduction_pct` in the bar chart - show it as text or a separate metric

For a clearer savings visualization, consider:
- **Grouped bar chart**: Side-by-side comparison of firehose vs shaped
- **Gauge/KPI**: Show reduction percentage prominently
- **Text panel**: Display the savings message
