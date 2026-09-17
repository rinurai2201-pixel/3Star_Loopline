"""End-to-end API flow test for all roles."""
import requests

BASE = "http://127.0.0.1:8000"

ACCOUNTS = [
    ("CEO", "ceo@loopline.com", "LooplineCEO2026!"),
    ("HR", "hr@loopline.com", "LooplineHR2026!"),
    ("Manager", "manager@loopline.com", "Demo2026!"),
    ("TL", "tl@loopline.com", "Demo2026!"),
    ("Employee", "employee@loopline.com", "Demo2026!"),
    ("Sales", "sales@loopline.com", "Demo2026!"),
    ("Freelancer", "freelancer@loopline.com", "Demo2026!"),
]

ROLE_ENDPOINTS = {
    "CEO": [("GET", "/api/revenue/summary"), ("GET", "/api/vision")],
    "HR": [("GET", "/api/revenue/summary"), ("GET", "/api/attendance/status-board")],
    "Manager": [("GET", "/api/attendance/status-board")],
    "TL": [("GET", "/api/client-accounts"), ("GET", "/api/attendance/status-board")],
    "Employee": [("GET", "/api/attendance"), ("GET", "/api/leaves/balance")],
    "Sales": [("GET", "/api/attendance"), ("GET", "/api/leaves/balance")],
    "Freelancer": [("GET", "/api/portfolio")],
}

COMMON = [
    ("GET", "/api/auth/me"),
    ("GET", "/api/employees"),
    ("GET", "/api/tasks"),
    ("GET", "/api/leaves"),
    ("GET", "/api/messages/contacts"),
    ("GET", "/api/freelance/jobs"),
]

failures = 0
for name, email, pwd in ACCOUNTS:
    r = requests.post(BASE + "/api/auth/login", json={"email": email, "password": pwd}, timeout=10)
    if r.status_code != 200:
        print(f"[{name}] LOGIN FAIL {r.status_code}")
        failures += 1
        continue
    data = r.json()
    h = {"Authorization": "Bearer " + data["token"]}
    print(f"[{name}] landing={data.get('landingPage')}")
    for method, path in COMMON + ROLE_ENDPOINTS.get(name, []):
        resp = requests.request(method, BASE + path, headers=h, timeout=10)
        if resp.status_code >= 400:
            print(f"  FAIL {method} {path} -> {resp.status_code}")
            failures += 1

print(f"\n{'All roles passed' if failures == 0 else f'{failures} failure(s)'}")
raise SystemExit(1 if failures else 0)
