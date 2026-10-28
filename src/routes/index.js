const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const doctorController = require('../controllers/doctorController');
const consultationController = require('../controllers/consultationController');
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requireIdempotency } = require('../middlewares/idempotency');

const router = express.Router();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(apiLimiter);

// 1. Auth & User Lifecycle
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// 2. Doctor Availability & Search
router.get('/doctors', doctorController.searchDoctors);
router.post(
  '/doctors/slots',
  authenticate,
  authorize('doctor'),
  requireIdempotency,
  doctorController.createSlot
);

// 3. Consultation Booking & Prescriptions (Idempotency Enforced)
router.post(
  '/consultations/book',
  authenticate,
  authorize('patient'),
  requireIdempotency,
  consultationController.bookConsultation
);
router.post(
  '/consultations/:id/prescribe',
  authenticate,
  authorize('doctor'),
  requireIdempotency,
  consultationController.completeAndPrescribe
);

// 4. Admin Analytics & Compliance
router.get('/admin/analytics', authenticate, authorize('admin'), adminController.getAnalytics);

module.exports = router;