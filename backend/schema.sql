"""
Loopline Agency Ops — PostgreSQL schema
Run: psql -U postgres -d loopline -f schema.sql
"""

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Employees / users
CREATE TABLE IF NOT EXISTS employees (
    id              VARCHAR(16) PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    role            VARCHAR(40) NOT NULL,
    department      VARCHAR(120) DEFAULT '',
    birthday        DATE,
    base_salary     NUMERIC(12,2) DEFAULT 0,
    incentive       NUMERIC(12,2) DEFAULT 0,
    performance_score INTEGER,
    active          BOOLEAN DEFAULT TRUE NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id          VARCHAR(16) PRIMARY KEY,
    emp_id      VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    clock_in    VARCHAR(8),
    clock_out   VARCHAR(8),
    UNIQUE (emp_id, date)
);

CREATE TABLE IF NOT EXISTS attendance_breaks (
    id              SERIAL PRIMARY KEY,
    attendance_id   VARCHAR(16) NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL,
    start_time      VARCHAR(8) NOT NULL,
    end_time        VARCHAR(8)
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id              VARCHAR(16) PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT DEFAULT '',
    assigned_to     VARCHAR(16) REFERENCES employees(id) ON DELETE SET NULL,
    assigned_by     VARCHAR(120),
    start_date      DATE,
    start_time      VARCHAR(8),
    end_date        DATE,
    end_time        VARCHAR(8),
    status          VARCHAR(40) DEFAULT 'Pending',
    progress        INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS task_updates (
    id          SERIAL PRIMARY KEY,
    task_id     VARCHAR(16) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    time        VARCHAR(80)
);

-- Leave
CREATE TABLE IF NOT EXISTS leaves (
    id          VARCHAR(16) PRIMARY KEY,
    emp_id      VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    from_date   DATE NOT NULL,
    to_date     DATE NOT NULL,
    reason      TEXT DEFAULT '',
    status      VARCHAR(40) DEFAULT 'Pending',
    reviewed_by_id   VARCHAR(16) REFERENCES employees(id) ON DELETE SET NULL,
    reviewed_by_name VARCHAR(120),
    reviewed_at      DATE
);

-- Direct messages
CREATE TABLE IF NOT EXISTS messages (
    id          VARCHAR(16) PRIMARY KEY,
    from_id     VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    from_name   VARCHAR(120),
    to_id       VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    text        TEXT DEFAULT '',
    image       TEXT,
    time        VARCHAR(40),
    ts          BIGINT,
    read        BOOLEAN DEFAULT FALSE
);

-- Client billing
CREATE TABLE IF NOT EXISTS clients (
    id              VARCHAR(16) PRIMARY KEY,
    name            VARCHAR(160) NOT NULL,
    business_name   VARCHAR(160) DEFAULT '',
    services        JSONB DEFAULT '[]',
    amount          NUMERIC(14,2) DEFAULT 0,
    paid            NUMERIC(14,2) DEFAULT 0,
    pending         NUMERIC(14,2) DEFAULT 0,
    holding         NUMERIC(14,2) DEFAULT 0,
    gst             NUMERIC(14,2) DEFAULT 0,
    tax             NUMERIC(14,2) DEFAULT 0,
    pay_status      VARCHAR(40) DEFAULT 'Pending',
    joining_date    DATE,
    month           VARCHAR(7) NOT NULL,
    meeting_date    DATE
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id          VARCHAR(16) PRIMARY KEY,
    label       VARCHAR(200) NOT NULL,
    amount      NUMERIC(14,2) DEFAULT 0,
    month       VARCHAR(7) NOT NULL
);

-- Incentive log
CREATE TABLE IF NOT EXISTS incentive_log (
    id          VARCHAR(16) PRIMARY KEY,
    emp_id      VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount      NUMERIC(12,2) NOT NULL,
    date        DATE NOT NULL
);

-- Monthly payslips (HR-issued)
CREATE TABLE IF NOT EXISTS payslips (
    id                  VARCHAR(16) PRIMARY KEY,
    emp_id              VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month               VARCHAR(7) NOT NULL,
    base_salary         NUMERIC(12,2) DEFAULT 0,
    incentive           NUMERIC(12,2) DEFAULT 0,
    allowance           NUMERIC(12,2) DEFAULT 0,
    deduction           NUMERIC(12,2) DEFAULT 0,
    working_days        INTEGER,
    paid_days           INTEGER,
    lop_days            INTEGER DEFAULT 0,
    performance_score   INTEGER,
    notes               TEXT DEFAULT '',
    status              VARCHAR(20) DEFAULT 'Draft',
    published_at        DATE,
    UNIQUE (emp_id, month)
);

CREATE INDEX IF NOT EXISTS idx_payslips_emp_month ON payslips(emp_id, month);

-- Complaints / suggestions
CREATE TABLE IF NOT EXISTS complaints (
    id          VARCHAR(16) PRIMARY KEY,
    from_id     VARCHAR(16) REFERENCES employees(id) ON DELETE SET NULL,
    from_name   VARCHAR(120),
    from_role   VARCHAR(40),
    text        TEXT NOT NULL,
    date        VARCHAR(80),
    status      VARCHAR(40) DEFAULT 'Open'
);

-- CEO vision
CREATE TABLE IF NOT EXISTS ceo_vision (
    id          VARCHAR(16) PRIMARY KEY,
    text        TEXT NOT NULL,
    date        DATE NOT NULL
);

-- Client accounts vault (TL)
CREATE TABLE IF NOT EXISTS client_accounts (
    id              VARCHAR(16) PRIMARY KEY,
    name            VARCHAR(160) NOT NULL,
    business        VARCHAR(160) DEFAULT '',
    website         TEXT DEFAULT '',
    website_pass    TEXT DEFAULT '',
    insta_user      VARCHAR(120) DEFAULT '',
    insta_pass      TEXT DEFAULT '',
    fb_user         VARCHAR(120) DEFAULT '',
    fb_pass         TEXT DEFAULT '',
    other_label     VARCHAR(80) DEFAULT '',
    other_user      VARCHAR(120) DEFAULT '',
    other_pass      TEXT DEFAULT ''
);

-- Freelance
CREATE TABLE IF NOT EXISTS freelance_jobs (
    id                          VARCHAR(16) PRIMARY KEY,
    title                       VARCHAR(255) NOT NULL,
    description                 TEXT DEFAULT '',
    deadline                    DATE NOT NULL,
    posted_by                   VARCHAR(120),
    posted_by_role              VARCHAR(40),
    status                      VARCHAR(40) DEFAULT 'Open',
    assigned_freelancer_id      VARCHAR(16),
    assigned_freelancer_name    VARCHAR(120),
    submission_note             TEXT,
    submission_image            TEXT,
    submission_date             DATE,
    submission_by               VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS freelance_requests (
    id              VARCHAR(16) PRIMARY KEY,
    job_id          VARCHAR(16) NOT NULL REFERENCES freelance_jobs(id) ON DELETE CASCADE,
    freelancer_id   VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    freelancer_name VARCHAR(120),
    date            DATE NOT NULL,
    status          VARCHAR(40) DEFAULT 'Pending'
);

-- Portfolio
CREATE TABLE IF NOT EXISTS portfolios (
    id              VARCHAR(16) PRIMARY KEY,
    freelancer_id   VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT DEFAULT '',
    image           TEXT,
    date            DATE NOT NULL
);

-- Company holidays & weekend config (HR-managed)
CREATE TABLE IF NOT EXISTS company_holidays (
    id          VARCHAR(16) PRIMARY KEY,
    date        DATE NOT NULL UNIQUE,
    name        VARCHAR(200) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hr_settings (
    key         VARCHAR(64) PRIMARY KEY,
    value       JSONB NOT NULL
);

-- Sessions (simple token store)
CREATE TABLE IF NOT EXISTS sessions (
    token       VARCHAR(64) PRIMARY KEY,
    emp_id      VARCHAR(16) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(emp_id, date);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_clients_month ON clients(month);
CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(emp_id);
