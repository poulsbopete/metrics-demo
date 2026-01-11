# Elastic Demo Talk Track - Firehose to Shaped

**Duration:** 10-15 minutes  
**Audience:** Technical decision makers (SREs, DevOps, Observability Engineers)  
**Goal:** Prove that OpenTelemetry Collector shaping reduces cost/cardinality while preserving Service Level Objective-level metrics

---

## Pre-Demo Setup (Before Audience Arrives)

**What to say:** "I've got a live demo running with three microservices sending metrics to Elastic Serverless. Let me show you what's happening right now."

**Actions:**
1. Open Kibana → Discover
2. Set time range to "Last 15 minutes"
3. Filter: `service.name: ("frontend" OR "api" OR "worker")`
4. Verify documents are flowing

**Visual:** Show real-time metrics appearing in Discover.

---

## Act 1: The Firehose Problem (3-4 minutes)

### Opening Hook

**What to say:** "Most teams instrument their apps and send everything to their observability platform. That's what we call 'firehose mode'—just dump it all and hope the platform can handle it."

**Visual:** Show Discover with documents, expand one to show labels.

### Show the Labels

**What to say:** "Let's look at what we're sending. Every request gets labeled with user ID, full path with IDs, pod name, container name, instance, build ID—you name it."

**Actions:**
1. Expand a document in Discover
2. Point out: `attributes.user_id: user_1234`
3. Point out: `attributes.path: /orders/12345`
4. Point out: `attributes.pod: frontend-998fb5889-7h55j`
5. Point out: `attributes.build_id: build-123`

**Visual:** Highlight the high-cardinality labels.

### The Cardinality Explosion

**What to say:** "Here's the problem. Each unique combination of these labels creates a separate time series. With 10,000 users hitting 50 different paths, that's 500,000 time series. And that's just for one metric."

**Actions:**
1. Open Dev Tools → Console
2. Run ESQL query:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND attributes.user_id IS NOT NULL
| STATS series_count = count() BY attributes.user_id, attributes.path
| SORT series_count DESC
| LIMIT 50
```

**Visual:** Show 50+ unique combinations scrolling.

**What to say:** "And this is just the tip of the iceberg. We're seeing hundreds of unique combinations in the last 15 minutes alone."

### The Cost Impact

**What to say:** "Every time series costs money. More time series means higher storage costs, slower queries, and dashboard performance issues. Your SRE team is paying for labels they'll never use for alerting or dashboards."

**Question to ask:** "How many of you have seen your observability costs grow faster than your traffic? *[Wait for hands]* That's cardinality inflation."

**Visual:** If Stack Monitoring available, show metrics ingestion rate or time series count.

### The Competitive Contrast

**What to say:** "Most platforms tell you to 'just send less' or 'filter at query time.' But by then, you've already paid for storage and indexing. Elastic's approach is different—we shape metrics **before** they hit the platform, using the OpenTelemetry Collector."

---

## Act 2: The Shaping Solution (2-3 minutes)

### Introduce the Collector

**What to say:** "The OpenTelemetry Collector sits between your apps and Elastic. It's a data pipeline that can transform, filter, and aggregate metrics before they're exported."

**Visual:** Show architecture diagram (if available) or describe: `Apps → Collector → Elastic`

### Show the Configuration

**What to say:** "In shaped mode, we configure the collector to remove wasteful labels and normalize paths. Watch this."

**Actions:**
1. Show collector config (or describe):
   - Delete: `user_id`, `pod`, `container`, `instance`, `build_id`
   - Normalize: `/orders/12345` → `/orders/{id}`
2. Run switch command: `./scripts/switch-mode.sh shaped`

**What to say:** "I'm switching the collector to shaped mode. It'll restart and start applying these transformations."

**Visual:** Show terminal output or describe the process.

### Wait for Transition

**What to say:** "Give it about 60 seconds for the collector to restart and new metrics to start flowing with the shaped configuration."

**Actions:**
1. Wait 60 seconds
2. Refresh Discover
3. Filter: `@timestamp >= now()-3m` (recent metrics only)

**Question to ask:** "While we wait, what labels do you think you actually need for alerting? *[Wait for answers]* Usually it's service, method, route, status code—not user IDs or pod names."

---

## Act 3: The Transformation (3-4 minutes)

### Show Labels Removed

**What to say:** "Now let's look at the new metrics. Notice what's missing."

**Actions:**
1. Expand a recent document (last 3 minutes)
2. Point out: ❌ No `user_id`
3. Point out: ❌ No `pod`
4. Point out: ❌ No `build_id`
5. Point out: ✅ `path` is normalized: `/orders/{id}`

**Visual:** Side-by-side comparison (before/after documents).

**What to say:** "The collector removed the high-cardinality labels and normalized the paths. Same metrics, cleaner data."

### Prove Cardinality Dropped

**What to say:** "Let's prove the cardinality actually dropped."

**Actions:**
1. Run ESQL query (after shaping):
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS series_count = count() BY attributes.path
| SORT series_count DESC
| LIMIT 20
```

**Visual:** Show only 5-10 unique paths (normalized).

**What to say:** "Before: 100+ unique path combinations. After: 5-10 normalized paths. That's a 90% reduction in cardinality for this dimension alone."

### The Aha Moment

**What to say:** "Here's the key insight: **Same metrics. 50× fewer time series.**"

**Visual:** Show comparison table or side-by-side queries.

