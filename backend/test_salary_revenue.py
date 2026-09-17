"""Test salary and revenue flows."""
import requests

BASE = "http://127.0.0.1:8000"


def login(email, pwd):
    r = requests.post(BASE + "/api/auth/login", json={"email": email, "password": pwd}, timeout=10)
    r.raise_for_status()
    d = r.json()
    return d["token"], d["user"]


def main():
    hr_t, _ = login("hr@loopline.com", "LooplineHR2026!")
    h = {"Authorization": "Bearer " + hr_t}
    emps = requests.get(BASE + "/api/employees", headers=h, timeout=10).json()["employees"]
    emp = next(e for e in emps if e["role"] == "Employee" and e["email"] == "employee@loopline.com")
    print("Before salary:", emp["baseSalary"], emp["incentive"])

    eid = emp["id"]
    r = requests.patch(BASE + f"/api/employees/{eid}/salary", headers=h, json={"baseSalary": 40000}, timeout=10)
    print("Set salary:", r.status_code, r.json().get("baseSalary"))
    r = requests.post(BASE + f"/api/employees/{eid}/incentive", headers=h, json={"amount": 5000}, timeout=10)
    print("Give incentive:", r.status_code, r.json().get("incentive"))

    et, eu = login("employee@loopline.com", "Demo2026!")
    eu2 = next(
        e for e in requests.get(BASE + "/api/employees", headers={"Authorization": "Bearer " + et}, timeout=10).json()["employees"]
        if e["id"] == eu["id"]
    )
    print("Employee sees salary:", eu2["baseSalary"], eu2["incentive"])
    inc = requests.get(BASE + "/api/employees/incentives/mine", headers={"Authorization": "Bearer " + et}, timeout=10).json()
    print("Employee incentive logs:", len(inc.get("logs", [])))

    month = "2026-08"
    r = requests.post(
        BASE + "/api/revenue/clients",
        headers=h,
        json={
            "name": "Test Client",
            "businessName": "Test Co",
            "services": ["SEO"],
            "amount": 100000,
            "paid": 80000,
            "pending": 20000,
            "holding": 0,
            "gst": 5000,
            "tax": 3000,
            "payStatus": "Pending",
            "month": month,
        },
        timeout=10,
    )
    print("Add client:", r.status_code)
    cid = r.json().get("id") if r.status_code == 200 else None
    r = requests.post(BASE + "/api/revenue/expenses", headers=h, json={"label": "Office rent", "amount": 15000, "month": month}, timeout=10)
    print("Add expense:", r.status_code)
    summary = requests.get(BASE + f"/api/revenue/summary?month={month}", headers=h, timeout=10).json()
    print("Profit:", summary["profit"], "(expected 57000)")
    reports = requests.get(BASE + "/api/revenue/reports", headers=h, timeout=10).json()
    print("Reports months:", len(reports.get("byMonth", [])), "clients:", len(reports.get("clients", [])))

    unlock = requests.post(BASE + "/api/auth/unlock", headers=h, json={"section": "revenue", "password": "hr20193091201210"}, timeout=10)
    print("Unlock revenue:", unlock.status_code)

    if cid:
        requests.delete(BASE + f"/api/revenue/clients/{cid}", headers=h, timeout=10)
        print("Cleaned up test client")


if __name__ == "__main__":
    main()
