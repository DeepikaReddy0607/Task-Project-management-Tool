# TASKFLOW — MASTER PROJECT AUDIT & DOCUMENTATION INDEX

Welcome to the comprehensive audit and technical documentation suite for **TaskFlow** (Intelligent Project Management & Team Coordination Platform).

This documentation suite was produced to prepare the three-member engineering team for the upcoming Software Engineering Lab project review and faculty viva defense.

---

## 📚 MASTER DOCUMENTATION DELIVERABLES

| # | Document | File Path | Description |
|---|---|---|---|
| **1** | **Master Project Report** | [`TASKFLOW_COMPLETE_PROJECT_REPORT.md`](./TASKFLOW_COMPLETE_PROJECT_REPORT.md) | Exhaustive 23-section review report covering problem statement, tech stack, complete feature inventory, architecture, testing, limitations, and conclusion. |
| **2** | **Feature Status Matrix** | [`TASKFLOW_FEATURE_STATUS_MATRIX.md`](./TASKFLOW_FEATURE_STATUS_MATRIX.md) | Master feature matrix covering all 54 modules across Frontend, Backend, Database, API, Tests, Mock Data, and Final Status. |
| **3** | **Mock Data Audit** | [`MOCK_DATA_AUDIT.md`](./MOCK_DATA_AUDIT.md) | Itemized audit classifying every mock array, test fixture, and synthetic fallback across Categories A through G with exact lines and UI visibility. |
| **4** | **Mock Data Removal Plan** | [`MOCK_DATA_REMOVAL_PLAN.md`](./MOCK_DATA_REMOVAL_PLAN.md) | Safe, step-by-step cleanup and verification plan separating non-breaking source code fixes from database preservation. |
| **5** | **Technical Architecture** | [`TASKFLOW_ARCHITECTURE.md`](./TASKFLOW_ARCHITECTURE.md) | In-depth architectural specification containing **8 Mermaid workflows** (System Architecture, OTP, Login, Lifecycle, Dependencies, Command Center, Coordination, Quackie). |
| **6** | **API Reference** | [`TASKFLOW_API_REFERENCE.md`](./TASKFLOW_API_REFERENCE.md) | Complete inventory of all 50+ REST endpoints across 21 controllers with request bodies, response schemas, validation, and test suites. |
| **7** | **Database Reference** | [`TASKFLOW_DATABASE_REFERENCE.md`](./TASKFLOW_DATABASE_REFERENCE.md) | Comprehensive PostgreSQL data model reference covering all 20 models in `taskflow` schema, fields, foreign keys, cascades, check constraints, and composite indexes. |
| **8** | **Team Knowledge Transfer** | [`TEAM_KNOWLEDGE_TRANSFER.md`](./TEAM_KNOWLEDGE_TRANSFER.md) | Cross-training onboarding guide for all 3 team members, module-by-module breakdown, common failure scenarios, and a 10-minute presentation defense script. |
| **9** | **Review Defense Questions** | [`PROJECT_REVIEW_QUESTIONS.md`](./PROJECT_REVIEW_QUESTIONS.md) | Curated collection of **65 rigorous faculty questions** and code-accurate answers spanning Node.js, React 19, PostgreSQL, Kahn's algorithm, CPM, RBAC, and security. |
| **10**| **Implementation Roadmap** | [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) | Strategic enhancement roadmap (Nov 2026 – Mar 2027), sprint tasks, S3 cloud storage migration, Redis rate limits, and executive audit scorecard. |

---

## 🧪 EMPIRICAL TEST VERIFICATION SUMMARY

Every metric in these documents is backed by executed automated tests:
- **Backend Automated Tests:** **1,054 passed / 1,054 total** across 58 test suites in 35 files (`npm test` in `backend/`).
- **Frontend Automated Tests:** **45 passed / 45 total** across 8 Vitest suites (`npm test` in `frontend/`).
- **Selenium / E2E Journeys:** **17 passed / 17 total** across production authentication, onboarding, workspaces, projects, Kanban, and RBAC (`python tests/selenium/run_all_tests.py`).
- **Total Verified Tests:** **1,116 passed tests with 100% pass rate**.

---

## ⚙️ ENVIRONMENT VARIABLES REFERENCE

### Backend (`backend/.env`)

| Variable | Description | Example / Default | Required in Production |
|---|---|---|:---:|
| `PORT` | Backend Express server port | `5000` | No (defaults to 5000) |
| `DATABASE_URL` | PostgreSQL connection pool URL | `postgresql://...` | **Yes** |
| `DIRECT_URL` | Direct PostgreSQL connection URL for migrations | `postgresql://...` | **Yes** |
| `JWT_SECRET` | Secret key for signing user session JWTs | `min_32_characters` | **Yes** |
| `RESET_PASSWORD_SECRET` | Secret key for single-use password reset tokens | `min_32_characters` | **Yes** |
| `OTP_SECRET` | HMAC-SHA256 secret for keyed OTP hashing | `min_32_characters` | **Yes** |
| `FRONTEND_URL` | Primary client URL for CORS and password reset links | `https://chipmunks-taskflow.vercel.app` | **Yes** |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:5173,https://...` | **Yes** |
| `RESEND_API_KEY` | Resend API key for OTP and password-reset email delivery | `re_...` | **Yes** |
| `RESEND_FROM_EMAIL` | Sender email address for outbound emails | `onboarding@resend.dev` | **Yes** |