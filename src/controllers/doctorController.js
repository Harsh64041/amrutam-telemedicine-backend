const { pool, redis } = require('../config/db');
const { logAudit } = require('../middlewares/audit');

exports.createSlot = async (req, res) => {
  const { start_time, end_time } = req.body;
  if (!start_time || !end_time) {
    return res.status(400).json({ error: 'start_time and end_time are required' });
  }

  try {
    const docRes = await pool.query('SELECT id FROM doctors WHERE user_id = $1', [req.user.id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }
    const doctorId = docRes.rows[0].id;

    const slotRes = await pool.query(
      `INSERT INTO availability_slots (doctor_id, start_time, end_time)
       VALUES ($1, $2, $3) RETURNING *`,
      [doctorId, start_time, end_time]
    );

    if (redis) await redis.del(`doctors:search:*`);
    await logAudit(req.user.id, 'SLOT_CREATED', 'availability_slots', slotRes.rows[0].id, req.ip);

    res.status(201).json({ slot: slotRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create slot', details: err.message });
  }
};

exports.searchDoctors = async (req, res) => {
  const { specialization, available } = req.query;
  try {
    let docQuery = `
      SELECT d.id AS doctor_id, p.full_name, d.specialization, d.experience_years, d.consultation_fee, d.rating
      FROM doctors d
      JOIN profiles p ON d.user_id = p.user_id
    `;
    const params = [];
    if (specialization) {
      params.push(`%${specialization}%`);
      docQuery += ` WHERE d.specialization ILIKE $1`;
    }

    const docsRes = await pool.query(docQuery, params);
    const slotsRes = await pool.query(
      `SELECT id AS slot_id, doctor_id, start_time, end_time FROM availability_slots WHERE is_booked = false`
    );

    let doctors = docsRes.rows.map((doc) => ({
      ...doc,
      available_slots: slotsRes.rows.filter((s) => s.doctor_id === doc.doctor_id),
    }));

    if (available === 'true') {
      doctors = doctors.filter((d) => d.available_slots.length > 0);
    }

    res.status(200).json({ doctors });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search doctors', details: err.message });
  }
};