from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, Payslip, new_id
from ..schemas import PayslipIn, PayslipUpdateIn
from ..auth import get_current_user, require_roles

router = APIRouter(prefix="/api/payslips", tags=["payslips"])

PAYROLL_ROLES = {"Employee", "Manager", "Sales", "TL"}


def _payslip_dict(db: Session, slip: Payslip) -> dict:
    emp = db.query(Employee).filter(Employee.id == slip.emp_id).first()
    return slip.to_dict(
        emp_name=emp.name if emp else None,
        emp_role=emp.role if emp else None,
        emp_department=emp.department if emp else None,
    )


def _get_slip(db: Session, slip_id: str) -> Payslip:
    slip = db.query(Payslip).filter(Payslip.id == slip_id).first()
    if not slip:
        raise HTTPException(404, "Payslip not found")
    return slip


@router.get("")
def list_payslips(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    emp_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    q = db.query(Payslip)
    if user.role == "HR":
        if emp_id:
            q = q.filter(Payslip.emp_id == emp_id)
    else:
        q = q.filter(Payslip.emp_id == user.id, Payslip.status == "Published")
    if month:
        q = q.filter(Payslip.month == month)
    slips = q.order_by(Payslip.month.desc()).all()
    return {"payslips": [_payslip_dict(db, s) for s in slips]}


@router.get("/{slip_id}")
def get_payslip(
    slip_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    slip = _get_slip(db, slip_id)
    if user.role != "HR":
        if slip.emp_id != user.id or slip.status != "Published":
            raise HTTPException(403, "Access denied")
    return _payslip_dict(db, slip)


@router.post("")
def create_or_update_payslip(
    body: PayslipIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    emp = db.query(Employee).filter(Employee.id == body.empId).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp.role not in PAYROLL_ROLES:
        raise HTTPException(400, "Payslips can only be issued for payroll staff.")

    slip = (
        db.query(Payslip)
        .filter(Payslip.emp_id == body.empId, Payslip.month == body.month)
        .first()
    )
    if slip and slip.status == "Published":
        raise HTTPException(400, "Published payslip cannot be overwritten. Unpublish first.")

    score = body.performanceScore
    if score is not None:
        score = max(0, min(100, score))

    if not slip:
        slip = Payslip(id=new_id(), emp_id=body.empId, month=body.month, status="Draft")
        db.add(slip)

    slip.base_salary = body.baseSalary
    slip.incentive = body.incentive
    slip.allowance = body.allowance
    slip.deduction = body.deduction
    slip.working_days = body.workingDays
    slip.paid_days = body.paidDays
    slip.lop_days = body.lopDays or 0
    slip.performance_score = score if score is not None else emp.performance_score
    slip.notes = (body.notes or "").strip()

    db.commit()
    db.refresh(slip)
    return _payslip_dict(db, slip)


@router.patch("/{slip_id}")
def update_payslip(
    slip_id: str,
    body: PayslipUpdateIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    slip = _get_slip(db, slip_id)
    data = body.model_dump(exclude_unset=True)
    if slip.status == "Published" and data.get("status") != "Draft":
        allowed = {"notes"}
        if any(k not in allowed for k in data.keys()):
            raise HTTPException(400, "Published payslip is locked. Set status to Draft to edit.")

    field_map = {
        "baseSalary": "base_salary",
        "incentive": "incentive",
        "allowance": "allowance",
        "deduction": "deduction",
        "workingDays": "working_days",
        "paidDays": "paid_days",
        "lopDays": "lop_days",
        "performanceScore": "performance_score",
        "notes": "notes",
        "status": "status",
    }
    for key, val in data.items():
        attr = field_map.get(key)
        if not attr:
            continue
        if key == "performanceScore" and val is not None:
            val = max(0, min(100, val))
        setattr(slip, attr, val)

    if data.get("status") == "Published":
        slip.published_at = date.today()
    elif data.get("status") == "Draft":
        slip.published_at = None

    db.commit()
    db.refresh(slip)
    return _payslip_dict(db, slip)


@router.post("/{slip_id}/publish")
def publish_payslip(
    slip_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    slip = _get_slip(db, slip_id)
    slip.status = "Published"
    slip.published_at = date.today()
    db.commit()
    db.refresh(slip)
    return _payslip_dict(db, slip)


@router.delete("/{slip_id}")
def delete_payslip(
    slip_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    slip = _get_slip(db, slip_id)
    if slip.status == "Published":
        raise HTTPException(400, "Cannot delete a published payslip. Revert to draft first.")
    db.delete(slip)
    db.commit()
    return {"ok": True}
