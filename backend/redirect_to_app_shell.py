"""Replace legacy multi-page HTML with redirects to the app shell."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend" / "pages"

REDIRECTS = {
    "freelance_hub.html": "freelance",
    "messages.html": "chat",
    "hr_revenue.html": "revenue",
    "ceo_revenue.html": "revenue",
    "hr_reports.html": "reports",
    "ceo_reports.html": "reports",
    "tl_task_management.html": "tl",
    "employee/dashboard.html": "dashboard",
    "employee/attendance.html": "my_attendance",
    "employee/leaves.html": "my_leaves",
    "employee/salary.html": "my_salary",
    "hr/overview.html": "hr_overview",
    "hr/employees.html": "hr_employees",
    "hr/attendance.html": "hr_attendance",
    "hr/leaves.html": "hr_leaves",
    "hr/payroll.html": "hr_payroll",
    "manager/teams.html": "teams",
}

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="refresh" content="0;url=/pages/app.html#{hash}">
<title>Redirecting…</title>
<script>location.replace('/pages/app.html#{hash}');</script>
</head>
<body></body>
</html>
"""

for rel, page_hash in REDIRECTS.items():
    path = root / rel
    if not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(TEMPLATE.format(hash=page_hash), encoding="utf-8")
    print("redirect", rel, "->", page_hash)

print("done")
