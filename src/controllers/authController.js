const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { pool } = require('../config/db');
const { logAudit } = require('../middlewares/audit');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('patient', 'doctor', 'admin').default('patient'),
  full_name: Joi.string().min(2).required(),
  phone: Joi.string().optional(),
  specialization: Joi.string().when('role', { is: 'doctor', then: Joi.required() }),
  experience_years: Joi.number().integer().min(0).default(1),
  consultation_fee: Joi.number().positive().default(500),
});

exports.register = async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [value.email]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(value.password, 10);
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role`,
      [value.email, passwordHash, value.role]
    );
    const user = userRes.rows[0];

    await client.query(
      `INSERT INTO profiles (user_id, full_name, phone) VALUES ($1, $2, $3)`,
      [user.id, value.full_name, value.phone || null]
    );

    let doctorId = null;
    if (value.role === 'doctor') {
      const docRes = await client.query(
        `INSERT INTO doctors (user_id, specialization, experience_years, consultation_fee)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [user.id, value.specialization, value.experience_years, value.consultation_fee]
      );
      doctorId = docRes.rows[0].id;
    }

    await client.query('COMMIT');
    await logAudit(user.id, 'USER_REGISTERED', 'users', user.id, req.ip, { role: user.role });

    res.status(201).json({
      message: 'User registered successfully',
      user: { ...user, doctor_id: doctorId },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Registration failed', details: err.message });
  } finally {
    client.release();
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = userRes.rows[0];
    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    await logAudit(user.id, 'USER_LOGIN', 'users', user.id, req.ip);
    res.status(200).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
};