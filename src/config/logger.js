const winston = require('winston');
const client = require('prom-client');

// Structured JSON Logger for Observability
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'amrutam-telemedicine-api' },
  transports: [new winston.transports.Console()],
});

// Prometheus Metrics Setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 500, 1000],
});
register.registerMetric(httpRequestDurationMicroseconds);

module.exports = { logger, register, httpRequestDurationMicroseconds };