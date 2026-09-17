from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from .database import init_db
from .config import get_settings
from .routers import auth, employees, attendance, tasks_leaves, messages, revenue, misc, payslips, holidays

settings = get_settings()

app = FastAPI(title="Loopline Agency Ops API", version="1.0.0")


class NoCacheHtmlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path.lower()
        if path.endswith(".html") or path.endswith("/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response


origins = (
    [o.strip() for o in settings.cors_origins.split(",")]
    if settings.cors_origins != "*"
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(NoCacheHtmlMiddleware)

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(tasks_leaves.router)
app.include_router(messages.router)
app.include_router(revenue.router)
app.include_router(misc.router)
app.include_router(payslips.router)
app.include_router(holidays.router)

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Loopline"}


if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
