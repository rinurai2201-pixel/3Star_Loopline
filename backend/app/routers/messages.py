import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, Message, new_id
from ..schemas import MessageIn
from ..auth import get_current_user

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("/contacts")
def contacts(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    contacts = (
        db.query(Employee)
        .filter(Employee.id != user.id, Employee.active.is_(True))
        .order_by(Employee.name)
        .all()
    )
    unread_map = {}
    for c in contacts:
        unread_map[c.id] = (
            db.query(Message)
            .filter(Message.from_id == c.id, Message.to_id == user.id, Message.is_read == False)
            .count()
        )
    return {
        "contacts": [{**c.to_dict(), "unread": unread_map.get(c.id, 0)} for c in contacts]
    }


@router.get("/thread/{contact_id}")
def thread(
    contact_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    other = db.query(Employee).filter(Employee.id == contact_id).first()
    if not other:
        raise HTTPException(404, "Contact not found")
    msgs = (
        db.query(Message)
        .filter(
            ((Message.from_id == user.id) & (Message.to_id == contact_id))
            | ((Message.from_id == contact_id) & (Message.to_id == user.id))
        )
        .order_by(Message.ts.asc())
        .all()
    )
    changed = False
    for m in msgs:
        if m.from_id == contact_id and m.to_id == user.id and not m.is_read:
            m.is_read = True
            changed = True
    if changed:
        db.commit()
    return {"messages": [m.to_dict() for m in msgs]}


@router.post("")
def send_message(
    body: MessageIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if not body.toId or (not (body.text or "").strip() and not body.image):
        raise HTTPException(400, "Empty message")
    recipient = db.query(Employee).filter(Employee.id == body.toId).first()
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    m = Message(
        id=new_id(),
        from_id=user.id,
        from_name=user.name,
        to_id=body.toId,
        text=(body.text or "").strip(),
        image=body.image,
        time=datetime.now().strftime("%H:%M"),
        ts=int(time.time() * 1000),
        is_read=False,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m.to_dict()
