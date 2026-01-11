const express = require('express');
const axios = require('axios');
const { metrics } = require('@opentelemetry/api');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { NodeSDK } = require('@opentelemetry/sdk-node');

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
let requestCount = 0;

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

// Helper to normalize path
function normalizePath(path) {
  // Replace numeric IDs with {id}
  return path.replace(/\/\d+/g, '/{id}');
}

// Middleware to record metrics
app.use((req, res, next) => {
  const start = Date.now();
  requestCount++;

  // Generate labels based on mode
  const labels = {
    service: OTEL_SERVICE_NAME,
    method: req.method,
    route: req.route?.path || req.path,
    status_code: '200', // Will be updated in response
  };

  // Add high-cardinality labels in firehose mode or when enabled
  if (DEMO_MODE === 'firehose' || highCardinalityMode) {
    labels.user_id = getRandomUserId();
    labels.path = req.path; // Full path with IDs
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

    requestDuration.record(duration, labels);
    requestTotal.add(1, labels);

    if (res.statusCode >= 400) {
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
    requestCount,
    labels: {
      always: ['service', 'method', 'route', 'status_code'],
      firehose: ['user_id', 'path', 'pod', 'instance', 'container', 'build_id'],
    },
  });
});

app.get('/demo', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Elastic Metrics Demo - Frontend</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    .mode { padding: 10px; margin: 10px 0; border-radius: 5px; }
    .firehose { background-color: #ffebee; border-left: 4px solid #f44336; }
    .shaped { background-color: #e8f5e9; border-left: 4px solid #4caf50; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; font-size: 16px; }
    .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
    code { background: #e0e0e0; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Elastic Metrics Demo - Frontend Service</h1>
  
  <div class="mode ${DEMO_MODE === 'firehose' ? 'firehose' : 'shaped'}">
    <h2>Current Mode: ${DEMO_MODE.toUpperCase()}</h2>
    <p>High Cardinality Mode: <strong>${highCardinalityMode ? 'ON' : 'OFF'}</strong></p>
  </div>

  <div class="info">
    <h3>Metrics Emitted</h3>
    <ul>
      <li><code>http_request_duration_seconds</code> - Request latency histogram</li>
      <li><code>http_request_total</code> - Request counter</li>
      <li><code>http_error_total</code> - Error counter</li>
    </ul>
  </div>

  <div class="info">
    <h3>Labels (${DEMO_MODE === 'firehose' || highCardinalityMode ? 'High Cardinality' : 'Shaped'})</h3>
    <p><strong>Always present:</strong> service, method, route, status_code</p>
    ${DEMO_MODE === 'firehose' || highCardinalityMode ? `
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

    async function generateTraffic() {
      for (let i = 0; i < 10; i++) {
        fetch('/api/call', { method: 'GET' });
        await new Promise(r => setTimeout(r, 100));
      }
      alert('Generated 10 requests!');
    }
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
