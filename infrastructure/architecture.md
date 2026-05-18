# Architecture Overview — AtomQuest Goal Tracking Portal

## Tech Stack

| Layer      | Technology                        | Rationale                                                                                  |
|------------|-----------------------------------|--------------------------------------------------------------------------------------------|
| Frontend   | Next.js 14 (App Router)           | Server components, file-based routing, optimized builds, great DX                          |
| Styling    | Tailwind CSS + shadcn/ui          | Rapid prototyping with consistent design, utility-first approach                           |
| Backend    | FastAPI (Python 3.11)             | High performance async API, automatic OpenAPI docs, Pydantic validation                    |
| Database   | Azure SQL (via SQLAlchemy/pyodbc) | Enterprise-grade relational DB with full ACID, managed by Azure                            |
| Auth       | JWT (python-jose + passlib)       | Stateless auth, 8-hour tokens, role-based access control                                   |
| Export     | openpyxl + csv                    | Native Python libraries for Excel/CSV generation                                          |
| Email      | SendGrid                         | Reliable transactional email with high deliverability, graceful fallback to console logging |
| CI/CD      | GitHub Actions                    | Integrated with Azure deployment, separate workflows for frontend/backend                  |

## Azure Services Used

```
┌─────────────────────────────────────────────────────────────┐
│                     Azure Cloud                              │
│                                                              │
│  ┌──────────────────────┐    ┌─────────────────────────┐    │
│  │  Azure Static Web    │    │  Azure App Service       │    │
│  │  Apps (Free Tier)    │───▶│  (Linux, Python 3.11)    │    │
│  │                      │    │  B1 Plan                  │    │
│  │  Next.js Frontend    │    │  FastAPI Backend          │    │
│  └──────────────────────┘    └────────┬────────────────┘    │
│                                       │                      │
│                              ┌────────▼────────────────┐    │
│                              │  Azure SQL Database      │    │
│                              │  Basic Tier (5 DTU)      │    │
│                              │  Max 2GB                  │    │
│                              └──────────────────────────┘    │
│                                                              │
│  ┌──────────────────────┐                                    │
│  │  SendGrid (External) │  ← Optional email notifications   │
│  └──────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
User Browser (Next.js)
    │
    ├─── Login ──▶ POST /auth/login ──▶ JWT Token returned
    │                                      │
    ├─── API Calls with Bearer Token ──────┤
    │                                      │
    ▼                                      ▼
Frontend (SSR + CSR)              FastAPI Backend
    │                                      │
    │                              ┌───────┴───────┐
    │                              │  Middleware:   │
    │                              │  - CORS       │
    │                              │  - JWT Auth   │
    │                              │  - Role Check │
    │                              └───────┬───────┘
    │                                      │
    │                              ┌───────┴───────┐
    │                              │   Routers:    │
    │                              │   - Goals     │
    │                              │   - Users     │
    │                              │   - Achieve.  │
    │                              │   - Checkins  │
    │                              │   - Admin     │
    │                              │   - Reports   │
    │                              └───────┬───────┘
    │                                      │
    │                              ┌───────┴───────┐
    │                              │  SQLAlchemy   │
    │                              │  ORM Models   │
    │                              └───────┬───────┘
    │                                      │
    │                                      ▼
    │                              Azure SQL Database
    │                              (8 tables)
    │
    └─── Downloads ◀── Reports API (CSV/Excel generation)
```

## Key Design Decisions

1. **SQLite Fallback**: Local development uses SQLite so devs can run the full stack without Azure SQL
2. **Quarterly Windows**: Business logic enforces check-in windows based on cycle dates
3. **Shared Goal Sync**: Parent-child goal model with automatic achievement propagation
4. **Audit Trail**: Captures all sensitive changes for compliance
5. **Graceful Email Fallback**: Logs emails to console when SendGrid is not configured

## Cost Estimate

| Service                   | Tier         | Monthly Cost |
|---------------------------|-------------|-------------|
| Azure SQL Database        | Basic (5 DTU)| ~$5/mo      |
| Azure App Service         | B1           | ~$13/mo     |
| Azure Static Web Apps     | Free         | $0/mo       |
| SendGrid                  | Free (100/day)| $0/mo      |
| **Total**                 |              | **~$18/mo** |

> For hackathon/demo: Use App Service F1 (Free) tier to reduce to ~$5/mo total (just the SQL database).
