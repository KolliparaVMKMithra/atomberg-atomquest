"""
FastAPI main application for AtomQuest Goal Tracking Portal.
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import create_tables, get_db
from models import Notification, User
from schemas import NotificationOut
from auth import router as auth_router, get_current_user
from routers.users import router as users_router
from routers.goals import router as goals_router
from routers.achievements import router as achievements_router
from routers.checkins import router as checkins_router
from routers.admin import router as admin_router
from routers.reports import router as reports_router

load_dotenv()

app = FastAPI(
    title="AtomQuest Goal Tracking Portal",
    description="Goal Setting & Tracking Portal for organizational performance management",
    version="1.0.0",
)

# ─── CORS ─────────────────────────────────────────────────────

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ─── Include Routers ──────────────────────────────────────────

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(goals_router)
app.include_router(achievements_router)
app.include_router(checkins_router)
app.include_router(admin_router)
app.include_router(reports_router)

# ─── Alias routes for cycles at top level ─────────────────────

from routers.admin import list_cycles, get_active_cycle, create_cycle, update_cycle
app.get("/cycles/", tags=["Cycles"])(list_cycles)
app.get("/cycles/active", tags=["Cycles"])(get_active_cycle)
app.post("/cycles/", tags=["Cycles"])(create_cycle)
app.put("/cycles/{cycle_id}", tags=["Cycles"])(update_cycle)


# ─── Notification Routes ──────────────────────────────────────

@app.get("/notifications/", response_model=list[NotificationOut], tags=["Notifications"])
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notifs = (db.query(Notification)
              .filter(Notification.user_id == current_user.id, Notification.is_read == False)
              .order_by(Notification.created_at.desc())
              .limit(10)
              .all())
    return [NotificationOut.model_validate(n) for n in notifs]


@app.put("/notifications/{notification_id}/read", tags=["Notifications"])
def mark_notification_read(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(404, "Notification not found")
    notif.is_read = True
    db.commit()
    return {"detail": "Marked as read"}


# ─── Startup ──────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    create_tables()


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "AtomQuest Goal Tracking Portal", "version": "1.0.0"}