**Question to ask:** "How much would you save if you reduced your time series count by 90%? *[Let them calculate]* That's real money."

---

## Act 4: Metrics Preservation (3-4 minutes)

### The Gold Metrics

**What to say:** "But here's what really matters: did we lose any metrics? Let's check the four golden signals."

**Actions:**
1. Open "Golden Signals Overview" dashboard (or build it live)
2. Show each metric:
   - **Request Rate:** Requests per second
   - **Error Rate:** Percentage of errors
   - **Latency (P95):** 95th percentile latency
   - **Saturation:** Queue depth or CPU work units

**Visual:** Dashboard with 4 panels updating.

**What to say:** "All four golden signals are intact. We can still see request rate, error rate, latency, and saturation. Nothing was lost."

### Prove Request Rate Preserved

**What to say:** "Let's verify the request rate stayed consistent."

**Actions:**
1. Run ESQL:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
| STATS request_count = count() BY time_bucket = bucket(@timestamp, 1m)
| SORT time_bucket DESC
```

**Visual:** Show request counts per minute (should be similar before/after).

**What to say:** "Request counts are consistent. We didn't lose any data—we just removed labels we don't need."

### Prove Error Rate Preserved

**What to say:** "Same for error rate."

**Actions:**
1. Run ESQL:
```esql
FROM metrics-generic.otel-default
| WHERE @timestamp >= NOW() - 15m
  AND service.name == "frontend"
  AND (attributes.status_code LIKE "4*" OR attributes.status_code LIKE "5*")
| STATS error_count = count() BY time_bucket = bucket(@timestamp, 1m)
```

**Visual:** Show error counts (should match before/after if errors exist).

### The Operational Impact

**What to say:** "This isn't just about cost. Fewer time series means faster queries, more responsive dashboards, and alerts that don't fire on pod churn."

**Question to ask:** "How many of you have had alerts fire because a pod restarted and created a new time series? *[Wait for hands]* With shaped metrics, that doesn't happen."

### The Competitive Advantage

**What to say:** "This is where Elastic's approach differs. We don't just store everything and hope you filter it later. We give you tools to shape data **before** it hits the platform. That's pre-ingest shaping, and it's a game-changer for cost and performance."

**Visual:** Show cost comparison or time series count reduction.

---

## Closing (1-2 minutes)

### The Summary

**What to say:** "Let me summarize what we just saw:"

**Bullet points:**
1. ✅ **Metrics still arriving** — No data loss
2. ✅ **Cardinality dropped 90%+** — Fewer time series
3. ✅ **Request rate preserved** — Same visibility
4. ✅ **Error rate preserved** — Same visibility
5. ✅ **Core metrics intact** — All gold metrics working

**Visual:** Show summary slide or dashboard.

### The Value Proposition

**What to say:** "Same metrics. 50× fewer time series. Lower cost. Faster queries. That's the power of OpenTelemetry Collector shaping with Elastic."

**Question to ask:** "What would you do with 90% lower observability costs? *[Let them think]* You could instrument more services, keep more history, or just save money."

### The Call to Action

**What to say:** "This demo is open source and available on GitHub. You can run it yourself, see the code, and adapt it to your environment. The collector configurations are included, so you can start shaping your metrics today."

**Visual:** Show GitHub repo link or demo URL.

**Final question:** "What questions do you have about shaping metrics or reducing cardinality?"

---

## Handling Common Questions

### Q: "What if I need user_id for debugging?"
**A:** "Great question. You can keep user_id for specific metrics or use sampling. The key is being intentional—don't add it to every metric by default."

### Q: "Does this work with Prometheus?"
**A:** "Yes. The OpenTelemetry Collector can receive Prometheus metrics, shape them, and export to Elastic. Same principles apply."

### Q: "What about traces and logs?"
**A:** "This demo focuses on metrics, but the collector can shape traces and logs too. The same 'remove waste, preserve metrics' principle applies."

### Q: "How do I know what to remove?"
**A:** "Start with labels that change frequently but don't affect alerting: pod names, container IDs, instance IDs, build IDs. Keep service, method, route, status code."

### Q: "What if I remove too much?"
**A:** "That's why we have two modes. Start in firehose, see what you have, then gradually shape. You can always add labels back if needed."

---

## Visual Cues for Presenter

**When to pause:**
- After showing cardinality explosion (let it sink in)
- After switching to shaped mode (build anticipation)
- After showing metrics preservation (the "aha" moment)

**When to ask questions:**
- After showing high cardinality ("How many of you have seen this?")
- Before switching modes ("What labels do you actually need?")
- After showing results ("How much would you save?")

**When to emphasize:**
- "Same metrics. 50× fewer time series." (repeat 2-3 times)
- "Pre-ingest shaping" (differentiator)
- "90% reduction" (the number that matters)

---

## Demo Variations

### Short Version (5 minutes)
- Skip Act 1 deep dive
- Jump straight to Act 3 (show before/after)
- Focus on Act 4 (metrics preservation)

### Deep Dive Version (20 minutes)
- Add Act 0: Show collector configuration in detail
- Add Act 5: Show alert quality improvement
- Add Act 6: Show cost calculator or ROI

### Executive Version (3 minutes)
- Show dashboard only
- Explain: "Before: 10,000 time series. After: 200 time series. Same metrics."
- Show cost savings estimate

---

**Last Updated:** 2026-01-11  
**Talk Track Version:** 1.0
