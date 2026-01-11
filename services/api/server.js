const express = require('express');
const axios = require('axios');
const { metrics } = require('@opentelemetry/api');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { NodeSDK } = require('@opentelemetry/sdk-node');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 8080;
const WORKER_URL = process.env.WORKER_URL || 'http://worker:8080';
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'api';
const DEMO_MODE = process.env.DEMO_MODE || 'firehose';

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
  return path.replace(/\/\d+/g, '/{id}');
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
    labels.container = 'api';
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
    labels: {
      always: ['service', 'method', 'route', 'status_code'],
      firehose: ['user_id', 'path', 'pod', 'instance', 'container', 'build_id'],
    },
  });
});

app.get('/process', async (req, res) => {
  try {
    const response = await axios.get(`${WORKER_URL}/work`, {
      timeout: 5000,
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API service listening on port ${PORT}`);
  console.log(`Demo mode: ${DEMO_MODE}`);
});
