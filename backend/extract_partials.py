"""Extract <main> inner HTML into partials for the app shell."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
pages = root / "frontend" / "pages"
partials = pages / "partials"
partials.mkdir(exist_ok=True)

MAP = {
    "dashboard.html": pages / "employee" / "dashboard.html",
    "my-attendance.html": pages / "employee" / "attendance.html",
    "my-leaves.html": pages / "employee" / "leaves.html",
    "my-salary.html": pages / "employee" / "salary.html",
    "hr-overview.html": pages / "hr" / "overview.html",
    "hr-employees.html": pages / "hr" / "employees.html",
    "hr-attendance.html": pages / "hr" / "attendance.html",
    "hr-leaves.html": pages / "hr" / "leaves.html",
    "hr-payroll.html": pages / "hr" / "payroll.html",
    "messages.html": pages / "messages.html",
    "freelance.html": pages / "freelance_hub.html",
    "revenue.html": pages / "hr_revenue.html",
    "reports.html": pages / "hr_reports.html",
    "tl.html": pages / "tl_task_management.html",
    "teams.html": pages / "manager" / "teams.html",
}

for out_name, src in MAP.items():
    if not src.exists():
        print("skip", src)
        continue
    text = src.read_text(encoding="utf-8")
    m = re.search(r"<main[^>]*>(.*)</main>", text, re.S)
    if not m:
        print("no main", src)
        continue
    (partials / out_name).write_text(m.group(1).strip() + "\n", encoding="utf-8")
    print("ok", out_name)
