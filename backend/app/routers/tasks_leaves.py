from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, Task, TaskUpdate, Leave, new_id
from ..schemas import TaskIn, TaskStatusIn, LeaveIn, LeaveStatusIn
from ..auth import get_current_user, require_roles, team_member_ids, employees_for_user
from ..config import get_settings

router = APIRouter(prefix="/api", tags=["tasks-leaves"])


def _tl_task_ids(db: Session, tl: Employee) -> set[str]:
    return team_member_ids(db, tl) | {tl.id}


def _tl_can_access_task(db: Session, tl: Employee, task: Task) -> bool:
    return task.assigned_to in _tl_task_ids(db, tl)


def _leave_dicts(db: Session, leaves: list[Leave]) -> list[dict]:
    if not leaves:
        return []
    emp_ids = {l.emp_id for l in leaves}
    emp_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()}
    return [
        l.to_dict(
            emp_name=emp_map[l.emp_id].name if l.emp_id in emp_map else None,
            emp_role=emp_map[l.emp_id].role if l.emp_id in emp_map else None,
        )
        for l in leaves
    ]


def _can_review_leave(db: Session, applicant: Employee, reviewer: Employee, leave_emp_id: str) -> None:
    if applicant.role == "Manager" and reviewer.role != "HR":
        raise HTTPException(403, "Manager leave requests can only be approved or rejected by HR.")
    if reviewer.role in ("TL", "Manager"):
        team_ids = {e.id for e in employees_for_user(db, reviewer)}
        if leave_emp_id not in team_ids:
            raise HTTPException(403, "You can only approve leave for your team.")


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    q = db.query(Task)
    if user.role in ("Employee", "Manager", "Sales"):
        q = q.filter(Task.assigned_to == user.id)
    elif user.role == "TL":
        allowed = _tl_task_ids(db, user)
        q = q.filter(Task.assigned_to.in_(allowed))
    return {"tasks": [t.to_dict() for t in q.all()]}


@router.post("/tasks")
def create_task(
    body: TaskIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("TL", "Employee", "Manager", "Sales")),
):
    if not body.title.strip() or not body.endDate:
        raise HTTPException(400, "Task title and deadline date are required.")
    if user.role == "TL":
        assigned_to = body.assignedTo or user.id
        allowed = _tl_task_ids(db, user)
        if assigned_to not in allowed:
            raise HTTPException(403, "You can only assign tasks to yourself or members of your team.")
    else:
        assigned_to = user.id
    t = Task(
        id=new_id(),
        title=body.title.strip(),
        description=body.desc or "",
        assigned_to=assigned_to,
        assigned_by=user.name,
        start_date=date.fromisoformat(body.startDate) if body.startDate else None,
        start_time=body.startTime,
        end_date=date.fromisoformat(body.endDate),
        end_time=body.endTime,
        status="Pending",
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.to_dict()


VALID_TASK_STATUSES = (
    "Not Started",
    "Pending",
    "In Progress",
    "On Hold",
    "Under Review",
    "Needs Feedback",
    "Completed",
    "Blocked",
)


@router.patch("/tasks/{task_id}/status")
def update_task_status(
    task_id: str,
    body: TaskStatusIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    if user.role == "TL":
        if not _tl_can_access_task(db, user, t):
            raise HTTPException(403, "Not a task for your team")
    elif user.role not in ("HR", "CEO", "Partner") and t.assigned_to != user.id:
        raise HTTPException(403, "Not your task")
    if body.status is None and body.progress is None:
        raise HTTPException(400, "Provide status and/or progress")
    changes: list[str] = []
    if body.status is not None:
        if body.status not in VALID_TASK_STATUSES:
            raise HTTPException(400, "Invalid status")
        t.status = body.status
        changes.append(f"Status set to {body.status}")
    if body.progress is not None:
        if body.progress < 0 or body.progress > 100:
            raise HTTPException(400, "Progress must be between 0 and 100")
        t.progress = body.progress
        changes.append(f"Progress set to {body.progress}%")
    db.add(
        TaskUpdate(
            task_id=t.id,
            text="; ".join(changes),
            time=datetime.now().strftime("%c"),
        )
    )
    db.commit()
    db.refresh(t)
    return t.to_dict()


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("TL")),
):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    allowed = _tl_task_ids(db, user)
    if t.assigned_to not in allowed:
        raise HTTPException(403, "Not a task for your team")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.get("/leaves")
def list_leaves(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    q = db.query(Leave)
    if user.role in ("TL", "Manager"):
        emp_ids = {e.id for e in employees_for_user(db, user)}
        emp_ids.add(user.id)
        q = q.filter(Leave.emp_id.in_(emp_ids))
    elif user.role not in ("HR", "CEO", "Partner"):
        q = q.filter(Leave.emp_id == user.id)
    return {"leaves": _leave_dicts(db, q.all())}


@router.post("/leaves")
def apply_leave(
    body: LeaveIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if not body.fromDate or not body.toDate:
        raise HTTPException(400, "Pick both dates.")
    l = Leave(
        id=new_id(),
        emp_id=user.id,
        from_date=date.fromisoformat(body.fromDate),
        to_date=date.fromisoformat(body.toDate),
        reason=body.reason or "",
        status="Pending",
    )
    db.add(l)
    db.commit()
    db.refresh(l)
    return l.to_dict(emp_name=user.name, emp_role=user.role)


@router.patch("/leaves/{leave_id}/status")
def set_leave_status(
    leave_id: str,
    body: LeaveStatusIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "Manager", "TL")),
):
    l = db.query(Leave).filter(Leave.id == leave_id).first()
    if not l:
        raise HTTPException(404, "Leave not found")
    applicant = db.query(Employee).filter(Employee.id == l.emp_id).first()
    if not applicant:
        raise HTTPException(404, "Applicant not found")
    if body.status not in ("Approved", "Rejected", "Pending"):
        raise HTTPException(400, "Invalid status")
    _can_review_leave(db, applicant, user, l.emp_id)
    l.status = body.status
    if body.status in ("Approved", "Rejected"):
        l.reviewed_by_id = user.id
        l.reviewed_by_name = user.name
        l.reviewed_at = date.today()
    else:
        l.reviewed_by_id = None
        l.reviewed_by_name = None
        l.reviewed_at = None
    db.commit()
    db.refresh(l)
    return l.to_dict(emp_name=applicant.name, emp_role=applicant.role)


@router.get("/leaves/balance")
def leave_balance(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    year = str(date.today().year)
    leaves = (
        db.query(Leave)
        .filter(Leave.emp_id == user.id, Leave.status == "Approved")
        .all()
    )
    used = 0
    for l in leaves:
        if l.from_date.isoformat()[:4] == year:
            days = (l.to_date - l.from_date).days + 1
            used += max(1, days)
    quota = get_settings().annual_leave_quota
    return {"used": used, "quota": quota}
