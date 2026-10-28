const EventEmitter = require('events');
const { logger } = require('../config/logger');

class AsyncJobQueue extends EventEmitter {
  constructor(auditLogger) {
    super();
    this.auditLogger = auditLogger;
    this.queue = [];
    this.registerWorkers();
  }

  enqueue(jobName, payload) {
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: jobName,
      payload,
      enqueuedAt: new Date().toISOString(),
    };
    this.queue.push(job);
    setImmediate(() => this.emit('process', job));
    return job.id;
  }

  registerWorkers() {
    this.on('process', async (job) => {
      try {
        logger.info('Processing async background job', { jobId: job.id, type: job.name });
        if (job.name === 'SEND_BOOKING_NOTIFICATION' && this.auditLogger) {
          await this.auditLogger(
            job.payload.patientId,
            'ASYNC_NOTIFICATION_DISPATCHED',
            'consultations',
            job.payload.consultationId,
            '127.0.0.1',
            { channel: 'email_sms', doctorId: job.payload.doctorId }
          );
        }
        if (job.name === 'GENERATE_PRESCRIPTION_REPORT' && this.auditLogger) {
          await this.auditLogger(
            job.payload.doctorId,
            'ASYNC_PRESCRIPTION_PDF_GENERATED',
            'prescriptions',
            job.payload.prescriptionId,
            '127.0.0.1',
            { consultationId: job.payload.consultationId }
          );
        }
      } catch (err) {
        logger.error('Async job failed', { jobId: job.id, error: err.message });
      }
    });
  }
}

const createContainer = ({ pool, redis, logAudit }) => {
  const jobQueue = new AsyncJobQueue(logAudit);
  return { pool, redis, logAudit, jobQueue };
};

module.exports = { AsyncJobQueue, createContainer };
