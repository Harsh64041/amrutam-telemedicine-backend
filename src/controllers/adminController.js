const { pool } = require('../config/db');

exports.getAnalytics = async (req, res) => {
  try {
    const [usersCount, consultStats, revenueStats, recentAudits] = await Promise.all([
      pool.query(`SELECT role, COUNT(*)::int as count FROM users GROUP BY role`),
      pool.query(`SELECT status, COUNT(*)::int as count FROM consultations GROUP BY status`),
      pool.query(`SELECT COALESCE(SUM(amount), 0)::float as total_revenue FROM payments WHERE status = 'completed'`),
      pool.query(`SELECT action, entity_type, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10`),
    ]);

    res.status(200).json({
      users_by_role: usersCount.rows,
      consultations_by_status: consultStats.rows,
      total_revenue_inr: revenueStats.rows[0].total_revenue,
      recent_audit_logs: recentAudits.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load analytics', details: err.message });
  }
};