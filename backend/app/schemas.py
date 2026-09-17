from datetime import date
from typing import Optional, List, Any
from pydantic import BaseModel


class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    currentPassword: str
    newPassword: str


class CreateEmployeeIn(BaseModel):
    name: str
    email: str
    password: str
    role: str
    department: str = ""
    birthday: Optional[str] = None


class CreatePartnerIn(BaseModel):
    name: str
    email: str
    password: str
    department: str = ""


class PartnerPasswordIn(BaseModel):
    password: str


class AssignTeamIn(BaseModel):
    tlId: Optional[str] = None


class UnlockIn(BaseModel):
    section: str
    password: str


class LeaveIn(BaseModel):
    fromDate: str
    toDate: str
    reason: str = ""


class LeaveStatusIn(BaseModel):
    status: str


class TaskIn(BaseModel):
    title: str
    assignedTo: str
    startDate: Optional[str] = None
    startTime: Optional[str] = None
    endDate: str
    endTime: Optional[str] = None
    desc: str = ""


class TaskStatusIn(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None


class MessageIn(BaseModel):
    toId: str
    text: str = ""
    image: Optional[str] = None


class SalaryIn(BaseModel):
    baseSalary: float


class IncentiveIn(BaseModel):
    amount: float


class ScoreIn(BaseModel):
    score: int


class BirthdayIn(BaseModel):
    birthday: Optional[str] = None


class EmployeeActiveIn(BaseModel):
    active: bool


class ClientBillingIn(BaseModel):
    name: str
    businessName: str = ""
    services: List[str] = []
    amount: float = 0
    paid: float = 0
    pending: float = 0
    holding: float = 0
    gst: float = 0
    tax: float = 0
    payStatus: str = "Pending"
    joiningDate: Optional[str] = None
    month: str
    meetingDate: Optional[str] = None


class ExpenseIn(BaseModel):
    label: str
    amount: float = 0
    month: str


class ComplaintIn(BaseModel):
    text: str


class VisionIn(BaseModel):
    text: str


class ClientAccountIn(BaseModel):
    name: str
    business: str = ""
    website: str = ""
    websitePass: str = ""
    instaUser: str = ""
    instaPass: str = ""
    fbUser: str = ""
    fbPass: str = ""
    otherLabel: str = ""
    otherUser: str = ""
    otherPass: str = ""


class BreakIn(BaseModel):
    type: str  # Tea | Food


class ManualAttendanceIn(BaseModel):
    empId: str
    action: str  # clockin | clockout | breakin | breakout
    breakType: Optional[str] = None


class FreelanceJobIn(BaseModel):
    title: str
    deadline: str
    desc: str = ""


class FreelanceSubmitIn(BaseModel):
    note: str = ""
    image: Optional[str] = None


class PortfolioIn(BaseModel):
    title: str
    desc: str = ""
    image: Optional[str] = None


class PayslipIn(BaseModel):
    empId: str
    month: str
    baseSalary: float = 0
    incentive: float = 0
    allowance: float = 0
    deduction: float = 0
    workingDays: Optional[int] = None
    paidDays: Optional[int] = None
    lopDays: int = 0
    performanceScore: Optional[int] = None
    notes: str = ""


class HolidayIn(BaseModel):
    date: str
    name: str = ""


class WeekendConfigIn(BaseModel):
    weekendDays: List[int]


class PayslipUpdateIn(BaseModel):
    baseSalary: Optional[float] = None
    incentive: Optional[float] = None
    allowance: Optional[float] = None
    deduction: Optional[float] = None
    workingDays: Optional[int] = None
    paidDays: Optional[int] = None
    lopDays: Optional[int] = None
    performanceScore: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None
