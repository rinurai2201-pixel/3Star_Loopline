from datetime import date, datetime
import calendar
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import Employee, Attendance, AttendanceBreak, Leave, new_id
from ..schemas import BreakIn, ManualAttendanceIn
from ..auth import get_current_user, require_roles, team_member_ids, employees_for_user, employee_dicts, NO_ATTENDANCE_ROLES, tracks_attendance

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def now_time() -> str:
    return datetime.now().strftime("%H:%M")


@router.get("")
def list_attendance(
    date_str: str | None = Query(None, alias="date"),
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    emp_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    q = db.query(Attendance).options(joinedload(Attendance.breaks))
    if date_str:
        q = q.filter(Attendance.date == date.fromisoformat(date_str))
    elif month:
        y, mo = map(int, month.split("-"))
        start = date(y, mo, 1)
        end = date(y, mo, calendar.monthrange(y, mo)[1])
        q = q.filter(Attendance.date >= start, Attendance.date <= end)
    if emp_id:
        q = q.filter(Attendance.emp_id == emp_id)
    elif tracks_attendance(user.role) and user.role not in ("HR", "TL"):
        q = q.filter(Attendance.emp_id == user.id)
    return {"attendance": [a.to_dict() for a in q.all()]}


@router.post("/clock")
def toggle_clock(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    if not tracks_attendance(user.role):
        raise HTTPException(403, "Attendance is not required for your role.")
    today = date.today()
    rec = (
        db.query(Attendance)
        .options(joinedload(Attendance.breaks))
        .filter(Attendance.emp_id == user.id, Attendance.date == today)
        .first()
    )
    if not rec:
        rec = Attendance(
            id=new_id(),
            emp_id=user.id,
            date=today,
            clock_in=now_time(),
            clock_out=None,
        )
        db.add(rec)
    elif not rec.clock_out:
        for b in rec.breaks:
            if not b.end_time:
                b.end_time = now_time()
        rec.clock_out = now_time()
    db.commit()
    db.refresh(rec)
    return rec.to_dict()


@router.post("/break")
def toggle_break(
    body: BreakIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if not tracks_attendance(user.role):
        raise HTTPException(403, "Attendance is not required for your role.")
    today = date.today()
    rec = (
        db.query(Attendance)
        .options(joinedload(Attendance.breaks))
        .filter(Attendance.emp_id == user.id, Attendance.date == today)
        .first()
    )
    if not rec or rec.clock_out:
        raise HTTPException(400, "Must be clocked in")
    open_break = next((b for b in rec.breaks if not b.end_time), None)
    if open_break and open_break.type == body.type:
        open_break.end_time = now_time()
    elif not open_break:
        db.add(
            AttendanceBreak(
                attendance_id=rec.id,
                type=body.type,
                start_time=now_time(),
                end_time=None,
            )
        )
    db.commit()
    rec = (
        db.query(Attendance)
        .options(joinedload(Attendance.breaks))
        .filter(Attendance.id == rec.id)
        .first()
    )
    return rec.to_dict()


@router.post("/manual")
def manual_attendance(
    body: ManualAttendanceIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in ("TL", "HR"):
        raise HTTPException(403, "Access denied for your role")
    target = db.query(Employee).filter(Employee.id == body.empId).first()
    if not target:
        raise HTTPException(404, "Employee not found")
    if target.role in NO_ATTENDANCE_ROLES:
        raise HTTPException(400, "Attendance is not tracked for this role.")
    if user.role == "TL":
        team_ids = team_member_ids(db, user)
        if body.empId not in team_ids:
            raise HTTPException(403, "You can only manage attendance for your team.")
    today = date.today()
    rec = (
        db.query(Attendance)
        .options(joinedload(Attendance.breaks))
        .filter(Attendance.emp_id == body.empId, Attendance.date == today)
        .first()
    )
    if body.action == "clockin":
        if not rec:
            rec = Attendance(
                id=new_id(),
                emp_id=body.empId,
                date=today,
                clock_in=now_time(),
                clock_out=None,
            )
            db.add(rec)
    elif body.action == "clockout":
        if rec and not rec.clock_out:
            for b in rec.breaks:
                if not b.end_time:
                    b.end_time = now_time()
            rec.clock_out = now_time()
    elif body.action == "breakin":
        if rec and not rec.clock_out:
            if not any(not b.end_time for b in rec.breaks):
                db.add(
                    AttendanceBreak(
                        attendance_id=rec.id,
                        type=body.breakType or "Break",
                        start_time=now_time(),
                        end_time=None,
                    )
                )
    elif body.action == "breakout":
        if rec:
            for b in rec.breaks:
                if not b.end_time and (b.type or "Break") == (body.breakType or "Break"):
                    b.end_time = now_time()
                    break
    db.commit()
    return {"ok": True}


@router.get("/status-board")
def status_board(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    today = date.today()
    if user.role in ("TL", "Manager"):
        emps = employees_for_user(db, user)
    elif user.role == "HR":
        emps = (
            db.query(Employee)
            .filter(
                Employee.role.notin_(NO_ATTENDANCE_ROLES | {"Freelancer"}),
                Employee.active.is_(True),
            )
            .order_by(Employee.name)
            .all()
        )
    else:
        emps = (
            db.query(Employee)
            .filter(Employee.role.notin_(NO_ATTENDANCE_ROLES), Employee.active.is_(True))
            .order_by(Employee.name)
            .all()
        )
    emp_ids = {e.id for e in emps}
    if not emp_ids:
        return {"employees": employee_dicts(db, emps), "attendance": [], "onLeaveIds": []}
    att = (
        db.query(Attendance)
        .options(joinedload(Attendance.breaks))
        .filter(Attendance.date == today, Attendance.emp_id.in_(emp_ids))
        .all()
    )
    leaves = (
        db.query(Leave)
        .filter(
            Leave.status == "Approved",
            Leave.from_date <= today,
            Leave.to_date >= today,
            Leave.emp_id.in_(emp_ids),
        )
        .all()
    )
    leave_ids = {l.emp_id for l in leaves}
    return {
        "employees": employee_dicts(db, emps),
        "attendance": [a.to_dict() for a in att],
        "onLeaveIds": list(leave_ids),
    }
