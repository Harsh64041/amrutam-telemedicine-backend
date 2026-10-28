const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { v4: uuidv4 } = require('uuid');

jest.setTimeout(30000);

describe('Amrutam Telemedicine Full Suite (All PDF Workflows & Idempotency)', () => {
  let patientToken, doctorToken, adminToken, doctorId, slotId, consultationId;
  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('1. Healthcheck returns 200 UP and X-Trace-Id header', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.headers['x-trace-id']).toBeDefined();
  });

  test('2. Register Doctor, Patient & Admin', async () => {
    const docRes = await request(app).post('/api/v1/auth/register').send({
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

    const patRes = await request(app).post('/api/v1/auth/register').send({
      email: `patient.${uniqueSuffix}@amrutam.co.in`,
      password: 'Password123!',
      role: 'patient',
      full_name: 'Rohan Verma',
    });
    expect(patRes.statusCode).toBe(201);

    const admRes = await request(app).post('/api/v1/auth/register').send({
      email: `admin.${uniqueSuffix}@amrutam.co.in`,
      password: 'Password123!',
      role: 'admin',
      full_name: 'Amrutam Admin',
    });
    expect(admRes.statusCode).toBe(201);
  });

  test('3. Login Users & Verify MFA Setup + Profile Lifecycle', async () => {
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

    const admLogin = await request(app).post('/api/v1/auth/login').send({
      email: `admin.${uniqueSuffix}@amrutam.co.in`,
      password: 'Password123!',
    });
    adminToken = admLogin.body.token;
    expect(adminToken).toBeDefined();

    // Setup MFA for Doctor
    const mfaRes = await request(app)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', uuidv4());
    expect(mfaRes.statusCode).toBe(200);
    expect(mfaRes.body.mfa_secret).toBeDefined();
  });

  test('4. Doctor creates availability slot & Search API filters doctors', async () => {
    const res = await request(app)
      .post('/api/v1/doctors/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        start_time: '2026-11-01T10:00:00Z',
        end_time: '2026-11-01T10:30:00Z',
      });
    expect(res.statusCode).toBe(201);
    slotId = res.body.slot.id;

    const searchRes = await request(app).get('/api/v1/doctors?specialization=Kayachikitsa&available=true');
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.body.doctors.length).toBeGreaterThan(0);
  });

  test('5. Patient books consultation, verifies Idempotent Replay & Async Job', async () => {
    const bookingIdemKey = uuidv4();

    const res1 = await request(app)
      .post('/api/v1/consultations/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', bookingIdemKey)
      .send({ doctor_id: doctorId, slot_id: slotId, notes: 'Chronic digestion issue' });
    expect(res1.statusCode).toBe(201);
    expect(res1.body.async_notification_job_id).toBeDefined();
    consultationId = res1.body.consultation.id;

    // Duplicate retry with same Idempotency-Key
    const res2 = await request(app)
      .post('/api/v1/consultations/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', bookingIdemKey)
      .send({ doctor_id: doctorId, slot_id: slotId, notes: 'Chronic digestion issue' });
    expect(res2.statusCode).toBe(201);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(res2.body.consultation.id).toBe(consultationId);
  });

  test('6. Consultation Lifecycle Transition & Prescription Issuance', async () => {
    const statusRes = await request(app)
      .patch(`/api/v1/consultations/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ status: 'in_progress' });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.body.consultation.status).toBe('in_progress');

    const presRes = await request(app)
      .post(`/api/v1/consultations/${consultationId}/prescribe`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        medications: [{ name: 'Amrutam Triphala Churna', dosage: '1 tsp warm water at night' }],
        instructions: 'Avoid spicy food for 14 days',
      });
    expect(presRes.statusCode).toBe(201);
    expect(presRes.body.consultation.status).toBe('completed');
  });

  test('7. Admin Analytics & Compliance Audit Trail Verification', async () => {
    const analyticsRes = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(analyticsRes.statusCode).toBe(200);
    expect(analyticsRes.body.total_revenue_inr).toBeGreaterThanOrEqual(750);
    expect(analyticsRes.body.recent_audit_logs).toBeDefined();
  });
});