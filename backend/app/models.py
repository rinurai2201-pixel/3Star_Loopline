import secrets
from datetime import date
from sqlalchemy import (
    Column, String, Text, Integer, BigInteger, Boolean, Date, Numeric, ForeignKey
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .database import Base


def new_id() -> str:
    return secrets.token_hex(4)


class Employee(Base):
    __tablename__ = "employees"
    id = Column(String(16), primary_key=True, default=new_id)
    name = Column(String(120), nullable=False)
    email = Column(String(120), unique=True, nullable=True)
    password_hash = Column(Text, nullable=True)
    role = Column(String(40), nullable=False)
    department = Column(String(120), default="")
    birthday = Column(Date, nullable=True)
    base_salary = Column(Numeric(12, 2), default=0)
    incentive = Column(Numeric(12, 2), default=0)
    performance_score = Column(Integer, nullable=True)
    tl_id = Column(String(16), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    active = Column(Boolean, default=True, nullable=False)

    def to_dict(self, tl_name: str | None = None):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email or "",
            "role": self.role,
            "department": self.department or "",
            "birthday": self.birthday.isoformat() if self.birthday else None,
            "baseSalary": float(self.base_salary or 0),
            "incentive": float(self.incentive or 0),
            "performanceScore": self.performance_score,
            "tlId": self.tl_id,
            "tlName": tl_name,
            "active": bool(self.active),
        }


class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(String(16), primary_key=True, default=new_id)
    emp_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    clock_in = Column(String(8))
    clock_out = Column(String(8))
    breaks = relationship("AttendanceBreak", back_populates="attendance", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "empId": self.emp_id,
            "date": self.date.isoformat() if self.date else None,
            "clockIn": self.clock_in,
            "clockOut": self.clock_out,
            "breaks": [b.to_dict() for b in self.breaks],
        }


class AttendanceBreak(Base):
    __tablename__ = "attendance_breaks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    attendance_id = Column(String(16), ForeignKey("attendance.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(20), nullable=False)
    start_time = Column(String(8), nullable=False)
    end_time = Column(String(8))
    attendance = relationship("Attendance", back_populates="breaks")

    def to_dict(self):
        return {"type": self.type, "start": self.start_time, "end": self.end_time}


class Task(Base):
    __tablename__ = "tasks"
    id = Column(String(16), primary_key=True, default=new_id)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    assigned_to = Column(String(16), ForeignKey("employees.id", ondelete="SET NULL"))
    assigned_by = Column(String(120))
    start_date = Column(Date)
    start_time = Column(String(8))
    end_date = Column(Date)
    end_time = Column(String(8))
    status = Column(String(40), default="Pending")
    progress = Column(Integer, default=0, nullable=False)
    updates = relationship("TaskUpdate", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "desc": self.description or "",
            "assignedTo": self.assigned_to,
            "assignedBy": self.assigned_by,
            "startDate": self.start_date.isoformat() if self.start_date else None,
            "startTime": self.start_time,
            "endDate": self.end_date.isoformat() if self.end_date else None,
            "endTime": self.end_time,
            "status": self.status,
            "progress": self.progress or 0,
            "updates": [{"text": u.text, "time": u.time} for u in self.updates],
        }


class TaskUpdate(Base):
    __tablename__ = "task_updates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(16), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    time = Column(String(80))


class Leave(Base):
    __tablename__ = "leaves"
    id = Column(String(16), primary_key=True, default=new_id)
    emp_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(Text, default="")
    status = Column(String(40), default="Pending")
    reviewed_by_id = Column(String(16), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    reviewed_by_name = Column(String(120))
    reviewed_at = Column(Date, nullable=True)

    def to_dict(self, emp_name: str | None = None, emp_role: str | None = None):
        return {
            "id": self.id,
            "empId": self.emp_id,
            "empName": emp_name,
            "empRole": emp_role,
            "from": self.from_date.isoformat(),
            "to": self.to_date.isoformat(),
            "reason": self.reason or "",
            "status": self.status,
            "reviewedById": self.reviewed_by_id,
            "reviewedByName": self.reviewed_by_name or "",
            "reviewedAt": self.reviewed_at.isoformat() if self.reviewed_at else None,
        }


class Message(Base):
    __tablename__ = "messages"
    id = Column(String(16), primary_key=True, default=new_id)
    from_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    from_name = Column(String(120))
    to_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, default="")
    image = Column(Text)
    time = Column(String(40))
    ts = Column(BigInteger)
    is_read = Column("read", Boolean, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "fromId": self.from_id,
            "fromName": self.from_name,
            "toId": self.to_id,
            "text": self.text or "",
            "image": self.image,
            "time": self.time,
            "ts": self.ts,
            "read": bool(self.is_read),
        }


