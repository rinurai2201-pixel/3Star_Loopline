from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Employee, CompanyHoliday, HrSetting, new_id
from ..schemas import HolidayIn, WeekendConfigIn
from ..auth import get_current_user, require_roles

router = APIRouter(prefix="/api/holidays", tags=["holidays"])

WEEKEND_DAYS_KEY = "weekend_days"
DEFAULT_WEEKEND_DAYS = [0, 6]


def _get_weekend_days(db: Session) -> list[int]:
    row = db.query(HrSetting).filter(HrSetting.key == WEEKEND_DAYS_KEY).first()
    if not row or not isinstance(row.value, list):
        return DEFAULT_WEEKEND_DAYS.copy()
    days = [int(d) for d in row.value if isinstance(d, (int, float)) and 0 <= int(d) <= 6]
    return days or DEFAULT_WEEKEND_DAYS.copy()


def _set_weekend_days(db: Session, days: list[int]) -> list[int]:
    cleaned = sorted({int(d) for d in days if 0 <= int(d) <= 6})
    if not cleaned:
        raise HTTPException(400, "Select at least one weekend day.")
    row = db.query(HrSetting).filter(HrSetting.key == WEEKEND_DAYS_KEY).first()
    if row:
        row.value = cleaned
    else:
        db.add(HrSetting(key=WEEKEND_DAYS_KEY, value=cleaned))
    db.commit()
    return cleaned


@router.get("/config")
def get_holiday_config(
    year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    q = db.query(CompanyHoliday).order_by(CompanyHoliday.date)
    if year:
        q = q.filter(
            CompanyHoliday.date >= date(year, 1, 1),
            CompanyHoliday.date <= date(year, 12, 31),
        )
    return {
        "holidays": [h.to_dict() for h in q.all()],
        "weekendDays": _get_weekend_days(db),
    }


@router.post("")
def add_holiday(
    body: HolidayIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    try:
        hol_date = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
    name = (body.name or "").strip()
    existing = db.query(CompanyHoliday).filter(CompanyHoliday.date == hol_date).first()
    if existing:
        existing.name = name or existing.name
        db.commit()
        db.refresh(existing)
        return existing.to_dict()
    row = CompanyHoliday(id=new_id(), date=hol_date, name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.to_dict()


@router.delete("/{holiday_id}")
def delete_holiday(
    holiday_id: str,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    row = db.query(CompanyHoliday).filter(CompanyHoliday.id == holiday_id).first()
    if not row:
        raise HTTPException(404, "Holiday not found.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.patch("/weekend-config")
def update_weekend_config(
    body: WeekendConfigIn,
    db: Session = Depends(get_db),
    user: Employee = Depends(require_roles("HR")),
):
    days = _set_weekend_days(db, body.weekendDays)
    return {"weekendDays": days}
