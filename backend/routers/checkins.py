"""
Checkins router — Manager-only check-in comments on achievements.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import User, Checkin, Achievement, Goal, UserRole
from schemas import CheckinCreate, CheckinOut
from auth import get_current_user, require_role

router = APIRouter(prefix="/checkins", tags=["Checkins"])


@router.get("/team", response_model=List[CheckinOut])
def list_team_checkins(quarter: Optional[str] = None, employee_id: Optional[int] = None,
                       db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    query = db.query(Checkin).options(joinedload(Checkin.manager), joinedload(Checkin.achievement).joinedload(Achievement.goal))
    query = query.filter(Checkin.manager_id == current_user.id)
    if quarter:
        query = query.join(Achievement).filter(Achievement.quarter == quarter)
    if employee_id:
        query = query.join(Achievement).join(Goal).filter(Goal.employee_id == employee_id)
    return [CheckinOut.model_validate(c) for c in query.order_by(Checkin.created_at.desc()).all()]


@router.post("/", response_model=CheckinOut, status_code=201)
def create_checkin(data: CheckinCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    achievement = db.query(Achievement).options(joinedload(Achievement.goal)).filter(Achievement.id == data.achievement_id).first()
    if not achievement:
        raise HTTPException(404, "Achievement not found")

    goal = achievement.goal
    employee = db.query(User).filter(User.id == goal.employee_id).first()
    if current_user.role == UserRole.manager and employee and employee.manager_id != current_user.id:
        raise HTTPException(403, "Not your direct report")

    checkin = Checkin(achievement_id=data.achievement_id, manager_id=current_user.id, comment=data.comment)
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return CheckinOut.model_validate(checkin)
