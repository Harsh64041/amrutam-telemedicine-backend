const { pool } = require('../config/db');
const { logAudit } = require('../middlewares/audit');

exports.bookConsultation = async (req, res) => {
  const { doctor_id, slot_id, notes } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  if (!doctor_id || !slot_id) {
    return res.status(400).json({ error: 'doctor_id and slot_id are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slotRes = await client.query(
      `SELECT id, is_booked, doctor_id FROM availability_slots WHERE id = $1 FOR UPDATE`,
      [slot_id]
    );

    if (slotRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Availability slot not found' });
    }

    const slot = slotRes.rows[0];
    if (slot.is_booked) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Slot is already booked' });
    }

    const docRes = await client.query(`SELECT consultation_fee FROM doctors WHERE id = $1`, [doctor_id]);
    const fee = docRes.rows[0]?.consultation_fee || 500.0;

    await client.query(
      `UPDATE availability_slots SET is_booked = true, version = version + 1 WHERE id = $1`,
      [slot_id]
    );

    const consultRes = await client.query(
      `INSERT INTO consultations (patient_id, doctor_id, slot_id, status, notes)
       VALUES ($1, $2, $3, 'scheduled', $4) RETURNING *`,
      [req.user.id, doctor_id, slot_id, notes || null]
    );
    const consultation = consultRes.rows[0];

    await client.query(
      `INSERT INTO payments (consultation_id, amount, status, idempotency_key)
       VALUES ($1, $2, 'completed', $3)`,
      [consultation.id, fee, idempotencyKey]
    );

    await client.query('COMMIT');
    await logAudit(req.user.id, 'CONSULTATION_BOOKED', 'consultations', consultation.id, req.ip, {
      slot_id,
      doctor_id,
    });

    const asyncJobId =
      req.container && req.container.jobQueue
        ? req.container.jobQueue.enqueue('SEND_BOOKING_NOTIFICATION', {
            consultationId: consultation.id,
            patientId: req.user.id,
            doctorId: doctor_id,
          })
        : `job_${Date.now()}`;

    res.status(201).json({
      message: 'Consultation booked successfully',
      consultation,
      async_notification_job_id: asyncJobId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Booking failed', details: err.message });
  } finally {
    client.release();
  }
};

exports.updateConsultationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowedStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid consultation status' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const consultRes = await client.query(
      `UPDATE consultations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (consultRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Consultation not found' });
    }

    const consultation = consultRes.rows[0];
    if (status === 'cancelled' && consultation.slot_id) {
      await client.query(`UPDATE availability_slots SET is_booked = false WHERE id = $1`, [
        consultation.slot_id,
      ]);
    }

    await client.query('COMMIT');
    await logAudit(req.user.id, `CONSULTATION_${status.toUpperCase()}`, 'consultations', id, req.ip);

    res.status(200).json({ consultation });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to update consultation status', details: err.message });
  } finally {
    client.release();
  }
};

exports.completeAndPrescribe = async (req, res) => {
  const { id } = req.params;
  const { medications, instructions } = req.body;

  if (!medications || !Array.isArray(medications)) {
    return res.status(400).json({ error: 'medications array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const consultRes = await client.query(
      `UPDATE consultations SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (consultRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Consultation not found' });
    }

    const presRes = await client.query(
      `INSERT INTO prescriptions (consultation_id, medications, instructions)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, JSON.stringify(medications), instructions || '']
    );

    await client.query('COMMIT');
    await logAudit(req.user.id, 'PRESCRIPTION_ISSUED', 'prescriptions', presRes.rows[0].id, req.ip);

    if (req.container && req.container.jobQueue) {
      req.container.jobQueue.enqueue('GENERATE_PRESCRIPTION_REPORT', {
        prescriptionId: presRes.rows[0].id,
        consultationId: id,
        doctorId: req.user.id,
      });
    }

    res.status(201).json({
      consultation: consultRes.rows[0],
      prescription: presRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to issue prescription', details: err.message });
  } finally {
    client.release();
  }
};
