from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

_ENV = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/loopline"
    secret_key: str = "loopline-dev-secret-change-me"
    cors_origins: str = "*"
    cors_origin_regex: str = r"https://[a-zA-Z0-9-]+\.ngrok(?:-free)?\.(?:app|io|dev)$"
    seed_ceo_email: str = "ceo@loopline.com"
    seed_ceo_password: str = "LooplineCEO2026!"
    seed_hr_email: str = "hr@loopline.com"
    seed_hr_password: str = "LooplineHR2026!"
    # Section unlock codes (TL vault, revenue screens)
    role_passwords: dict = {
        "HR": "hr20193091201210",
        "CEO": "ceo20193091201210",
        "Partner": "partner20193091201210",
        "TL": "tl20193091201210",
        "Employee": "3-star20193091201210",
        "Manager": "mgr20193091201210",
        "Sales": "sales20193091201210",
        "Freelancer": "free20193091201210",
    }
    annual_leave_quota: int = 12

    class Config:
        env_file = str(_ENV) if _ENV.exists() else ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
