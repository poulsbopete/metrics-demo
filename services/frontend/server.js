const express = require('express');
const axios = require('axios');
const { metrics } = require('@opentelemetry/api');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 8080;
const API_URL = process.env.API_URL || 'http://api:8080';
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'frontend';
const DEMO_MODE = process.env.DEMO_MODE || 'firehose';

// Track high-cardinality state
let highCardinalityMode = false;
let cardinalityBombMode = false; // Activated via ?bomb=1
let requestCount = 0;
let errorCount = 0;
let totalDuration = 0;
let durationSamples = []; // For p95 calculation

// Initialize OpenTelemetry
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: OTEL_SERVICE_NAME,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.DEPLOYMENT_ENVIRONMENT || 'demo',
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
});

const metricExporter = new OTLPMetricExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const meterProvider = new MeterProvider({
  resource,
  readers: [
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 5000,
    }),
  ],
});

metrics.setGlobalMeterProvider(meterProvider);

const meter = metrics.getMeter(OTEL_SERVICE_NAME, '1.0.0');

// Create metrics
const requestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  unit: 's',
});

const requestTotal = meter.createCounter('http_request_total', {
  description: 'Total HTTP requests',
});

const errorTotal = meter.createCounter('http_error_total', {
  description: 'Total HTTP errors',
});

// Helper to generate random user ID
function getRandomUserId() {
  return `user_${Math.floor(Math.random() * 10000)}`;
}

// Helper to extract path_id from path (numeric IDs)
function extractPathId(path) {
  const match = path.match(/\/(\d+)/);
  return match ? match[1] : null;
}

// Helper to normalize path
function normalizePath(path) {
  // Replace numeric IDs with {id}
  return path.replace(/\/\d+/g, '/{id}');
}

// Middleware to record metrics
app.use((req, res, next) => {
  const start = Date.now();
  requestCount++;

  // Check for cardinality bomb mode from query param
  const bombMode = req.query.bomb === '1' || cardinalityBombMode;

  // Generate labels based on mode
  const labels = {
    service: OTEL_SERVICE_NAME,
    method: req.method,
    route: req.route?.path || req.path,
    status_code: '200', // Will be updated in response
  };

  // Add high-cardinality labels in firehose mode or when enabled
  if (DEMO_MODE === 'firehose' || highCardinalityMode || bombMode) {
    labels.user_id = getRandomUserId();
    labels.path = req.path; // Full path with IDs
    
    // Cardinality bomb: add path_id extracted from path
    if (bombMode) {
      const pathId = extractPathId(req.path);
      if (pathId) {
        labels.path_id = pathId;
      }
    }
    
    labels.pod = process.env.HOSTNAME || 'unknown';
    labels.instance = process.env.HOSTNAME || 'unknown';
    labels.container = 'frontend';
    labels.build_id = process.env.BUILD_ID || 'build-123';
  } else {
    // Shaped mode: normalize path
    labels.path = normalizePath(req.path);
  }

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    labels.status_code = res.statusCode.toString();

    // Track for gold metrics
    totalDuration += duration;
    durationSamples.push(duration);
    // Keep only last 1000 samples for p95 calculation
    if (durationSamples.length > 1000) {
      durationSamples.shift();
    }

    requestDuration.record(duration, labels);
    requestTotal.add(1, labels);

    if (res.statusCode >= 400) {
      errorCount++;
      errorTotal.add(1, labels);
    }
  });

  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: OTEL_SERVICE_NAME });
});

app.get('/status', (req, res) => {
  res.json({
    service: OTEL_SERVICE_NAME,
    mode: DEMO_MODE,
    highCardinalityMode,
    cardinalityBombMode,
    requestCount,
    labels: {
      always: ['service', 'method', 'route', 'status_code'],
      firehose: ['user_id', 'path', 'pod', 'instance', 'container', 'build_id'],
      bomb: ['user_id', 'path', 'path_id', 'pod', 'instance', 'container', 'build_id'],
    },
  });
});

