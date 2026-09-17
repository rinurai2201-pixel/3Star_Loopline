from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, Client, Expense, new_id
from ..schemas import ClientBillingIn, ExpenseIn
from ..auth import get_current_user, require_roles

router = APIRouter(prefix="/api/revenue", tags=["revenue"])


@router.get("/clients")
def list_clients(
    month: str | None = Query(None),
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    q = db.query(Client)
    if month:
        q = q.filter(Client.month == month)
    return {"clients": [c.to_dict() for c in q.all()]}


@router.post("/clients")
def add_client(
    body: ClientBillingIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    if not body.name.strip():
        raise HTTPException(400, "Client name is required.")
    c = Client(
        id=new_id(),
        name=body.name.strip(),
        business_name=body.businessName or "",
        services=body.services or [],
        amount=body.amount,
        paid=body.paid,
        pending=body.pending,
        holding=body.holding,
        gst=body.gst,
        tax=body.tax,
        pay_status=body.payStatus,
        joining_date=date.fromisoformat(body.joiningDate) if body.joiningDate else None,
        month=body.month,
        meeting_date=date.fromisoformat(body.meetingDate) if body.meetingDate else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c.to_dict()


@router.delete("/clients/{client_id}")
def delete_client(
    client_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(404, "Not found")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/expenses")
def list_expenses(
    month: str | None = Query(None),
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    q = db.query(Expense)
    if month:
        q = q.filter(Expense.month == month)
    return {"expenses": [e.to_dict() for e in q.all()]}


@router.post("/expenses")
def add_expense(
    body: ExpenseIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    if not body.label.strip():
        raise HTTPException(400, "Expense label required.")
    e = Expense(id=new_id(), label=body.label.strip(), amount=body.amount, month=body.month)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e.to_dict()


@router.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.get("/summary")
def summary(
    month: str | None = Query(None),
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR", "CEO", "Partner")),
):
    month = month or date.today().strftime("%Y-%m")
    clients = db.query(Client).filter(Client.month == month).all()
    expenses = db.query(Expense).filter(Expense.month == month).all()
    total_amt = sum(float(c.amount or 0) for c in clients)
    total_paid = sum(float(c.paid or 0) for c in clients)
    total_pending = sum(float(c.pending or 0) for c in clients)
    total_holding = sum(float(c.holding or 0) for c in clients)
    total_gst = sum(float(c.gst or 0) for c in clients)
    total_tax = sum(float(c.tax or 0) for c in clients)
    total_exp = sum(float(e.amount or 0) for e in expenses)
    profit = total_paid - total_exp - total_gst - total_tax
    return {
        "month": month,
        "totalBilled": total_amt,
        "received": total_paid,
        "pending": total_pending,
        "holding": total_holding,
        "gst": total_gst,
        "tax": total_tax,
        "expenses": total_exp,
        "profit": profit,
        "clients": [c.to_dict() for c in clients],
        "expenseList": [e.to_dict() for e in expenses],
    }


@router.get("/reports")
def reports(db: Session = Depends(get_db), user: Employee = Depends(require_roles("HR", "CEO", "Partner"))):
    clients = db.query(Client).all()
    expenses = db.query(Expense).all()
    by_month: dict[str, dict] = {}

    def _bucket(month: str) -> dict:
        if month not in by_month:
            by_month[month] = {
                "clients": set(),
                "billed": 0.0,
                "paid": 0.0,
                "pending": 0.0,
                "holding": 0.0,
                "gst": 0.0,
                "tax": 0.0,
                "expenses": 0.0,
            }
        return by_month[month]

    for c in clients:
        d = _bucket(c.month)
        d["clients"].add(c.name)
        d["billed"] += float(c.amount or 0)
        d["paid"] += float(c.paid or 0)
        d["pending"] += float(c.pending or 0)
        d["holding"] += float(c.holding or 0)
        d["gst"] += float(c.gst or 0)
        d["tax"] += float(c.tax or 0)

    for e in expenses:
        d = _bucket(e.month)
        d["expenses"] += float(e.amount or 0)

    months = []
    for m, d in sorted(by_month.items(), reverse=True):
        profit = d["paid"] - d["expenses"] - d["gst"] - d["tax"]
        months.append(
            {
                "month": m,
                "clients": len(d["clients"]),
                "billed": d["billed"],
                "paid": d["paid"],
                "pending": d["pending"],
                "holding": d["holding"],
                "gst": d["gst"],
                "tax": d["tax"],
                "expenses": d["expenses"],
                "profit": profit,
            }
        )
    return {"byMonth": months, "clients": [c.to_dict() for c in clients], "expenses": [e.to_dict() for e in expenses]}
