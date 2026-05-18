"""
Admin router — Cycle management, unlock goals, audit logs, completion dashboard.
"""

from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import User, Goal, Cycle, AuditLog, Achievement, Notification, GoalStatus, UserRole
from schemas import CycleCreate, CycleUpdate, CycleOut, AuditLogOut, GoalOut, CompletionDashboardRow
from auth import get_current_user, require_role
from routers.goals import log_audit, create_notification, get_active_quarter

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─── Cycles (under /admin but also aliased to /cycles) ───────

@router.get("/cycles", response_model=List[CycleOut])
def list_cycles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [CycleOut.model_validate(c) for c in db.query(Cycle).order_by(Cycle.id.desc()).all()]


@router.post("/cycles", response_model=CycleOut, status_code=201)
def create_cycle(data: CycleCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    if data.is_active:
        db.query(Cycle).filter(Cycle.is_active == True).update({"is_active": False})
    cycle = Cycle(name=data.name, goal_setting_start=data.goal_setting_start,
                  q1_start=data.q1_start, q2_start=data.q2_start,
                  q3_start=data.q3_start, q4_start=data.q4_start,
                  is_active=data.is_active, created_by=current_user.id)
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return CycleOut.model_validate(cycle)


@router.put("/cycles/{cycle_id}", response_model=CycleOut)
def update_cycle(cycle_id: int, data: CycleUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    cycle = db.query(Cycle).filter(Cycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(404, "Cycle not found")
    if data.is_active and data.is_active == True:
        db.query(Cycle).filter(Cycle.is_active == True, Cycle.id != cycle_id).update({"is_active": False})
    for field in ["name", "goal_setting_start", "q1_start", "q2_start", "q3_start", "q4_start", "is_active"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(cycle, field, val)
    db.commit()
    db.refresh(cycle)
    return CycleOut.model_validate(cycle)


@router.get("/cycles/active", response_model=CycleOut)
def get_active_cycle(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cycle = db.query(Cycle).filter(Cycle.is_active == True).first()
    if not cycle:
        raise HTTPException(404, "No active cycle")
    return CycleOut.model_validate(cycle)


# ─── Unlock Goal ──────────────────────────────────────────────

@router.post("/unlock-goal/{goal_id}", response_model=GoalOut)
def unlock_goal(goal_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    old_status = goal.status.value
    goal.status = GoalStatus.submitted
    goal.updated_at = datetime.utcnow()
    log_audit(db, "goals", goal.id, "unlocked", current_user.id,
              {"status": old_status}, {"status": "submitted"})
    create_notification(db, goal.employee_id, f"Your goal '{goal.title}' has been unlocked by admin")
    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


# ─── Audit Logs ───────────────────────────────────────────────

@router.get("/audit-logs", response_model=List[AuditLogOut])
def get_audit_logs(table: Optional[str] = None, user_id: Optional[int] = None,
                   from_date: Optional[str] = None, to_date: Optional[str] = None,
                   page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                   db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    query = db.query(AuditLog).options(joinedload(AuditLog.changed_by_user))
    if table:
        query = query.filter(AuditLog.table_name == table)
    if user_id:
        query = query.filter(AuditLog.changed_by == user_id)
    if from_date:
        query = query.filter(AuditLog.changed_at >= from_date)
    if to_date:
        query = query.filter(AuditLog.changed_at <= to_date)
    total = query.count()
    logs = query.order_by(AuditLog.changed_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return [AuditLogOut.model_validate(l) for l in logs]


# ─── Completion Dashboard ─────────────────────────────────────

@router.get("/completion-dashboard", response_model=List[CompletionDashboardRow])
def completion_dashboard(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    employees = db.query(User).filter(User.role == UserRole.employee, User.is_active == True).all()
    cycle = db.query(Cycle).filter(Cycle.is_active == True).first()
    active_q = get_active_quarter(cycle) if cycle else None

    result = []
    for emp in employees:
        manager = db.query(User).filter(User.id == emp.manager_id).first() if emp.manager_id else None
        goals = db.query(Goal).filter(Goal.employee_id == emp.id, Goal.cycle_id == cycle.id).all() if cycle else []
        submitted = sum(1 for g in goals if g.status.value in ["submitted", "approved", "locked"])
        approved = sum(1 for g in goals if g.status.value in ["approved", "locked"])

        def checkin_status(quarter: str) -> str:
            quarters_order = ["Q1", "Q2", "Q3", "Q4"]
            if active_q in quarters_order:
                active_idx = quarters_order.index(active_q)
                q_idx = quarters_order.index(quarter)
                if q_idx > active_idx:
                    return "not_open"
            elif active_q == "goal_setting":
                return "not_open"

            goal_ids = [g.id for g in goals]
            if not goal_ids:
                return "not_done"
            achs = db.query(Achievement).filter(Achievement.goal_id.in_(goal_ids), Achievement.quarter == quarter).all()
            return "done" if len(achs) > 0 else "not_done"

        row = CompletionDashboardRow(
            employee_id=emp.id, employee_name=emp.name, department=emp.department,
            manager_name=manager.name if manager else None,
            goals_submitted=submitted, goals_approved=approved,
            q1_checkin=checkin_status("Q1"), q2_checkin=checkin_status("Q2"),
            q3_checkin=checkin_status("Q3"), q4_checkin=checkin_status("Q4"),
        )
        result.append(row)
    return result
