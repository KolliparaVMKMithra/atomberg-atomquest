"""
Achievements router — Log and update achievement actuals with progress score computation.
Includes shared goal sync logic and quarterly window enforcement.
"""

from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import User, Goal, Achievement, Cycle, AuditLog, Notification, GoalStatus, UoMType, UserRole
from schemas import AchievementCreate, AchievementUpdate, AchievementOut
from auth import get_current_user, require_role
from routers.goals import compute_progress_score, get_active_quarter, log_audit, create_notification

router = APIRouter(prefix="/achievements", tags=["Achievements"])


def get_active_cycle(db: Session) -> Cycle:
    cycle = db.query(Cycle).filter(Cycle.is_active == True).first()
    if not cycle:
        raise HTTPException(400, "No active cycle found")
    return cycle


@router.get("/", response_model=List[AchievementOut])
def list_achievements(goal_id: Optional[int] = None, quarter: Optional[str] = None,
                      db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Achievement).options(joinedload(Achievement.goal).joinedload(Goal.employee), joinedload(Achievement.checkins))

    if current_user.role == UserRole.employee:
        query = query.join(Goal).filter(Goal.employee_id == current_user.id)
    elif current_user.role == UserRole.manager:
        team_ids = [u.id for u in db.query(User).filter(User.manager_id == current_user.id).all()]
        team_ids.append(current_user.id)
        query = query.join(Goal).filter(Goal.employee_id.in_(team_ids))

    if goal_id:
        query = query.filter(Achievement.goal_id == goal_id)
    if quarter:
        query = query.filter(Achievement.quarter == quarter)

    return [AchievementOut.model_validate(a) for a in query.all()]


@router.post("/", response_model=AchievementOut, status_code=201)
def create_achievement(data: AchievementCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["employee"]))):
    goal = db.query(Goal).filter(Goal.id == data.goal_id, Goal.employee_id == current_user.id).first()
    if not goal:
        raise HTTPException(404, "Goal not found or not yours")
    if goal.status not in [GoalStatus.approved, GoalStatus.locked]:
        raise HTTPException(400, "Can only log achievements for approved/locked goals")

    cycle = db.query(Cycle).filter(Cycle.id == goal.cycle_id).first()
    if cycle:
        active_q = get_active_quarter(cycle)
        if active_q != data.quarter and active_q != "goal_setting":
            next_dates = {"Q1": cycle.q1_start, "Q2": cycle.q2_start, "Q3": cycle.q3_start, "Q4": cycle.q4_start}
            msg = f"Cannot submit for {data.quarter}. Active quarter is {active_q}."
            if data.quarter in next_dates:
                msg += f" {data.quarter} window opens on {next_dates[data.quarter]}."
            raise HTTPException(400, msg)

    existing = db.query(Achievement).filter(Achievement.goal_id == data.goal_id, Achievement.quarter == data.quarter).first()
    if existing:
        raise HTTPException(400, f"Achievement for {data.quarter} already exists. Use PUT to update.")

    achievement = Achievement(goal_id=data.goal_id, quarter=data.quarter,
                              actual_value=data.actual_value, actual_date=data.actual_date,
                              status=data.status)
    achievement.progress_score = compute_progress_score(goal, achievement)
    db.add(achievement)

    # Shared goal sync
    if goal.is_shared and goal.parent_goal_id is None:
        siblings = db.query(Goal).filter(Goal.parent_goal_id == goal.id).all()
        for sibling in siblings:
            sib_ach = db.query(Achievement).filter(Achievement.goal_id == sibling.id, Achievement.quarter == data.quarter).first()
            if sib_ach:
                sib_ach.actual_value = data.actual_value
                sib_ach.actual_date = data.actual_date
                sib_ach.status = data.status
                sib_ach.progress_score = compute_progress_score(sibling, sib_ach)
            else:
                sib_ach = Achievement(goal_id=sibling.id, quarter=data.quarter,
                                     actual_value=data.actual_value, actual_date=data.actual_date,
                                     status=data.status)
                sib_ach.progress_score = compute_progress_score(sibling, sib_ach)
                db.add(sib_ach)
            log_audit(db, "achievements", sibling.id, "shared_goal_sync", current_user.id,
                      None, {"actual_value": data.actual_value, "quarter": data.quarter})

    db.commit()
    db.refresh(achievement)
    return AchievementOut.model_validate(achievement)


@router.put("/{achievement_id}", response_model=AchievementOut)
def update_achievement(achievement_id: int, data: AchievementUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["employee"]))):
    achievement = db.query(Achievement).options(joinedload(Achievement.goal)).filter(Achievement.id == achievement_id).first()
    if not achievement:
        raise HTTPException(404, "Achievement not found")
    goal = achievement.goal
    if goal.employee_id != current_user.id:
        raise HTTPException(403, "Not your achievement")

    cycle = db.query(Cycle).filter(Cycle.id == goal.cycle_id).first()
    if cycle:
        active_q = get_active_quarter(cycle)
        if active_q != achievement.quarter and active_q != "goal_setting":
            raise HTTPException(400, f"Cannot update {achievement.quarter} outside its window. Active: {active_q}")

    old_values = {"actual_value": achievement.actual_value, "status": achievement.status}
    if data.actual_value is not None: achievement.actual_value = data.actual_value
    if data.actual_date is not None: achievement.actual_date = data.actual_date
    if data.status is not None: achievement.status = data.status
    achievement.progress_score = compute_progress_score(goal, achievement)
    achievement.updated_at = datetime.utcnow()

    # Shared goal sync
    if goal.is_shared and goal.parent_goal_id is None:
        siblings = db.query(Goal).filter(Goal.parent_goal_id == goal.id).all()
        for sibling in siblings:
            sib_ach = db.query(Achievement).filter(Achievement.goal_id == sibling.id, Achievement.quarter == achievement.quarter).first()
            if sib_ach:
                if data.actual_value is not None: sib_ach.actual_value = data.actual_value
                if data.actual_date is not None: sib_ach.actual_date = data.actual_date
                if data.status is not None: sib_ach.status = data.status
                sib_ach.progress_score = compute_progress_score(sibling, sib_ach)
            log_audit(db, "achievements", sibling.id, "shared_goal_sync", current_user.id)

    db.commit()
    db.refresh(achievement)
    return AchievementOut.model_validate(achievement)
