from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import (
    Employee,
    Complaint,
    CeoVision,
    ClientAccount,
    FreelanceJob,
    FreelanceRequest,
    Portfolio,
    new_id,
)
from ..schemas import (
    ComplaintIn,
    VisionIn,
    ClientAccountIn,
    FreelanceJobIn,
    FreelanceSubmitIn,
    PortfolioIn,
)
from ..auth import get_current_user, require_roles, FREELANCE_MANAGERS

router = APIRouter(prefix="/api", tags=["misc"])


# -------- Complaints --------
@router.get("/complaints")
def list_complaints(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    q = db.query(Complaint)
    if user.role not in ("HR", "CEO", "Partner"):
        q = q.filter(Complaint.from_id == user.id)
    return {"complaints": [c.to_dict() for c in q.order_by(Complaint.date.desc()).all()]}


@router.post("/complaints")
def submit_complaint(
    body: ComplaintIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Write something before sending.")
    from datetime import datetime

    c = Complaint(
        id=new_id(),
        from_id=user.id,
        from_name=user.name,
        from_role=user.role,
        text=text,
        date=datetime.now().strftime("%c"),
        status="Open",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c.to_dict()


@router.patch("/complaints/{cid}/resolve")
def resolve_complaint(
    cid: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    c = db.query(Complaint).filter(Complaint.id == cid).first()
    if not c:
        raise HTTPException(404, "Not found")
    c.status = "Reviewed"
    db.commit()
    return c.to_dict()


# -------- Vision --------
@router.get("/vision")
def list_vision(db: Session = Depends(get_db), user: Employee = Depends(require_roles("HR", "CEO", "Partner"))):
    return {"vision": [v.to_dict() for v in db.query(CeoVision).order_by(CeoVision.date.desc()).all()]}


@router.post("/vision")
def save_vision(
    body: VisionIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Empty vision")
    v = CeoVision(id=new_id(), text=text, date=date.today())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v.to_dict()


# -------- Client accounts vault --------
@router.get("/client-accounts")
def list_accounts(db: Session = Depends(get_db), user: Employee = Depends(require_roles("TL"))):
    return {
        "accounts": [
            a.to_dict() for a in db.query(ClientAccount).order_by(ClientAccount.name).all()
        ]
    }


@router.post("/client-accounts")
def add_account(
    body: ClientAccountIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("TL")),
):
    if not body.name.strip():
        raise HTTPException(400, "Client name is required.")
    a = ClientAccount(
        id=new_id(),
        name=body.name.strip(),
        business=body.business,
        website=body.website,
        website_pass=body.websitePass,
        insta_user=body.instaUser,
        insta_pass=body.instaPass,
        fb_user=body.fbUser,
        fb_pass=body.fbPass,
        other_label=body.otherLabel,
        other_user=body.otherUser,
        other_pass=body.otherPass,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a.to_dict()


@router.delete("/client-accounts/{aid}")
def delete_account(
    aid: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("TL")),
):
    a = db.query(ClientAccount).filter(ClientAccount.id == aid).first()
    if not a:
        raise HTTPException(404, "Not found")
    db.delete(a)
    db.commit()
    return {"ok": True}


# -------- Freelance --------
@router.get("/freelance/jobs")
def list_jobs(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    jobs = db.query(FreelanceJob).options(joinedload(FreelanceJob.requests)).all()
    if user.role == "Freelancer":
        jobs = [j for j in jobs if j.status == "Open" or j.assigned_freelancer_id == user.id]
    return {"jobs": [j.to_dict() for j in jobs]}


@router.post("/freelance/jobs")
def post_job(
    body: FreelanceJobIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in FREELANCE_MANAGERS:
        raise HTTPException(403, "Only TL/HR/CEO can post jobs")
    if not body.title.strip() or not body.deadline:
        raise HTTPException(400, "Job title and deadline are required.")
    j = FreelanceJob(
        id=new_id(),
        title=body.title.strip(),
        description=body.desc or "",
        deadline=date.fromisoformat(body.deadline),
        posted_by=user.name,
        posted_by_role=user.role,
        status="Open",
    )
    db.add(j)
    db.commit()
    db.refresh(j)
    return j.to_dict()


@router.post("/freelance/jobs/{job_id}/request")
def request_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("Freelancer")),
):
    job = (
        db.query(FreelanceJob)
        .options(joinedload(FreelanceJob.requests))
        .filter(FreelanceJob.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Job not found")
    if any(r.freelancer_id == user.id for r in job.requests):
        raise HTTPException(400, "You already requested this job.")
    db.add(
        FreelanceRequest(
            id=new_id(),
            job_id=job_id,
            freelancer_id=user.id,
            freelancer_name=user.name,
            date=date.today(),
            status="Pending",
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/freelance/jobs/{job_id}/assign/{freelancer_id}")
def assign_job(
    job_id: str,
    freelancer_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in FREELANCE_MANAGERS:
        raise HTTPException(403, "Denied")
    job = (
        db.query(FreelanceJob)
        .options(joinedload(FreelanceJob.requests))
        .filter(FreelanceJob.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Not found")
    req = next((r for r in job.requests if r.freelancer_id == freelancer_id), None)
    if not req:
        raise HTTPException(404, "Request not found")
    for r in job.requests:
        r.status = "Accepted" if r.freelancer_id == freelancer_id else "Declined"
    job.assigned_freelancer_id = freelancer_id
    job.assigned_freelancer_name = req.freelancer_name
    job.status = "Assigned"
    db.commit()
    return job.to_dict()


@router.post("/freelance/jobs/{job_id}/submit")
def submit_job(
    job_id: str,
    body: FreelanceSubmitIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("Freelancer")),
):
    job = db.query(FreelanceJob).filter(FreelanceJob.id == job_id).first()
    if not job or job.assigned_freelancer_id != user.id:
        raise HTTPException(403, "Not your job")
    job.status = "Submitted"
    job.submission_note = body.note or ""
    job.submission_image = body.image
    job.submission_date = date.today()
    job.submission_by = user.name
    db.commit()
    return job.to_dict()


@router.post("/freelance/jobs/{job_id}/approve")
def approve_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in FREELANCE_MANAGERS:
        raise HTTPException(403, "Denied")
    job = db.query(FreelanceJob).filter(FreelanceJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Not found")
    job.status = "Completed"
    db.commit()
    return job.to_dict()


@router.post("/freelance/jobs/{job_id}/request-changes")
def request_changes(
    job_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in FREELANCE_MANAGERS:
        raise HTTPException(403, "Denied")
    job = db.query(FreelanceJob).filter(FreelanceJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Not found")
    job.status = "Assigned"
    job.submission_note = None
    job.submission_image = None
    job.submission_date = None
    job.submission_by = None
    db.commit()
    return job.to_dict()


@router.post("/freelance/jobs/{job_id}/reassign")
def reassign_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in FREELANCE_MANAGERS:
        raise HTTPException(403, "Denied")
    job = (
        db.query(FreelanceJob)
        .options(joinedload(FreelanceJob.requests))
        .filter(FreelanceJob.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Not found")
    for r in list(job.requests):
        db.delete(r)
    job.assigned_freelancer_id = None
    job.assigned_freelancer_name = None
    job.status = "Open"
    job.submission_note = None
    job.submission_image = None
    job.submission_date = None
    job.submission_by = None
    db.commit()
    return job.to_dict()


@router.delete("/freelance/jobs/{job_id}")
def delete_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role not in FREELANCE_MANAGERS:
        raise HTTPException(403, "Denied")
    job = db.query(FreelanceJob).filter(FreelanceJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Not found")
    db.delete(job)
    db.commit()
    return {"ok": True}


# -------- Portfolio --------
@router.get("/portfolio")
def list_portfolio(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    items = (
        db.query(Portfolio)
        .filter(Portfolio.freelancer_id == user.id)
        .order_by(Portfolio.date.desc())
        .all()
    )
    return {"portfolio": [p.to_dict() for p in items]}


@router.post("/portfolio")
def add_portfolio(
    body: PortfolioIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("Freelancer")),
):
    if not body.title.strip():
        raise HTTPException(400, "Give your project a title.")
    p = Portfolio(
        id=new_id(),
        freelancer_id=user.id,
        title=body.title.strip(),
        description=body.desc or "",
        image=body.image,
        date=date.today(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p.to_dict()


@router.delete("/portfolio/{pid}")
def delete_portfolio(
    pid: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("Freelancer")),
):
    p = db.query(Portfolio).filter(Portfolio.id == pid, Portfolio.freelancer_id == user.id).first()
    if not p:
        raise HTTPException(404, "Not found")
    db.delete(p)
    db.commit()
    return {"ok": True}
