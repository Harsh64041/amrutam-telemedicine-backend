require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const routes = require('./routes');
const { logger, register, httpRequestDurationMicroseconds } = require('./config/logger');

const app = express();

// Security & Performance Middlewares
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10kb' }));

// Observability Middleware (Metrics + Structured Logging)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDurationMicroseconds
      .labels(req.method, req.route ? req.route.path : req.path, res.statusCode)
      .observe(duration);
    logger.info('HTTP Request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
    });
  });
  next();
});

// Health & Prometheus Metrics Endpoints
app.get('/health', (req, res) => res.status(200).json({ status: 'UP', timestamp: new Date() }));
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Main V1 Routes
app.use('/api/v1', routes);

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Amrutam Telemedicine Backend running on port ${PORT}`);
  });
}

module.exports = app;