class Client(Base):
    __tablename__ = "clients"
    id = Column(String(16), primary_key=True, default=new_id)
    name = Column(String(160), nullable=False)
    business_name = Column(String(160), default="")
    services = Column(JSONB, default=list)
    amount = Column(Numeric(14, 2), default=0)
    paid = Column(Numeric(14, 2), default=0)
    pending = Column(Numeric(14, 2), default=0)
    holding = Column(Numeric(14, 2), default=0)
    gst = Column(Numeric(14, 2), default=0)
    tax = Column(Numeric(14, 2), default=0)
    pay_status = Column(String(40), default="Pending")
    joining_date = Column(Date)
    month = Column(String(7), nullable=False)
    meeting_date = Column(Date)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "businessName": self.business_name or "",
            "services": self.services or [],
            "amount": float(self.amount or 0),
            "paid": float(self.paid or 0),
            "pending": float(self.pending or 0),
            "holding": float(self.holding or 0),
            "gst": float(self.gst or 0),
            "tax": float(self.tax or 0),
            "payStatus": self.pay_status,
            "joiningDate": self.joining_date.isoformat() if self.joining_date else None,
            "month": self.month,
            "meetingDate": self.meeting_date.isoformat() if self.meeting_date else None,
        }


class Expense(Base):
    __tablename__ = "expenses"
    id = Column(String(16), primary_key=True, default=new_id)
    label = Column(String(200), nullable=False)
    amount = Column(Numeric(14, 2), default=0)
    month = Column(String(7), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "amount": float(self.amount or 0),
            "month": self.month,
        }


class IncentiveLog(Base):
    __tablename__ = "incentive_log"
    id = Column(String(16), primary_key=True, default=new_id)
    emp_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    date = Column(Date, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "empId": self.emp_id,
            "amount": float(self.amount or 0),
            "date": self.date.isoformat(),
        }


class Payslip(Base):
    __tablename__ = "payslips"
    id = Column(String(16), primary_key=True, default=new_id)
    emp_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    month = Column(String(7), nullable=False)
    base_salary = Column(Numeric(12, 2), default=0)
    incentive = Column(Numeric(12, 2), default=0)
    allowance = Column(Numeric(12, 2), default=0)
    deduction = Column(Numeric(12, 2), default=0)
    working_days = Column(Integer, nullable=True)
    paid_days = Column(Integer, nullable=True)
    lop_days = Column(Integer, default=0)
    performance_score = Column(Integer, nullable=True)
    notes = Column(Text, default="")
    status = Column(String(20), default="Draft")
    published_at = Column(Date, nullable=True)

    def net_pay(self) -> float:
        return float(self.base_salary or 0) + float(self.incentive or 0) + float(self.allowance or 0) - float(self.deduction or 0)

    def to_dict(self, emp_name: str | None = None, emp_role: str | None = None, emp_department: str | None = None):
        return {
            "id": self.id,
            "empId": self.emp_id,
            "empName": emp_name,
            "empRole": emp_role,
            "empDepartment": emp_department,
            "month": self.month,
            "baseSalary": float(self.base_salary or 0),
            "incentive": float(self.incentive or 0),
            "allowance": float(self.allowance or 0),
            "deduction": float(self.deduction or 0),
            "workingDays": self.working_days,
            "paidDays": self.paid_days,
            "lopDays": self.lop_days or 0,
            "performanceScore": self.performance_score,
            "notes": self.notes or "",
            "status": self.status or "Draft",
            "netPay": self.net_pay(),
            "publishedAt": self.published_at.isoformat() if self.published_at else None,
        }


class Complaint(Base):
    __tablename__ = "complaints"
    id = Column(String(16), primary_key=True, default=new_id)
    from_id = Column(String(16), ForeignKey("employees.id", ondelete="SET NULL"))
    from_name = Column(String(120))
    from_role = Column(String(40))
    text = Column(Text, nullable=False)
    date = Column(String(80))
    status = Column(String(40), default="Open")

    def to_dict(self):
        return {
            "id": self.id,
            "fromId": self.from_id,
            "fromName": self.from_name,
            "fromRole": self.from_role,
            "text": self.text,
            "date": self.date,
            "status": self.status,
        }


