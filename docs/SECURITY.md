<a name="security-top"></a>

# 🛡️ Amrutam Telemedicine System — Security Checklist & Threat Model

A comprehensive **security architecture, threat model, and compliance framework** protecting patient health records (PHI), enforcing zero-trust access controls, and mitigating OWASP Top 10 vulnerabilities across the Amrutam Telemedicine platform.

---

## 1. OWASP Top 10 Mitigations

| Vulnerability | Mitigation Strategy Implemented |
| :--- | :--- |
| **A01: Broken Access Control** | Stateless JWT verification (`authenticate` middleware) paired with strict Role-Based Access Control (`authorize('patient', 'doctor', 'admin')`). Doctors cannot book slots; patients cannot issue prescriptions or access admin analytics. |
| **A02: Cryptographic Failures** | All passwords hashed using `bcryptjs` (10 salt rounds). Sensitive keys injected strictly via environment variables (`.env`), never hardcoded in source control. |
| **A03: Injection (SQLi / NoSQLi)** | 100% parameterized SQL queries (`$1, $2, $3`) executed via the `pg` driver pool. Request bodies validated and sanitized against strict `Joi` schemas before hitting controllers. |
| **A04: Insecure Design** | Mandatory `Idempotency-Key` header enforcement on all write endpoints (`POST`, `PUT`, `PATCH`) combined with PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) to prevent race-condition exploits and double-billing. |
| **A05: Security Misconfiguration** | Secured HTTP response headers via `helmet`, JSON request body size capped at `10kb` (`express.json({ limit: '10kb' })`) to prevent memory-exhaustion payloads, and CORS policies configured. |
| **A07: Identification & Auth Failures** | Brute-force protection enforced via `express-rate-limit` (200 requests per 15-minute window per IP) and schema support for TOTP Multi-Factor Authentication (`mfa_enabled`, `mfa_secret`). |
| **A08: Software & Data Integrity** | Automated `npm audit --audit-level=high` dependency vulnerability scanning integrated directly into the GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`). |
| **A09: Security Logging & Monitoring** | Immutable compliance audit trail table (`audit_logs`) recording actor ID, action type, entity ID, client IP address, and metadata alongside structured JSON logs via `Winston`. |

---

## 2. Attack Surface Analysis & Threat Modelling (STRIDE)

| Threat Category | Target Surface | Attack Scenario | Countermeasure |
| :--- | :--- | :--- | :--- |
| **Spoofing** | `/api/v1/auth/login` | Credential stuffing or token forgery to impersonate a doctor. | IP rate limiting, `bcrypt` hashing, and HMAC-SHA256 signed JWTs with expiration (`24h`). |
| **Tampering** | `/api/v1/consultations/:id/prescribe` | Unauthorized modification of issued medications or consultation records. | Strict `doctor` RBAC guard, parameterized SQL updates, and immutable `PRESCRIPTION_ISSUED` audit logs. |
| **Repudiation** | Consultation & Payment Workflows | A user denies booking a slot or issuing a prescription. | Every write action records an append-only row in `audit_logs` capturing `actor_id`, `ip_address`, and `created_at`. |
| **Information Disclosure** | Database & API Responses | Leakage of password hashes or internal stack traces in HTTP 500 responses. | Explicit column selection in SQL queries (excluding `password_hash`) and sanitized error payloads. |
| **Denial of Service (DoS)** | All Public API Endpoints | High-rate request flooding or oversized JSON payload attacks. | `express-rate-limit` throttling, `10kb` payload limit, and PostgreSQL connection pool timeouts. |
| **Elevation of Privilege** | `/api/v1/admin/analytics` | A patient attempting to self-assign the `admin` role or access revenue analytics. | Role claims verified directly from signed JWT payload inside `authorize('admin')` middleware. |

---

## 3. Data Classification Policy

| Classification Tier | Data Elements | Storage & Handling Controls |
| :--- | :--- | :--- |
| **Tier 1: Restricted (PHI / Secrets)** | `prescriptions.medications`, `consultations.notes`, `users.password_hash`, `users.mfa_secret`, `JWT_SECRET` | Encrypted at rest (AES-256 volume encryption) and in transit (TLS 1.3). Access restricted by strict RBAC and logged in `audit_logs`. |
| **Tier 2: Confidential (PII)** | `profiles.full_name`, `profiles.phone`, `profiles.dob`, `users.email`, `payments.amount` | Protected behind authenticated JWT boundaries; never exposed in public unauthenticated endpoints. |
| **Tier 3: Public / Operational** | `doctors.specialization`, `doctors.experience_years`, `availability_slots.start_time`, `/health` status | Publicly queryable via read-optimized endpoints with rate limiting applied. |

---

## 4. Encryption & Key Rotation Strategy

- **Encryption in Transit:** TLS 1.3 enforced at the API Gateway / Load Balancer ingress layer with HSTS enabled via `helmet`.
- **Encryption at Rest:** PostgreSQL data volumes, WAL archives on AWS S3, and Redis persistence snapshots encrypted using AWS KMS AES-256 keys.
- **Secrets & Key Rotation:**
  - Application secrets (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`) are injected exclusively through runtime environment variables.
  - **90-Day Rolling Key Rotation:** JWT signing keys support dual-key verification (`current_key`, `previous_key`) allowing zero-downtime key rotation every 90 days without invalidating active user sessions.

---

## 5. Compliance, Audit Trails & Dependency Scanning

- **Immutable Audit Logging:** All critical lifecycle events (`USER_REGISTERED`, `USER_LOGIN`, `SLOT_CREATED`, `CONSULTATION_BOOKED`, `PRESCRIPTION_ISSUED`) are recorded asynchronously into the `audit_logs` table with actor attribution, entity reference, IP address, and JSONB metadata.
- **Automated CI Dependency Scanning:** Every push and pull request to `main` triggers the GitHub Actions workflow (`.github/workflows/ci.yml`), which executes both the end-to-end integration test suite (`npm test`) and automated vulnerability scanning (`npm audit`).