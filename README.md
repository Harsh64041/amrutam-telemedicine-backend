<a name="readme-top"></a>

# 🏥 Amrutam Production-Grade Telemedicine Backend System

A **scalable, fault-tolerant, and containerized backend architecture** engineered to handle **100,000+ daily telemedicine consultations, real-time slot bookings, digital prescriptions, and compliance audit trails** using **Node.js, Express.js, PostgreSQL, Redis**, and **Docker**.

---

## 🔗 Live Links & Documentation

📂 **GitHub Repository:** [https://github.com/Harsh64041/amrutam-telemedicine-backend](https://github.com/Harsh64041/amrutam-telemedicine-backend)  
📐 **System Architecture & Diagrams:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
🛡️ **Security Checklist & Threat Model:** [docs/SECURITY.md](./docs/SECURITY.md)  
📜 **OpenAPI 3.0 Specification:** [docs/openapi.yaml](./docs/openapi.yaml)  

> 💡 **Important Note Regarding API Endpoints:**  
> When running the server locally on `http://localhost:3000`, visiting the root URL (`/`) directly will not display a webpage as this is a pure headless REST API service. To verify live server status, observability metrics, and database queries directly in your browser, visit:
> - **Health Check:** `http://localhost:3000/health`
> - **Prometheus Metrics:** `http://localhost:3000/metrics`
> - **Doctor Directory API:** `http://localhost:3000/api/v1/doctors`

---

## 📌 About The Project

**Amrutam Telemedicine Backend System** is built from the ground up to solve high-concurrency healthcare scheduling challenges, enforce strict **write idempotency**, and maintain immutable **telemedicine compliance audit logs**.

The system orchestrates complex transactional workflows across patients, doctors, availability slots, consultations, prescriptions, and payments—ensuring zero double-bookings even under heavy concurrent traffic spikes.

**Key Technical Achievements in this Project:**
- **Strict Write Idempotency:** Every state-mutating endpoint (`POST /consultations/book`, `/doctors/slots`, `/prescribe`) enforces an `Idempotency-Key` header backed by Redis and PostgreSQL to guarantee zero duplicate bookings or double-charging on network retries.
- **Concurrency-Safe ACID Bookings:** Uses PostgreSQL Row-Level Pessimistic Locking (`SELECT ... FOR UPDATE`) inside ACID transactions to eliminate race conditions when multiple patients attempt to book the same doctor slot simultaneously.
- **Production-Grade Security & RBAC:** Implements JWT authentication, Role-Based Access Control (`patient`, `doctor`, `admin`), `bcrypt` password hashing, `Joi` payload validation, `Helmet` security headers, and IP rate-limiting.
- **Full-Stack Observability & Resilience:** Integrated with structured JSON logging (`Winston`), real-time Prometheus latency histograms (`/metrics`), automated CI testing via GitHub Actions, and a zero-dependency in-memory database fallback.

---

## 🧠 Architecture Overview

### 🔹 Application & API Tier
- Built with **Node.js & Express.js**
- Modular controller-service-middleware architecture
- RESTful APIs with Joi schema validation and rate limiting (`express-rate-limit`)

### 🔹 Database & Concurrency Tier
- **PostgreSQL 15** (with automated Zero-Dependency In-Memory Fallback for local resilience)
- 8 Core Normalized Entities: `users`, `profiles`, `doctors`, `availability_slots`, `consultations`, `prescriptions`, `payments`, and `audit_logs`
- Pessimistic row locking (`FOR UPDATE`) and composite B-Tree indexing for sub-200ms read latency

### 🔹 Caching & Idempotency Tier
- **Redis 7**
- High-speed lookup for `Idempotency-Key` replay responses (24h TTL) and doctor search query caching

### 📊 Observability, Containerization & CI/CD
- **Docker & Docker Compose** for single-command multi-container orchestration
- **Prometheus (`prom-client`) & Winston** for metrics scraping and structured JSON logs
- **GitHub Actions** pipeline running automated `Jest` & `Supertest` integration suites on every push

---

## 📂 Folder Structure

    📁 amrutam-telemedicine-backend
    ├── 📁 .github
    │   └── 📁 workflows
    │       └── 📄 ci.yml                     # Automated CI/CD Test & Security Audit Pipeline
    │
    ├── 📁 docs
    │   ├── 📄 ARCHITECTURE.md                # High-Level Design, Sequence & ER Diagrams, DR Plan
    │   ├── 📄 SECURITY.md                    # OWASP Top 10 Mitigations & Threat Model
    │   └── 📄 openapi.yaml                   # OpenAPI 3.0 REST API Specification
    │
    ├── 📁 sql
    │   └── 📄 init.sql                       # PostgreSQL Schema (8 Core Tables + Indexes)
    │
    ├── 📁 src
    │   ├── 📁 config
    │   │   ├── 📄 db.js                      # PostgreSQL Pool, Redis & Resilient Fallback Engine
    │   │   └── 📄 logger.js                  # Winston JSON Logger & Prometheus Metrics Registry
    │   ├── 📁 controllers
    │   │   ├── 📄 adminController.js         # System Analytics & Audit Trail Aggregation
    │   │   ├── 📄 authController.js          # User Registration, Login & Profile Creation
    │   │   ├── 📄 consultationController.js  # ACID Slot Booking & Digital Prescriptions
    │   │   └── 📄 doctorController.js        # Slot Publishing & Filtered Doctor Search
    │   ├── 📁 middlewares
    │   │   ├── 📄 audit.js                   # Immutable Compliance & Activity Trail Logger
    │   │   ├── 📄 auth.js                    # JWT Verification & Role-Based Access Control
    │   │   └── 📄 idempotency.js             # Mandatory Idempotency-Key Enforcement Layer
    │   ├── 📁 routes
    │   │   └── 📄 index.js                   # API v1 Router & Rate Limiter Configuration
    │   └── 📄 app.js                         # Express App Entrypoint & Observability Hooks
    │
    ├── 📁 tests
    │   └── 📄 api.test.js                    # End-to-End Jest & Supertest Integration Suite
    │
    ├── 📄 .env.example                       # Environment Variables Template
    ├── 📄 .gitignore                         # Git Ignored Files
    ├── 📄 Dockerfile                         # Production Node.js 20 Alpine Image
    ├── 📄 docker-compose.yml                 # Multi-Container Stack (API + Postgres + Redis)
    ├── 📄 package.json                       # Dependencies & NPM Scripts
    └── 📄 README.md                          # Project Documentation

---

## 🛠️ Setup & Installation

### ✅ Prerequisites
Before setting up the project locally, make sure you have:
- **Node.js (v18 or higher)**
- **PostgreSQL (v15+)** *(Optional — built-in memory fallback supported)*
- **Docker & Docker Desktop** *(Optional for containerized mode)*
- **Git**

### 🔽 Step 1: Clone the Repository
```sh
git clone [https://github.com/Harsh64041/amrutam-telemedicine-backend.git](https://github.com/Harsh64041/amrutam-telemedicine-backend.git)
cd amrutam-telemedicine-backend
```

### 📦 Step 2: Install Dependencies
```sh
npm install
```

### 🛢️ Step 3: Configure Environment Variables
- **Copy the example environment file to create your local `.env`:**
```sh
cp .env.example .env
```
- **Default `.env` configuration:**
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://amrutam_user:amrutam_pass@127.0.0.1:5432/amrutam_db
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=super_secret_amrutam_jwt_key_2026_rotate_regularly
JWT_EXPIRES_IN=24h
```

### 🧪 Step 4: Run Automated Integration Tests
Verify all core workflows (Healthcheck, User Registration, JWT Login, Doctor Slot Creation, ACID Consultation Booking, and Idempotent Replay):
```sh
npm test
```

### ▶️ Step 5: Run the Application (Local Mode)
- **Start the Backend Server:**
```sh
npm start
```
- **Explore Live Endpoints in Browser / Postman:**
```sh
http://localhost:3000/health
http://localhost:3000/metrics
http://localhost:3000/api/v1/doctors
```

### 🐳 Step 6: Run the Application (Docker Mode)
- **If you prefer running the entire stack via containers:**
```sh
docker-compose up --build
```

---

## 🔌 Core API Endpoints Summary

| Method | Endpoint | Access Role | Idempotent | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | No | Liveness & readiness health probe |
| `GET` | `/metrics` | Public | No | Prometheus metrics scraping endpoint |
| `POST` | `/api/v1/auth/register` | Public | No | Register `patient`, `doctor`, or `admin` |
| `POST` | `/api/v1/auth/login` | Public | No | Authenticate and receive signed JWT |
| `GET` | `/api/v1/doctors` | Public | No | Search doctors by specialization & open slots |
| `POST` | `/api/v1/doctors/slots` | `doctor` | **Yes** | Create bookable availability time slot |
| `POST` | `/api/v1/consultations/book` | `patient` | **Yes** | Book consultation slot (ACID + Row Lock) |
| `POST` | `/api/v1/consultations/:id/prescribe`| `doctor` | **Yes** | Complete consultation & issue prescription |
| `GET` | `/api/v1/admin/analytics` | `admin` | No | View platform revenue, stats & audit trails |

---

## 🔮 Future Enhancements
🚀 **WebRTC Video Rooms** – Native integration with Agora/Twilio for encrypted live video consultations between doctors and patients.

📲 **Async Notification Queues** – BullMQ + Redis worker queues for automated WhatsApp/SMS appointment reminders and PDF prescription emails.

🔐 **TOTP Multi-Factor Authentication** – Full authenticator app MFA verification flow for doctors and admin accounts.

🌍 **Multi-Region Read Replicas** – Automated geo-routing to nearest PostgreSQL read replica for sub-50ms global response times.

---

## 🤝 Contribution
- Fork the repository.
- Create a feature branch (`git checkout -b feature-branch`).
- Commit your changes (`git commit -m "Add new feature"`).
- Push to the branch (`git push origin feature-branch`).
- Open a Pull Request.

---

## 📧 Contact & Support
For any queries or support, feel free to reach out:

- 👤 **Harsh Vardhan Sharma**
- 📩 **Email:** harshvardhans809@gmail.com
- 🔗 **LinkedIn:** [Connect with me](https://www.linkedin.com/in/harshvardhan-sharma-246919297)
- 🌍 **GitHub:** [Project Repository](https://github.com/Harsh64041/amrutam-telemedicine-backend)
