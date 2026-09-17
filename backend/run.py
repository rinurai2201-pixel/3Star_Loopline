"""
Run with: uvicorn app.main:app --reload --app-dir backend --port 8000
Or from backend/:  uvicorn app.main:app --reload --port 8000
"""
from app.main import app

__all__ = ["app"]
