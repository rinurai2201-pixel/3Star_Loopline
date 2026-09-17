import secrets
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session as DBSession
from .database import get_db
from .models import Employee, Session
from .config import get_settings

EXECUTIVE_ROLES = {"CEO", "Partner"}
REVENUE_ROLES = {"CEO", "Partner", "HR"}
FREELANCE_MANAGERS = {"TL", "HR", "CEO", "Partner"}
HR_CREATABLE_ROLES = {"Manager", "Employee", "TL", "Sales", "Freelancer"}
CEO_CREATABLE_ROLES = {"Partner"}
TEAM_MEMBER_ROLES = {"Employee", "Sales"}
NO_ATTENDANCE_ROLES = {"CEO", "Partner", "HR"}
PROTECTED_ROLES = {"CEO", "Partner", "HR"}


def tracks_attendance(role: str) -> bool:
    return role not in NO_ATTENDANCE_ROLES


def role_rules(role: str) -> dict:
    is_staff = role in ("Employee", "Manager", "Sales")
    is_tl = role == "TL"
    return {
        "dashboard": is_staff,
        "my_tasks": is_staff or is_tl,
        "my_attendance": is_staff or is_tl,
        "my_leaves": is_staff or is_tl,
        "my_salary": is_staff or is_tl,
        "chat": True,
        "hr_overview": role == "HR",
        "hr_employees": role == "HR",
        "hr_attendance": role == "HR",
        "hr_leaves": role == "HR",
        "hr_payroll": role == "HR",
        "teams": role == "Manager",
        "tl": role == "TL",
        "revenue": role in REVENUE_ROLES,
        "reports": role in REVENUE_ROLES,
        "partners": role == "CEO",
        "freelance": True,
    }


def landing_page(role: str) -> str:
    mapping = {
        "Employee": "/pages/app.html#dashboard",
        "Manager": "/pages/app.html#dashboard",
        "Sales": "/pages/app.html#dashboard",
        "TL": "/pages/app.html#tl",
        "HR": "/pages/app.html#hr_overview",
        "CEO": "/pages/app.html#reports",
        "Partner": "/pages/app.html#reports",
        "Freelancer": "/pages/app.html#freelance",
    }
    return mapping.get(role, "/pages/app.html#dashboard")


def create_session(db: DBSession, emp_id: str) -> str:
    token = secrets.token_hex(24)
    db.add(Session(token=token, emp_id=emp_id))
    db.commit()
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: DBSession = Depends(get_db),
) -> Employee:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    sess = db.query(Session).filter(Session.token == token).first()
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    emp = db.query(Employee).filter(Employee.id == sess.emp_id).first()
    if not emp:
        raise HTTPException(status_code=401, detail="User not found")
    if not emp.active:
        db.delete(sess)
        db.commit()
        raise HTTPException(status_code=401, detail="Account deactivated")
    return emp


def require_roles(*roles: str):
    def _dep(user: Employee = Depends(get_current_user)) -> Employee:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Access denied for your role")
        return user

    return _dep


def verify_role_code(role: str, code: str) -> bool:
    settings = get_settings()
    return settings.role_passwords.get(role) == code


def team_member_ids(db: DBSession, tl: Employee) -> set[str]:
    rows = db.query(Employee.id).filter(Employee.tl_id == tl.id).all()
    return {r[0] for r in rows}


def employees_for_user(db: DBSession, user: Employee) -> list[Employee]:
    q = db.query(Employee).filter(Employee.active.is_(True)).order_by(Employee.name)
    if user.role == "TL":
        return q.filter(Employee.tl_id == user.id).all()
    if user.role == "Manager":
        return q.filter(Employee.role.in_(TEAM_MEMBER_ROLES | {"TL"})).all()
    return q.all()


def employee_dicts(db: DBSession, employees: list[Employee]) -> list[dict]:
    tl_ids = {e.tl_id for e in employees if e.tl_id}
    tl_map = {}
    if tl_ids:
        for tl in db.query(Employee).filter(Employee.id.in_(tl_ids)).all():
            tl_map[tl.id] = tl.name
    return [e.to_dict(tl_name=tl_map.get(e.tl_id)) for e in employees]
