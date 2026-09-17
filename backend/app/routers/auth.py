from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, Session as Sess
from ..schemas import LoginIn, UnlockIn, ChangePasswordIn
from ..auth import (
    create_session,
    get_current_user,
    verify_role_code,
    landing_page,
    role_rules,
)
from ..passwords import verify_password, hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not email or not body.password:
        raise HTTPException(400, "Email and password are required.")
    emp = db.query(Employee).filter(Employee.email == email).first()
    if not emp or not emp.password_hash or not verify_password(body.password, emp.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    if not emp.active:
        raise HTTPException(403, "This account has been deactivated. Contact HR.")
    token = create_session(db, emp.id)
    return {
        "token": token,
        "user": emp.to_dict(),
        "landingPage": landing_page(emp.role),
        "roleRules": role_rules(emp.role),
    }


@router.post("/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        sess = db.query(Sess).filter(Sess.token == token).first()
        if sess:
            db.delete(sess)
            db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: Employee = Depends(get_current_user)):
    return {
        "user": user.to_dict(),
        "landingPage": landing_page(user.role),
        "roleRules": role_rules(user.role),
    }


@router.post("/change-password")
def change_password(
    body: ChangePasswordIn,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    current = (body.currentPassword or "").strip()
    new_password = (body.newPassword or "").strip()
    if not current or not new_password:
        raise HTTPException(400, "Current password and new password are required.")
    if len(new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")
    if current == new_password:
        raise HTTPException(400, "New password must be different from the current password.")
    if not user.password_hash or not verify_password(current, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    user.password_hash = hash_password(new_password)
    # Sign out other devices; keep this session
    current_token = None
    if authorization and authorization.startswith("Bearer "):
        current_token = authorization.split(" ", 1)[1].strip()
    q = db.query(Sess).filter(Sess.emp_id == user.id)
    if current_token:
        q = q.filter(Sess.token != current_token)
    q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "message": "Password updated successfully."}


@router.post("/unlock")
def unlock(body: UnlockIn, user: Employee = Depends(get_current_user)):
    from ..config import get_settings

    settings = get_settings()
    expected = settings.role_passwords.get(user.role)
    if body.password and body.password == expected:
        return {"unlocked": True}
    raise HTTPException(400, "Incorrect password for your role.")
