const { pool, redis } = require('../config/db');
const { logger } = require('../config/logger');

const requireIdempotency = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'Idempotency-Key header is required for write operations',
    });
  }

  const compositeKey = `idem:${req.user ? req.user.id : 'anon'}:${idempotencyKey}`;

  try {
    // 1. Check Redis Cache First (Fast Path)
    if (redis) {
      const cached = await redis.get(compositeKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(parsed.status).json(parsed.body);
      }
    }

    // 2. Check PostgreSQL Persistent Fallback
    const dbCheck = await pool.query(
      'SELECT response_status, response_body FROM idempotency_records WHERE key = $1',
      [compositeKey]
    );

    if (dbCheck.rows.length > 0) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return res
        .status(dbCheck.rows[0].response_status)
        .json(dbCheck.rows[0].response_body);
    }

    // Intercept res.json to store the result before returning
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await pool.query(
            `INSERT INTO idempotency_records (key, user_id, response_status, response_body)
             VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING`,
            [compositeKey, req.user ? req.user.id : null, res.statusCode, body]
          );
          if (redis) {
            await redis.set(
              compositeKey,
              JSON.stringify({ status: res.statusCode, body }),
              'EX',
              86400
            );
          }
        } catch (err) {
          logger.error('Failed to save idempotency record', { error: err.message });
        }
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    logger.error('Idempotency middleware error', { error: err.message });
    next(err);
  }
};

module.exports = { requireIdempotency };