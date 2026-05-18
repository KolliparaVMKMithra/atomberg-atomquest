"""
Database configuration for AtomQuest Goal Tracking Portal.
Supports Azure SQL (production) and SQLite (local development).
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Detect placeholder/template values that shouldn't be used
_is_real_mssql = (
    DATABASE_URL
    and DATABASE_URL.startswith("mssql")
    and "username:password@" not in DATABASE_URL
    and "<user>" not in DATABASE_URL
)

_use_mssql = False
if _is_real_mssql:
    try:
        import pyodbc  # noqa: F401
        _use_mssql = True
    except ImportError:
        print("⚠️  DATABASE_URL is set to mssql but pyodbc is not installed. Falling back to SQLite.")

if _use_mssql:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
else:
    # Fallback to SQLite for local development
    SQLITE_URL = "sqlite:///./atomquest.db"
    engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)
