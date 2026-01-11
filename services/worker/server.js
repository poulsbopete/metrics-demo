const express = require('express');
const { metrics } = require('@opentelemetry/api');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-otlp-http');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 8080;
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'worker';
const DEMO_MODE = process.env.DEMO_MODE || 'firehose';
const ERROR_RATE = parseFloat(process.env.ERROR_RATE || '0.05'); // 5% error rate

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

const cpuWorkUnits = meter.createCounter('cpu_work_units', {
  description: 'CPU work units processed',
});

const queueDepth = meter.createUpDownCounter('queue_depth', {
  description: 'Current queue depth',
});

// Simulate queue depth
let currentQueueDepth = 0;
setInterval(() => {
  currentQueueDepth = Math.floor(Math.random() * 100);
  const labels = {
    service: OTEL_SERVICE_NAME,
  };
  if (DEMO_MODE === 'firehose') {
    labels.pod = process.env.HOSTNAME || 'unknown';
    labels.instance = process.env.HOSTNAME || 'unknown';
    labels.container = 'worker';
    labels.build_id = process.env.BUILD_ID || 'build-123';
  }
  queueDepth.add(currentQueueDepth - queueDepth.lastValue || 0, labels);
}, 2000);

// Helper to generate random user ID
function getRandomUserId() {
  return `user_${Math.floor(Math.random() * 10000)}`;
}

// Helper to normalize path
function normalizePath(path) {
  return path.replace(/\/\d+/g, '/{id}');
}

// Simulate CPU work
function simulateWork() {
  const start = Date.now();
  const iterations = Math.floor(Math.random() * 1000000);
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    sum += i;
  }
  return Date.now() - start;
}

// Middleware to record metrics
app.use((req, res, next) => {
  const start = Date.now();

  const labels = {
    service: OTEL_SERVICE_NAME,
    method: req.method,
    route: req.route?.path || req.path,
    status_code: '200',
  };

  if (DEMO_MODE === 'firehose') {
    labels.user_id = getRandomUserId();
    labels.path = req.path;
    labels.pod = process.env.HOSTNAME || 'unknown';
    labels.instance = process.env.HOSTNAME || 'unknown';
    labels.container = 'worker';
    labels.build_id = process.env.BUILD_ID || 'build-123';
  } else {
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
    errorRate: ERROR_RATE,
    queueDepth: currentQueueDepth,
    labels: {
      always: ['service', 'method', 'route', 'status_code'],
      firehose: ['user_id', 'path', 'pod', 'instance', 'container', 'build_id'],
    },
  });
});

app.get('/work', (req, res) => {
  const workDuration = simulateWork();
  const workUnits = Math.floor(workDuration / 10);

  const labels = {
    service: OTEL_SERVICE_NAME,
    operation: 'work',
  };

  if (DEMO_MODE === 'firehose') {
    labels.user_id = getRandomUserId();
    labels.pod = process.env.HOSTNAME || 'unknown';
    labels.instance = process.env.HOSTNAME || 'unknown';
    labels.container = 'worker';
    labels.build_id = process.env.BUILD_ID || 'build-123';
  }

  cpuWorkUnits.add(workUnits, labels);

  // Simulate occasional errors
  if (Math.random() < ERROR_RATE) {
    const errorLabels = { ...labels };
    errorLabels.error_type = 'simulated';
    errorTotal.add(1, errorLabels);
    return res.status(500).json({ success: false, error: 'Simulated error' });
  }

  res.json({
    success: true,
    workDuration,
    workUnits,
    queueDepth: currentQueueDepth,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Worker service listening on port ${PORT}`);
  console.log(`Demo mode: ${DEMO_MODE}`);
  console.log(`Error rate: ${ERROR_RATE * 100}%`);
});
