const { pool } = require('../config/db');
const { logger } = require('../config/logger');

const logAudit = async (actorId, action, entityType, entityId, ipAddress, metadata = {}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, action, entityType, String(entityId), ipAddress, JSON.stringify(metadata)]
    );
  } catch (err) {
    logger.error('Audit log insert failed', { error: err.message });
  }
};

module.exports = { logAudit };