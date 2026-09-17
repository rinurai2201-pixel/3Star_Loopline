from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import get_settings

settings = get_settings()

# Sync SQLAlchemy needs psycopg2 — rewrite asyncpg URLs if present
_db_url = settings.database_url.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
).replace("postgres+asyncpg://", "postgresql+psycopg2://")
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = create_engine(_db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables if schema.sql not applied yet (SQLAlchemy models)."""
    from . import models  # noqa: F401
    from .seed import migrate_employee_columns, seed_default_users, seed_default_holidays

    Base.metadata.create_all(bind=engine)
    migrate_employee_columns(engine)
    db = SessionLocal()
    try:
        seed_default_users(db)
        seed_default_holidays(db)
    finally:
        db.close()
