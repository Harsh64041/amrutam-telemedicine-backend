# Amrutam Telemedicine System — Architecture Document

## 1. High-Level Architecture & Data Flow
- **Client Layer**: Mobile and Web client apps communicating over TLS 1.3 via REST APIs.
- **API Gateway / Ingress**: NGINX / AWS Application Load Balancer terminating SSL, performing global rate limiting, and routing traffic.
- **Stateless Application Tier**: Horizontal Pod Autoscaling (HPA) of containerized Node.js services configured with non-blocking event loops.
- **Caching & Idempotency Layer**: Redis 7 cluster storing cached query models and idempotency keys with a 24-hour Time-To-Live (TTL).
- **Persistence Tier**: PostgreSQL 15 Primary instance (handling writes) paired with asynchronous Read Replicas fronted by PgBouncer for connection pooling.

```mermaid
graph LR
    Client[Patient / Doctor Client] --> ALB[AWS Application Load Balancer]
    ALB --> API[Node.js Stateless Services]
    API --> Redis[(Redis 7 Cache & Idempotency)]
    API --> PG_Primary[(PostgreSQL 15 Primary - Writes)]
    API --> PG_Replica[(PostgreSQL Read Replicas - Reads)]
    API --> Prom[Prometheus & Grafana Observability]
```

---

## 2. Booking Flow Sequence Diagram (ACID & Idempotency Guarantee)
```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant API as Telemedicine API
    participant Redis as Redis Cache
    participant DB as PostgreSQL Database

    Patient->>API: POST /api/v1/consultations/book (Header: Idempotency-Key)
    API->>Redis: GET idem:{userId}:{key}
    alt Idempotency Key Exists (Duplicate Request)
        Redis-->>API: Return cached 201 response payload
        API-->>Patient: 201 Created (Header: X-Idempotent-Replay: true)
    else First-time Request
        API->>DB: BEGIN TRANSACTION
        API->>DB: SELECT * FROM availability_slots WHERE id = $1 FOR UPDATE
        alt Slot Already Booked (is_booked = true)
            DB-->>API: Slot unavailable
            API->>DB: ROLLBACK
            API-->>Patient: 409 Conflict (Slot already reserved)
        else Slot Available
            API->>DB: UPDATE availability_slots SET is_booked = true, version = version + 1 WHERE id = $1
            API->>DB: INSERT INTO consultations (patient_id, doctor_id, slot_id, status) VALUES (...)
            API->>DB: INSERT INTO payments (consultation_id, amount, idempotency_key) VALUES (...)
            API->>DB: COMMIT
            API->>Redis: SETEX idem:{userId}:{key} 86400 <response_body>
            API-->>Patient: 201 Created (Consultation Confirmed)
        end
    end
```

---

## 3. Entity-Relationship (ER) Diagram
```mermaid
erDiagram
    USERS ||--o| PROFILES : "has personal profile"
    USERS ||--o| DOCTORS : "has clinical credentials"
    USERS ||--o{ CONSULTATIONS : "books as patient"
    DOCTORS ||--o{ AVAILABILITY_SLOTS : "creates slots"
    DOCTORS ||--o{ CONSULTATIONS : "attends consultation"
    AVAILABILITY_SLOTS ||--|| CONSULTATIONS : "reserved by"
    CONSULTATIONS ||--o| PRESCRIPTIONS : "generates upon completion"
    CONSULTATIONS ||--|| PAYMENTS : "billed through"
    USERS ||--o{ AUDIT_LOGS : "triggers actor actions"

    USERS {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar role "patient | doctor | admin"
        boolean mfa_enabled
        timestamp created_at
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        varchar full_name
        varchar phone
        date dob
        varchar gender
    }

    DOCTORS {
        uuid id PK
        uuid user_id FK
        varchar specialization
        int experience_years
        numeric consultation_fee
        numeric rating
        boolean is_verified
    }

    AVAILABILITY_SLOTS {
        uuid id PK
        uuid doctor_id FK
        timestamp start_time
        timestamp end_time
        boolean is_booked
        int version
    }

    CONSULTATIONS {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        uuid slot_id FK
        varchar status "scheduled | in_progress | completed | cancelled"
        text notes
        timestamp created_at
    }

    PRESCRIPTIONS {
        uuid id PK
        uuid consultation_id FK
        jsonb medications
        text instructions
        timestamp issued_at
    }

    PAYMENTS {
        uuid id PK
        uuid consultation_id FK
        numeric amount
        varchar currency
        varchar status "pending | completed | failed"
        varchar idempotency_key UK
        timestamp created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        varchar action
        varchar entity_type
        varchar entity_id
        varchar ip_address
        jsonb metadata
        timestamp created_at
    }
```

---

## 4. Retry and Backoff Strategies
- **Client Retries**: Implemented with exponential backoff and randomized full jitter to eliminate thundering herd spikes during network degradation:
  \[T_{\text{wait}} = \text{random}(0, \min(T_{\max}, T_{\text{base}} \times 2^{\text{attempt}}))\]
- **Safe Network Retries**: The mandatory `Idempotency-Key` header on all write requests (`POST`, `PUT`, `PATCH`) guarantees that network dropouts and aggressive client retries never create duplicate consultation records or double billing.

---

## 5. Data Partitioning Strategy (100k Daily Consultations)
- **Time-Range Partitioning**: The `consultations` and `audit_logs` tables generate an estimated ~3 million rows per month. PostgreSQL declarative range partitioning (`PARTITION BY RANGE (created_at)`) isolates active month data from historical cold storage, keeping working index sets cached in RAM.
- **Indexing Topology**:
  - Composite B-Tree index on `availability_slots(doctor_id, is_booked, start_time)` ensures fast slot discovery ($< 50\text{ms}$).
  - Trigram inverted index (`gin_trgm_ops`) on `doctors(specialization)` for high-throughput text search.

---

## 6. Caching and Concurrency Handling
- **Race Condition Prevention**: Double-booking is strictly prevented via PostgreSQL pessimistic row locking (`SELECT ... FOR UPDATE`) inside an explicit transaction boundary. Two concurrent requests attempting to claim the same `slot_id` are serialized; the second request encounters `is_booked = true` and yields an immediate `409 Conflict`.
- **Query Caching**: Doctor directory results are cached in Redis with a 10-minute TTL. Slot creation and booking operations execute write-through cache invalidation (`DEL doctors:search:*`).

---

## 7. Transaction Management and Sagas
- **Local ACID Boundaries**: Slot reservation, consultation initialization, and internal payment ledgers commit atomically inside single database transactions (`BEGIN` ... `COMMIT`).
- **Distributed Saga (Compensating Actions)**: For third-party gateway interactions (Razorpay/Stripe), an asynchronous Choreography Saga handles asynchronous failures:
  - If a payment webhook arrives with status `failed`, a worker triggers a compensating event to mark the consultation as `cancelled` and frees the slot (`is_booked = false`).

---

## 8. Backup and Disaster Recovery (Target: 99.95% Availability)
- **Recovery Point Objective (RPO) < 1 minute**: Continuous PostgreSQL Write-Ahead Log (WAL) archiving to AWS S3 bucket storage paired with synchronous multi-Availability Zone hot standbys.
- **Recovery Time Objective (RTO) < 5 minutes**: Automated health check failovers managed via AWS RDS Multi-AZ / Patroni orchestrator to promote the replica with zero manual intervention.