// Gold metrics endpoint
app.get('/gold-metrics', (req, res) => {
  const now = Date.now();
  const timeWindow = 60000; // 1 minute window
  const recentSamples = durationSamples.slice(-100); // Last 100 samples
  
  // Calculate p95 latency
  let p95Latency = 0;
  if (recentSamples.length > 0) {
    const sorted = [...recentSamples].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    p95Latency = sorted[p95Index] || 0;
  }

  // Request rate (requests per second, estimated from last minute)
  const requestRate = requestCount > 0 ? (requestCount / (now / 1000)) : 0;

  // Error rate (percentage)
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

  // Saturation (average latency as proxy, or queue depth if available)
  const avgLatency = durationSamples.length > 0 
    ? durationSamples.reduce((a, b) => a + b, 0) / durationSamples.length 
    : 0;
  const saturation = Math.min(100, (avgLatency / 1.0) * 100); // Normalize to 1s = 100%

  res.json({
    request_rate: requestRate.toFixed(2),
    error_rate: errorRate.toFixed(2),
    p95_latency_ms: (p95Latency * 1000).toFixed(2),
    saturation: saturation.toFixed(1),
    timestamp: new Date().toISOString(),
  });
});

app.get('/demo', (req, res) => {
  // Check for cardinality bomb mode
  const bombMode = req.query.bomb === '1';
  if (bombMode) {
    cardinalityBombMode = true;
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Elastic Metrics Demo - Frontend</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1000px; margin: 50px auto; padding: 20px; }
    .mode { padding: 10px; margin: 10px 0; border-radius: 5px; }
    .firehose { background-color: #ffebee; border-left: 4px solid #f44336; }
    .shaped { background-color: #e8f5e9; border-left: 4px solid #4caf50; }
    .bomb { background-color: #fff3e0; border-left: 4px solid #ff9800; animation: pulse 2s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; font-size: 16px; }
    .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
    .gold-metrics { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .gold-metrics h3 { margin-top: 0; color: white; }
    .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 15px; }
    .metric-card { background: rgba(255, 255, 255, 0.2); padding: 15px; border-radius: 5px; backdrop-filter: blur(10px); }
    .metric-value { font-size: 32px; font-weight: bold; margin: 10px 0; }
    .metric-label { font-size: 14px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
    code { background: #e0e0e0; padding: 2px 6px; border-radius: 3px; }
    .bomb-warning { background: #ffebee; border: 2px solid #f44336; padding: 15px; border-radius: 5px; margin: 10px 0; }
    .bomb-warning strong { color: #d32f2f; }
  </style>
</head>
<body>
  <h1>Elastic Metrics Demo - Frontend Service</h1>
  
  <div class="mode ${bombMode || cardinalityBombMode ? 'bomb' : DEMO_MODE === 'firehose' ? 'firehose' : 'shaped'}">
    <h2>Current Mode: ${bombMode || cardinalityBombMode ? 'CARDINALITY BOMB 💣' : DEMO_MODE.toUpperCase()}</h2>
    <p>High Cardinality Mode: <strong>${highCardinalityMode ? 'ON' : 'OFF'}</strong></p>
    ${bombMode || cardinalityBombMode ? '<p><strong>💣 BOMB ACTIVE:</strong> Adding user_id + path_id to every metric → 10× more time series!</p>' : ''}
  </div>

  ${bombMode || cardinalityBombMode ? `
  <div class="bomb-warning">
    <strong>⚠️ CARDINALITY BOMB ACTIVE</strong>
    <p>Every request now includes <code>user_id</code> + <code>path_id</code> labels, creating 10× more time series!</p>
    <p>Click the button below to see the impact, then check Elastic to see the explosion of unique time series.</p>
  </div>
  ` : ''}

  <div class="info">
    <h3>Metrics Emitted</h3>
    <ul>
      <li><code>http_request_duration_seconds</code> - Request latency histogram</li>
      <li><code>http_request_total</code> - Request counter</li>
      <li><code>http_error_total</code> - Error counter</li>
    </ul>
  </div>

  <div class="gold-metrics">
    <h3>🎯 Gold Metrics Only</h3>
    <p style="opacity: 0.9; margin-bottom: 15px;">The four key metrics that matter for SLO monitoring. Signal preserved, cardinality reduced.</p>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Request Rate</div>
        <div class="metric-value" id="request-rate">-</div>
        <div style="font-size: 12px; opacity: 0.8;">req/sec</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Error Rate</div>
        <div class="metric-value" id="error-rate">-</div>
        <div style="font-size: 12px; opacity: 0.8;">%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">P95 Latency</div>
        <div class="metric-value" id="p95-latency">-</div>
        <div style="font-size: 12px; opacity: 0.8;">ms</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Saturation</div>
        <div class="metric-value" id="saturation">-</div>
        <div style="font-size: 12px; opacity: 0.8;">%</div>
      </div>
    </div>
  </div>

  <div class="info">
    <h3>Labels (${bombMode || cardinalityBombMode ? 'BOMB MODE' : DEMO_MODE === 'firehose' || highCardinalityMode ? 'High Cardinality' : 'Shaped'})</h3>
    <p><strong>Always present:</strong> service, method, route, status_code</p>
    ${bombMode || cardinalityBombMode ? `
    <p><strong>💣 BOMB labels:</strong> user_id, path (full), path_id, pod, instance, container, build_id</p>
    <p>⚠️ <strong>10× more time series!</strong> Every request gets unique user_id + path_id combination.</p>
    ` : DEMO_MODE === 'firehose' || highCardinalityMode ? `
    <p><strong>High-cardinality labels:</strong> user_id, path (full), pod, instance, container, build_id</p>
    <p>⚠️ These labels create thousands of time series!</p>
    ` : `
    <p><strong>Shaped labels:</strong> path (normalized, e.g., /orders/{id})</p>
    <p>✅ Cardinality reduced by ~95%</p>
    `}
  </div>

  <div>
    <h3>Actions</h3>
    <button onclick="toggleCardinality()">Toggle High Cardinality Mode</button>
    <button onclick="activateBomb()" style="background: #ff9800; color: white; border: none;">💣 Activate Cardinality Bomb</button>
    <button onclick="generateTraffic()">Generate Sample Traffic</button>
    <button onclick="location.reload()">Refresh</button>
  </div>

  <div class="info">
    <h3>Service Status</h3>
    <p>Total Requests: <strong>${requestCount}</strong></p>
    <p>API URL: <code>${API_URL}</code></p>
    <p>OTel Collector: <code>${OTEL_EXPORTER_OTLP_ENDPOINT}</code></p>
  </div>

  <script>
    async function toggleCardinality() {
      const response = await fetch('/toggle-cardinality', { method: 'POST' });
      const data = await response.json();
      location.reload();
    }

    function activateBomb() {
      window.location.href = window.location.pathname + '?bomb=1';
    }

    async function generateTraffic() {
      for (let i = 0; i < 10; i++) {
        fetch('/api/call', { method: 'GET' });
        await new Promise(r => setTimeout(r, 100));
      }
      alert('Generated 10 requests!');
    }

    // Update gold metrics every 2 seconds
    async function updateGoldMetrics() {
      try {
        const response = await fetch('/gold-metrics');
        const data = await response.json();
        document.getElementById('request-rate').textContent = parseFloat(data.request_rate).toFixed(1);
        document.getElementById('error-rate').textContent = parseFloat(data.error_rate).toFixed(2);
        document.getElementById('p95-latency').textContent = parseFloat(data.p95_latency_ms).toFixed(0);
        document.getElementById('saturation').textContent = parseFloat(data.saturation).toFixed(1);
      } catch (error) {
        console.error('Failed to fetch gold metrics:', error);
      }
    }

    // Update immediately and then every 2 seconds
    updateGoldMetrics();
    setInterval(updateGoldMetrics, 2000);
  </script>
</body>
</html>
  `);
});

app.post('/toggle-cardinality', (req, res) => {
  highCardinalityMode = !highCardinalityMode;
  res.json({ highCardinalityMode });
});

app.get('/api/call', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/process`, {
      timeout: 5000,
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend service listening on port ${PORT}`);
  console.log(`Demo mode: ${DEMO_MODE}`);
  console.log(`OTel endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT}`);
});
