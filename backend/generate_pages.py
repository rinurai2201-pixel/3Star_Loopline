"""Generate modular frontend HTML pages."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pages_dir = root / "frontend" / "pages"

head_tpl = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Loopline</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
{extra_head}
<link rel="stylesheet" href="{css}">
</head>
<body>
"""

scripts_tpl = """
<script src="{js}config.js"></script>
<script src="{js}api.js"></script>
<script src="{js}utils.js"></script>
<script src="{js}layout.js"></script>
<script src="{js}app.js"></script>
</body>
</html>
"""

# Redirect stubs for legacy URLs
redirects = {
    "employee_dashboard.html": "employee/dashboard.html",
    "manager_dashboard.html": "employee/dashboard.html",
    "sales_dashboard.html": "employee/dashboard.html",
    "hr_management.html": "hr/overview.html",
}

for fname, target in redirects.items():
    (pages_dir / fname).write_text(
        f'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Redirect</title>'
        f'<script>location.replace("{target}");</script></head><body></body></html>',
        encoding="utf-8",
    )

print("Modular HRMS pages live under frontend/pages/hr/ and frontend/pages/employee/")
print("Run the app: cd backend && python -m uvicorn app.main:app --reload --port 8000")
