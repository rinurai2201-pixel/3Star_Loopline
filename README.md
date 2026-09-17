# Loopline Agency Ops

Split from the original single HTML file into a proper **frontend** + **backend** (Python / PostgreSQL). UI design is preserved.

## Structure

```
frontend/
  css/styles.css          # exact original styles
  js/                     # API client + app logic
  pages/
    login.html
    employee_dashboard.html
    manager_dashboard.html
    sales_dashboard.html
    hr_management.html
    tl_task_management.html
    hr_revenue.html / ceo_revenue.html
    hr_reports.html / ceo_reports.html
    messages.html
    freelance_hub.html
  index.html

backend/
  app/                    # FastAPI app + routers
  schema.sql              # PostgreSQL schema
  requirements.txt
  .env.example
```

## Role → page map

| Role       | Landing page              |
|------------|---------------------------|
| Employee   | employee_dashboard.html   |
| Manager    | manager_dashboard.html    |
| Sales      | sales_dashboard.html      |
| TL         | tl_task_management.html   |
| HR         | hr_management.html        |
| CEO        | ceo_reports.html          |
| Freelancer | freelance_hub.html        |

**Demo team** (auto-seeded on startup): `manager@`, `tl@`, `employee@`, `sales@`, `freelancer@` @loopline.com — password `Demo2026!`

## Setup

### 1. PostgreSQL

```bash
createdb loopline
psql -U postgres -d loopline -f backend/schema.sql
```

Or let SQLAlchemy create tables on first startup (`init_db`).

### 2. Backend env

Copy `backend/.env.example` → `backend/.env` and set:

```
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/loopline
```

### 3. Install & run

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open: http://127.0.0.1:8000/pages/login.html

API docs: http://127.0.0.1:8000/docs

## Auth & roles

On first startup, **CEO** and **HR** accounts are seeded automatically (see `SEED_*` in `.env`).

| Account | Default email           | Default password     |
|---------|-------------------------|----------------------|
| CEO     | ceo@loopline.com        | LooplineCEO2026!     |
| HR      | hr@loopline.com         | LooplineHR2026!      |

**HR** can create: Manager, Employee, TL, Sales, Freelancer (with email + password).

**Manager** assigns Employee/Sales staff to a **Team Lead** (Team assignment page).

**TL** manages only their assigned team (tasks, attendance, status).

**Messages** — any signed-in user can message anyone else in the company.

Section unlock codes (TL vault on non-TL roles, revenue screens) are unchanged in config.

## Flow

1. Sign in at `login.html` with work email + password  
2. Backend creates session token → frontend stores it  
3. Redirect to role-specific HTML page  
4. HR adds users; Manager assigns teams under TLs  
5. Use **Logout** in the sidebar to end your session
