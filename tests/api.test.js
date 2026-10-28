const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { v4: uuidv4 } = require('uuid');

// Set 30s timeout so Docker DB cold-start or bcrypt hashing never times out
jest.setTimeout(30000);

describe('Amrutam Telemedicine Core Workflows & Idempotency', () => {
  let patientToken, doctorToken, doctorId, slotId, consultationId;
  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    // Warm up database connection before running tests
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('1. Healthcheck endpoint returns 200 UP', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('UP');
  });

  test('2. Register Doctor & Patient', async () => {
    const docRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `dr.${uniqueSuffix}@amrutam.co.in`,
        password: 'Password123!',
        role: 'doctor',
        full_name: 'Dr. Ayurveda Sharma',
        specialization: 'Kayachikitsa',
        experience_years: 8,
        consultation_fee: 750,
      });
    expect(docRes.statusCode).toBe(201);
    doctorId = docRes.body.user.doctor_id;

    const patRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `patient.${uniqueSuffix}@amrutam.co.in`,
        password: 'Password123!',
        role: 'patient',
        full_name: 'Rohan Verma',
      });
    expect(patRes.statusCode).toBe(201);
  });

  test('3. Login Doctor & Patient to obtain JWTs', async () => {
    const docLogin = await request(app).post('/api/v1/auth/login').send({
      email: `dr.${uniqueSuffix}@amrutam.co.in`,
      password: 'Password123!',
    });
    doctorToken = docLogin.body.token;
    expect(doctorToken).toBeDefined();

    const patLogin = await request(app).post('/api/v1/auth/login').send({
      email: `patient.${uniqueSuffix}@amrutam.co.in`,
      password: 'Password123!',
    });
    patientToken = patLogin.body.token;
    expect(patientToken).toBeDefined();
  });

  test('4. Doctor creates availability slot with Idempotency-Key', async () => {
    const idemKey = uuidv4();
    const res = await request(app)
      .post('/api/v1/doctors/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', idemKey)
      .send({
        start_time: '2026-11-01T10:00:00Z',
        end_time: '2026-11-01T10:30:00Z',
      });
    expect(res.statusCode).toBe(201);
    slotId = res.body.slot.id;
  });

  test('5. Patient books consultation & verifies Idempotent Replay', async () => {
    const bookingIdemKey = uuidv4();

    // First Request
    const res1 = await request(app)
      .post('/api/v1/consultations/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', bookingIdemKey)
      .send({ doctor_id: doctorId, slot_id: slotId, notes: 'Chronic digestion issue' });
    expect(res1.statusCode).toBe(201);
    consultationId = res1.body.consultation.id;

    // Duplicate Retry with SAME Idempotency-Key returns cached 201 without double-charging
    const res2 = await request(app)
      .post('/api/v1/consultations/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', bookingIdemKey)
      .send({ doctor_id: doctorId, slot_id: slotId, notes: 'Chronic digestion issue' });
    expect(res2.statusCode).toBe(201);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(res2.body.consultation.id).toBe(consultationId);
  });
});