class CeoVision(Base):
    __tablename__ = "ceo_vision"
    id = Column(String(16), primary_key=True, default=new_id)
    text = Column(Text, nullable=False)
    date = Column(Date, nullable=False)

    def to_dict(self):
        return {"id": self.id, "text": self.text, "date": self.date.isoformat()}


class ClientAccount(Base):
    __tablename__ = "client_accounts"
    id = Column(String(16), primary_key=True, default=new_id)
    name = Column(String(160), nullable=False)
    business = Column(String(160), default="")
    website = Column(Text, default="")
    website_pass = Column(Text, default="")
    insta_user = Column(String(120), default="")
    insta_pass = Column(Text, default="")
    fb_user = Column(String(120), default="")
    fb_pass = Column(Text, default="")
    other_label = Column(String(80), default="")
    other_user = Column(String(120), default="")
    other_pass = Column(Text, default="")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "business": self.business or "",
            "website": self.website or "",
            "websitePass": self.website_pass or "",
            "instaUser": self.insta_user or "",
            "instaPass": self.insta_pass or "",
            "fbUser": self.fb_user or "",
            "fbPass": self.fb_pass or "",
            "otherLabel": self.other_label or "",
            "otherUser": self.other_user or "",
            "otherPass": self.other_pass or "",
        }


class FreelanceJob(Base):
    __tablename__ = "freelance_jobs"
    id = Column(String(16), primary_key=True, default=new_id)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    deadline = Column(Date, nullable=False)
    posted_by = Column(String(120))
    posted_by_role = Column(String(40))
    status = Column(String(40), default="Open")
    assigned_freelancer_id = Column(String(16))
    assigned_freelancer_name = Column(String(120))
    submission_note = Column(Text)
    submission_image = Column(Text)
    submission_date = Column(Date)
    submission_by = Column(String(120))
    requests = relationship("FreelanceRequest", cascade="all, delete-orphan")

    def to_dict(self):
        sub = None
        if self.submission_by or self.submission_note or self.submission_image:
            sub = {
                "note": self.submission_note or "",
                "image": self.submission_image,
                "date": self.submission_date.isoformat() if self.submission_date else None,
                "by": self.submission_by,
            }
        return {
            "id": self.id,
            "title": self.title,
            "desc": self.description or "",
            "deadline": self.deadline.isoformat(),
            "postedBy": self.posted_by,
            "postedByRole": self.posted_by_role,
            "status": self.status,
            "assignedFreelancerId": self.assigned_freelancer_id,
            "assignedFreelancerName": self.assigned_freelancer_name,
            "requests": [r.to_dict() for r in self.requests],
            "submission": sub,
        }


class FreelanceRequest(Base):
    __tablename__ = "freelance_requests"
    id = Column(String(16), primary_key=True, default=new_id)
    job_id = Column(String(16), ForeignKey("freelance_jobs.id", ondelete="CASCADE"), nullable=False)
    freelancer_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    freelancer_name = Column(String(120))
    date = Column(Date, nullable=False)
    status = Column(String(40), default="Pending")

    def to_dict(self):
        return {
            "id": self.id,
            "freelancerId": self.freelancer_id,
            "freelancerName": self.freelancer_name,
            "date": self.date.isoformat(),
            "status": self.status,
        }


class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(String(16), primary_key=True, default=new_id)
    freelancer_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    image = Column(Text)
    date = Column(Date, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "freelancerId": self.freelancer_id,
            "title": self.title,
            "desc": self.description or "",
            "image": self.image,
            "date": self.date.isoformat(),
        }


class CompanyHoliday(Base):
    __tablename__ = "company_holidays"
    id = Column(String(16), primary_key=True, default=new_id)
    date = Column(Date, nullable=False, unique=True)
    name = Column(String(200), default="")

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "name": self.name or "",
        }


class HrSetting(Base):
    __tablename__ = "hr_settings"
    key = Column(String(64), primary_key=True)
    value = Column(JSONB, nullable=False)


class Session(Base):
    __tablename__ = "sessions"
    token = Column(String(64), primary_key=True)
    emp_id = Column(String(16), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
