# AtomQuest — Goal Setting & Tracking Portal

A production-ready organizational goal setting, tracking, and performance management portal built for hackathon demonstration.

![Tech Stack](https://img.shields.io/badge/Next.js_14-black?logo=next.js) ![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white) ![Azure](https://img.shields.io/badge/Azure_SQL-0078D4?logo=microsoft-azure&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)

## Features

- 🎯 **Goal Setting** — Employees create, edit, and submit goals with thrust areas, UoM types, and weightage validation
- ✅ **Manager Approval** — Approve, reject, return, or inline-edit goals; bulk approval support
- 📊 **Quarterly Check-ins** — Track achievement progress with live score computation
- 🔗 **Shared Goals** — Push goals to multiple employees with automatic achievement sync
- 📈 **Analytics Dashboard** — QoQ trends, thrust area distribution, completion heatmaps, manager effectiveness
- 📥 **Report Export** — Download achievement reports as CSV or Excel
- 🔐 **Role-Based Access** — Employee, Manager, Admin roles with JWT authentication
- 📋 **Audit Trail** — Full audit log with JSON diff viewer
- 📧 **Email Notifications** — SendGrid integration with console fallback

## Demo Credentials

| Role     | Email              | Password        |
|----------|--------------------|-----------------|
| Employee | employee@demo.com  | Atom@Quest2025  |
| Manager  | manager@demo.com   | Atom@Quest2025  |
| Admin    | admin@demo.com     | Atom@Quest2025  |

## Quick Start — Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- npm

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy environment config
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux

# Seed demo data
python seed.py

# Start server
uvicorn main:app --reload --port 8000
```

Backend runs at: http://localhost:8000  
API docs at: http://localhost:8000/docs

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment config
copy .env.local.example .env.local   # Windows

# Start dev server
npm run dev
```

Frontend runs at: http://localhost:3000

## Azure Deployment

### 1. Azure SQL Database

1. Create Azure SQL Server + Database (Basic tier, ~$5/mo)
2. Enable "Allow Azure services and resources to access this server"
3. Set connection string in App Service environment:
   ```
   DATABASE_URL=mssql+pyodbc://<user>:<password>@<server>.database.windows.net:1433/<dbname>?driver=ODBC+Driver+17+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no&Connection+Timeout=30
   ```
4. Run migrations: `alembic upgrade head`
5. Seed data: `python seed.py`

### 2. Backend — Azure App Service

1. Create Linux App Service (Python 3.11)
2. Set environment variables: `DATABASE_URL`, `SECRET_KEY`, `ALGORITHM`, `ALLOWED_ORIGINS`
3. Set startup command: `uvicorn main:app --host 0.0.0.0 --port 8000`
4. Configure GitHub Actions secret: `AZURE_WEBAPP_PUBLISH_PROFILE`

### 3. Frontend — Azure Static Web Apps

1. Create Static Web App resource
2. Set build config: `app_location: "./frontend"`, `output_location: ".next"`
3. Set `NEXT_PUBLIC_API_URL` to your App Service URL
4. Configure GitHub Actions secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── database.py          # SQLAlchemy engine + session
│   ├── models.py            # 8 ORM models
│   ├── schemas.py           # Pydantic request/response models
│   ├── auth.py              # JWT auth + role-based access
│   ├── notifications.py     # SendGrid email helper
│   ├── seed.py              # Demo data seeder
│   ├── routers/
│   │   ├── goals.py         # Goal CRUD + approval + shared goals
│   │   ├── achievements.py  # Achievement tracking + sync
│   │   ├── checkins.py      # Manager check-in comments
│   │   ├── admin.py         # Cycles, audit, dashboard
│   │   ├── reports.py       # CSV/Excel export + analytics
│   │   └── users.py         # User CRUD
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Login
│   │   ├── employee/        # Employee dashboard, goals, check-in
│   │   ├── manager/         # Manager dashboard, approval, check-in
│   │   └── admin/           # Admin dashboard, users, cycles, reports, analytics, audit
│   ├── components/          # Sidebar, Navbar, ProgressBar, Toast
│   └── lib/                 # API client, Auth context
├── infrastructure/
│   └── architecture.md      # Architecture documentation
└── .github/workflows/       # CI/CD pipelines
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Recharts
- **Backend**: FastAPI, SQLAlchemy, python-jose (JWT)
- **Database**: Azure SQL / SQLite (local)
- **Email**: SendGrid (optional)
- **Hosting**: Azure Static Web Apps + App Service

---

Built with ❤️ for AtomQuest Hackathon
