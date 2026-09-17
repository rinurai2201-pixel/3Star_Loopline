from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, IncentiveLog, Session, new_id
from ..schemas import (
    SalaryIn,
    IncentiveIn,
    ScoreIn,
    BirthdayIn,
    CreateEmployeeIn,
    CreatePartnerIn,
    PartnerPasswordIn,
    AssignTeamIn,
    EmployeeActiveIn,
)
from ..auth import (
    get_current_user,
    require_roles,
    HR_CREATABLE_ROLES,
    TEAM_MEMBER_ROLES,
    PROTECTED_ROLES,
    employee_dicts,
)
from ..passwords import hash_password

router = APIRouter(prefix="/api/employees", tags=["employees"])


def _get_emp(db: Session, emp_id: str) -> Employee:
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    return emp


@router.get("")
def list_employees(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    emps = db.query(Employee).order_by(Employee.name).all()
    return {"employees": employee_dicts(db, emps)}


@router.get("/incentives/mine")
def my_incentives(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    logs = (
        db.query(IncentiveLog)
        .filter(IncentiveLog.emp_id == user.id)
        .order_by(IncentiveLog.date.desc())
        .all()
    )
    return {"logs": [l.to_dict() for l in logs]}


@router.post("")
def create_employee(
    body: CreateEmployeeIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    name = body.name.strip()
    email = body.email.strip().lower()
    password = body.password.strip()
    if not name or not email or not password:
        raise HTTPException(400, "Name, email and password are required.")
    if body.role not in HR_CREATABLE_ROLES:
        raise HTTPException(400, "HR can add Manager, Employee, TL, Sales and Freelancer only.")
    if db.query(Employee).filter(Employee.email == email).first():
        raise HTTPException(400, "An account with this email already exists.")
    birthday = date.fromisoformat(body.birthday) if body.birthday else None
    emp = Employee(
        id=new_id(),
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=body.role,
        department=(body.department or "").strip(),
        birthday=birthday,
        base_salary=0,
        incentive=0,
        performance_score=None,
        tl_id=None,
        active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp.to_dict()


@router.get("/partners")
def list_partners(db: Session = Depends(get_db), user: Employee = Depends(require_roles("CEO"))):
    partners = (
        db.query(Employee)
        .filter(Employee.role == "Partner")
        .order_by(Employee.name)
        .all()
    )
    return {"partners": [p.to_dict() for p in partners]}


@router.post("/partners")
def create_partner(
    body: CreatePartnerIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("CEO")),
):
    name = body.name.strip()
    email = body.email.strip().lower()
    password = body.password.strip()
    if not name or not email or not password:
        raise HTTPException(400, "Name, email and password are required.")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")
    if db.query(Employee).filter(Employee.email == email).first():
        raise HTTPException(400, "An account with this email already exists.")
    emp = Employee(
        id=new_id(),
        name=name,
        email=email,
        password_hash=hash_password(password),
        role="Partner",
        department=(body.department or "").strip() or "Partnership",
        birthday=None,
        base_salary=0,
        incentive=0,
        performance_score=None,
        tl_id=None,
        active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return {
        "partner": emp.to_dict(),
        "credentials": {
            "email": email,
            "password": password,
            "loginUrl": "/pages/login.html",
        },
        "message": "Partner created. Share these credentials securely — the password is shown only once.",
    }


@router.patch("/partners/{emp_id}/password")
def reset_partner_password(
    emp_id: str,
    body: PartnerPasswordIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("CEO")),
):
    emp = _get_emp(db, emp_id)
    if emp.role != "Partner":
        raise HTTPException(400, "Only Partner account passwords can be reset here.")
    password = body.password.strip()
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")
    emp.password_hash = hash_password(password)
    db.query(Session).filter(Session.emp_id == emp.id).delete()
    db.commit()
    db.refresh(emp)
    return {
        "partner": emp.to_dict(),
        "credentials": {
            "email": emp.email,
            "password": password,
            "loginUrl": "/pages/login.html",
        },
        "message": "Password reset. Share the new credentials securely — shown only once.",
    }


@router.patch("/partners/{emp_id}/active")
def set_partner_active(
    emp_id: str,
    body: EmployeeActiveIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("CEO")),
):
    emp = _get_emp(db, emp_id)
    if emp.role != "Partner":
        raise HTTPException(400, "Only Partner accounts can be updated here.")
    emp.active = body.active
    if not body.active:
        db.query(Session).filter(Session.emp_id == emp.id).delete()
    db.commit()
    db.refresh(emp)
    return emp.to_dict()


@router.patch("/{emp_id}/team")
def assign_team(
    emp_id: str,
    body: AssignTeamIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("Manager")),
):
    emp = _get_emp(db, emp_id)
    if emp.role not in TEAM_MEMBER_ROLES:
        raise HTTPException(400, "Only Employee and Sales roles can be assigned to a Team Lead.")
    if body.tlId:
        tl = _get_emp(db, body.tlId)
        if tl.role != "TL":
            raise HTTPException(400, "Selected lead is not a Team Lead.")
        emp.tl_id = tl.id
    else:
        emp.tl_id = None
    db.commit()
    db.refresh(emp)
    tl_name = None
    if emp.tl_id:
        lead = db.query(Employee).filter(Employee.id == emp.tl_id).first()
        tl_name = lead.name if lead else None
    return emp.to_dict(tl_name=tl_name)


@router.patch("/{emp_id}/salary")
def set_salary(
    emp_id: str,
    body: SalaryIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = _get_emp(db, emp_id)
    emp.base_salary = body.baseSalary
    db.commit()
    return emp.to_dict()


@router.post("/{emp_id}/incentive")
def give_incentive(
    emp_id: str,
    body: IncentiveIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = _get_emp(db, emp_id)
    emp.incentive = float(emp.incentive or 0) + body.amount
    log = IncentiveLog(id=new_id(), emp_id=emp_id, amount=body.amount, date=date.today())
    db.add(log)
    db.commit()
    db.refresh(emp)
    return emp.to_dict()


@router.patch("/{emp_id}/score")
def set_score(
    emp_id: str,
    body: ScoreIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = _get_emp(db, emp_id)
    emp.performance_score = max(0, min(100, body.score))
    db.commit()
    return emp.to_dict()


@router.patch("/{emp_id}/birthday")
def set_birthday(
    emp_id: str,
    body: BirthdayIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = _get_emp(db, emp_id)
    emp.birthday = date.fromisoformat(body.birthday) if body.birthday else None
    db.commit()
    return emp.to_dict()


@router.patch("/{emp_id}/active")
def set_employee_active(
    emp_id: str,
    body: EmployeeActiveIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = _get_emp(db, emp_id)
    if emp.role in PROTECTED_ROLES:
        raise HTTPException(400, "Cannot deactivate CEO, Partner or HR accounts.")
    if emp.id == user.id:
        raise HTTPException(400, "Cannot deactivate your own account.")
    emp.active = body.active
    if not body.active:
        db.query(Session).filter(Session.emp_id == emp.id).delete()
    db.commit()
    db.refresh(emp)
    return emp.to_dict()


@router.delete("/{emp_id}")
def remove_employee(
    emp_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = _get_emp(db, emp_id)
    if emp.role in PROTECTED_ROLES:
        raise HTTPException(400, "Cannot remove CEO, Partner or HR accounts.")
    db.delete(emp)
    db.commit()
    return {"ok": True}
