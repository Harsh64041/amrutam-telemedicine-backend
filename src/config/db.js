const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

let activePool = null;
let redis = null;

function createInMemoryPool() {
  const { newDb } = require('pg-mem');
  const db = newDb();

  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: 'uuid',
    implementation: () => uuidv4(),
    impure: true,
  });

  const initSqlPath = path.join(__dirname, '../../sql/init.sql');
  const rawSql = fs
    .readFileSync(initSqlPath, 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, '');
  db.public.none(rawSql);

  // Seed 1 Demo Doctor & Slot so /api/v1/doctors looks great in browser
  const demoUserId = uuidv4();
  const demoDocId = uuidv4();
  db.public.none(`
    INSERT INTO users (id, email, password_hash, role)
    VALUES ('${demoUserId}', 'dr.sharma@amrutam.co.in', '$2a$10$abcdefghijklmnopqrstuv', 'doctor');
    INSERT INTO profiles (user_id, full_name, phone)
    VALUES ('${demoUserId}', 'Dr. Dhanvantari Sharma (BAMS)', '+91-9876543210');
    INSERT INTO doctors (id, user_id, specialization, experience_years, consultation_fee, rating)
    VALUES ('${demoDocId}', '${demoUserId}', 'Kayachikitsa (Ayurvedic Internal Medicine)', 12, 750.00, 4.90);
    INSERT INTO availability_slots (doctor_id, start_time, end_time, is_booked)
    VALUES ('${demoDocId}', '2026-10-29T10:00:00Z', '2026-10-29T10:30:00Z', false);
  `);

  const { Pool: MemPool } = db.adapters.createPg();
  return new MemPool();
}

// Create resilient pool wrapper that falls back to in-memory DB if Docker is off
const pgPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://amrutam_user:amrutam_pass@127.0.0.1:5432/amrutam_db',
  connectionTimeoutMillis: 1500,
});

let fallbackPool = null;
async function getWorkingPool() {
  if (activePool) return activePool;
  try {
    const client = await pgPool.connect();
    client.release();
    activePool = pgPool;
    return activePool;
  } catch (err) {
    if (!fallbackPool) {
      fallbackPool = createInMemoryPool();
    }
    activePool = fallbackPool;
    return activePool;
  }
}

const pool = {
  query: async (...args) => {
    const p = await getWorkingPool();
    return p.query(...args);
  },
  connect: async () => {
    const p = await getWorkingPool();
    return p.connect();
  },
  end: async () => {
    if (activePool && activePool.end) await activePool.end();
  },
};

module.exports = { pool, redis };