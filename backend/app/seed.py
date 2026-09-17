from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from .models import Employee, CompanyHoliday, HrSetting, new_id
from .passwords import hash_password
from .config import get_settings


def seed_default_users(db: Session) -> None:
    settings = get_settings()
    defaults = [
        {
            "name": "CEO",
            "role": "CEO",
            "email": settings.seed_ceo_email,
            "password": settings.seed_ceo_password,
            "department": "Executive",
        },
        {
            "name": "HR Admin",
            "role": "HR",
            "email": settings.seed_hr_email,
            "password": settings.seed_hr_password,
            "department": "People Ops",
        },
    ]
    for row in defaults:
        existing = db.query(Employee).filter(Employee.role == row["role"]).first()
        if existing:
            if not existing.email:
                existing.email = row["email"].lower()
            if not existing.password_hash:
                existing.password_hash = hash_password(row["password"])
            continue
        db.add(
            Employee(
                id=new_id(),
                name=row["name"],
                role=row["role"],
                email=row["email"].lower(),
                password_hash=hash_password(row["password"]),
                department=row["department"],
                base_salary=0,
                incentive=0,
                performance_score=None,
                tl_id=None,
            )
        )
    db.commit()
    seed_demo_team(db)


def seed_demo_team(db: Session) -> None:
    """Demo accounts for every role — safe to re-run (skips existing emails)."""
    demo_password = "Demo2026!"
    demo_users = [
        {"name": "Alex Manager", "role": "Manager", "email": "manager@loopline.com", "department": "Operations", "base_salary": 55000},
        {"name": "Sam Sales", "role": "Sales", "email": "sales@loopline.com", "department": "Sales", "base_salary": 42000},
        {"name": "Priya TL", "role": "TL", "email": "tl@loopline.com", "department": "SEO", "base_salary": 48000},
        {"name": "Ravi Employee", "role": "Employee", "email": "employee@loopline.com", "department": "SEO", "base_salary": 35000},
        {"name": "Neha Freelancer", "role": "Freelancer", "email": "freelancer@loopline.com", "department": "Design", "base_salary": 0},
        {"name": "Jordan Partner", "role": "Partner", "email": "partner@loopline.com", "department": "Partnership", "base_salary": 0},
    ]
    created = {}
    for row in demo_users:
        email = row["email"].lower()
        existing = db.query(Employee).filter(Employee.email == email).first()
        if existing:
            created[row["role"]] = existing
            continue
        emp = Employee(
            id=new_id(),
            name=row["name"],
            role=row["role"],
            email=email,
            password_hash=hash_password(demo_password),
            department=row["department"],
            base_salary=row["base_salary"],
            incentive=0,
            performance_score=75 if row["role"] not in ("CEO", "Partner", "HR", "Freelancer") else None,
            tl_id=None,
        )
        db.add(emp)
        created[row["role"]] = emp
    db.commit()

    tl = created.get("TL") or db.query(Employee).filter(Employee.email == "tl@loopline.com").first()
    if not tl:
        return
    for role in ("Employee", "Sales"):
        emp = created.get(role) or db.query(Employee).filter(Employee.role == role, Employee.email.like(f"%@loopline.com")).first()
        if emp and emp.tl_id != tl.id:
            emp.tl_id = tl.id
    db.commit()


def migrate_employee_columns(engine) -> None:
    """Add auth/team columns on existing databases."""
    stmts = [
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(120)",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash TEXT",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS tl_id VARCHAR(16)",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL",
        "ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reviewed_by_id VARCHAR(16)",
        "ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR(120)",
        "ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reviewed_at DATE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 NOT NULL",
    ]
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'employees_tl_id_fkey'
                    ) THEN
                        ALTER TABLE employees
                        ADD CONSTRAINT employees_tl_id_fkey
                        FOREIGN KEY (tl_id) REFERENCES employees(id) ON DELETE SET NULL;
                    END IF;
                END $$;
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique
                ON employees (LOWER(email))
                WHERE email IS NOT NULL AND email <> '';
                """
            )
        )


DEFAULT_HOLIDAYS = [
    ("2026-01-26", "Republic Day"),
    ("2026-03-04", "Holi"),
    ("2026-03-30", "Ugadi"),
    ("2026-04-14", "Ambedkar Jayanti"),
    ("2026-05-01", "May Day"),
    ("2026-08-15", "Independence Day"),
    ("2026-10-02", "Gandhi Jayanti"),
    ("2026-10-20", "Dussehra"),
    ("2026-11-08", "Diwali"),
    ("2026-12-25", "Christmas"),
    ("2025-01-26", "Republic Day"),
    ("2025-08-15", "Independence Day"),
    ("2025-10-02", "Gandhi Jayanti"),
    ("2025-12-25", "Christmas"),
]


def seed_default_holidays(db: Session) -> None:
    if db.query(CompanyHoliday).count() > 0:
        return
    for iso, name in DEFAULT_HOLIDAYS:
        db.add(CompanyHoliday(id=new_id(), date=date.fromisoformat(iso), name=name))
    if not db.query(HrSetting).filter(HrSetting.key == "weekend_days").first():
        db.add(HrSetting(key="weekend_days", value=[0, 6]))
    db.commit()
