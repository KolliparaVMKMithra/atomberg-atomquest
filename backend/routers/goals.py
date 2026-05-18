"""
Goals router — Full goal lifecycle: CRUD, submit, approve, reject, return, inline-edit, shared goals.
Includes progress score computation and quarterly window enforcement.
"""

from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import User, Goal, GoalApproval, Cycle, Achievement, AuditLog, Notification, GoalStatus, UoMType, ApprovalAction, UserRole
from schemas import GoalCreate, GoalUpdate, GoalOut, GoalInlineEdit, GoalApprovalComment, SharedGoalCreate, UserOut
from auth import get_current_user, require_role
from notifications import notify_goal_submitted, notify_goals_approved, notify_goals_returned

router = APIRouter(prefix="/goals", tags=["Goals"])


# ─── Helper Functions ────────────────────────────────────────

def compute_progress_score(goal: Goal, achievement) -> float:
    if goal.uom_type == UoMType.numeric_min:
        if not goal.target_value or goal.target_value == 0:
            return 0.0
        if achievement.actual_value is None:
            return 0.0
        score = (achievement.actual_value / goal.target_value) * 100
        return min(score, 150.0)

    if goal.uom_type == UoMType.numeric_max:
        if achievement.actual_value is None or achievement.actual_value == 0:
            return 0.0
        if not goal.target_value:
            return 0.0
        score = (goal.target_value / achievement.actual_value) * 100
        return min(score, 150.0)

    if goal.uom_type == UoMType.timeline:
        if achievement.actual_date is None:
            return 0.0
        if not goal.target_date:
            return 0.0
        actual = achievement.actual_date if isinstance(achievement.actual_date, date) else achievement.actual_date
        target = goal.target_date if isinstance(goal.target_date, date) else goal.target_date
        if actual <= target:
            return 100.0
        days_late = (actual - target).days
        return max(0.0, 100.0 - (days_late * 2))

    if goal.uom_type == UoMType.zero:
        if achievement.actual_value is None:
            return 0.0
        return 100.0 if achievement.actual_value == 0 else 0.0

    return 0.0


def get_active_quarter(cycle: Cycle) -> Optional[str]:
    today = date.today()
    if cycle.goal_setting_start <= today < cycle.q1_start:
        return "goal_setting"
    if cycle.q1_start <= today < cycle.q2_start:
        return "Q1"
    if cycle.q2_start <= today < cycle.q3_start:
        return "Q2"
    if cycle.q3_start <= today < cycle.q4_start:
        return "Q3"
    if today >= cycle.q4_start:
        return "Q4"
    return None


def log_audit(db: Session, table_name: str, record_id: int, action: str, changed_by: int, old_values: dict = None, new_values: dict = None):
    entry = AuditLog(table_name=table_name, record_id=record_id, action=action,
                     changed_by=changed_by, old_values=old_values, new_values=new_values)
    db.add(entry)


def create_notification(db: Session, user_id: int, message: str):
    notif = Notification(user_id=user_id, message=message)
    db.add(notif)


def validate_weightage(db: Session, employee_id: int, cycle_id: int, exclude_goal_id: int = None, new_weightage: float = 0) -> tuple:
    query = db.query(Goal).filter(Goal.employee_id == employee_id, Goal.cycle_id == cycle_id)
    if exclude_goal_id:
        query = query.filter(Goal.id != exclude_goal_id)
    goals = query.all()
    current_sum = sum(g.weightage for g in goals)
    total = current_sum + new_weightage
    count = len(goals) + (1 if new_weightage > 0 else 0)
    return current_sum, total, count


# ─── Routes ──────────────────────────────────────────────────

@router.get("/", response_model=List[GoalOut])
def list_goals(cycle_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Goal).options(joinedload(Goal.employee), joinedload(Goal.approvals), joinedload(Goal.achievements))
    if current_user.role == UserRole.employee:
        query = query.filter(Goal.employee_id == current_user.id)
    elif current_user.role == UserRole.manager:
        team_ids = [u.id for u in db.query(User).filter(User.manager_id == current_user.id).all()]
        team_ids.append(current_user.id)
        query = query.filter(Goal.employee_id.in_(team_ids))
    if cycle_id:
        query = query.filter(Goal.cycle_id == cycle_id)
    goals = query.order_by(Goal.created_at.desc()).all()
    return [GoalOut.model_validate(g) for g in goals]


@router.get("/team", response_model=List[GoalOut])
def list_team_goals(cycle_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    query = db.query(Goal).options(joinedload(Goal.employee), joinedload(Goal.approvals), joinedload(Goal.achievements))
    if current_user.role == UserRole.manager:
        team_ids = [u.id for u in db.query(User).filter(User.manager_id == current_user.id).all()]
        query = query.filter(Goal.employee_id.in_(team_ids))
    if cycle_id:
        query = query.filter(Goal.cycle_id == cycle_id)
    return [GoalOut.model_validate(g) for g in query.order_by(Goal.created_at.desc()).all()]


@router.post("/", response_model=GoalOut, status_code=201)
def create_goal(data: GoalCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["employee"]))):
    cycle = db.query(Cycle).filter(Cycle.id == data.cycle_id).first()
    if not cycle:
        raise HTTPException(404, "Cycle not found")

    current_sum, total, count = validate_weightage(db, current_user.id, data.cycle_id, new_weightage=data.weightage)
    if count > 8:
        raise HTTPException(400, "Maximum 8 goals allowed per cycle")
    if total > 100.01:
        raise HTTPException(400, f"Total weightage would be {total}%. Cannot exceed 100%")

    goal = Goal(employee_id=current_user.id, cycle_id=data.cycle_id, thrust_area=data.thrust_area,
                title=data.title, description=data.description, uom_type=UoMType(data.uom_type),
                target_value=data.target_value, target_date=data.target_date, weightage=data.weightage,
                status=GoalStatus.draft)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


@router.put("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, data: GoalUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["employee"]))):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.employee_id == current_user.id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if goal.status not in [GoalStatus.draft, GoalStatus.rejected]:
        raise HTTPException(400, f"Cannot edit goal with status '{goal.status.value}'")
    if goal.is_shared and goal.parent_goal_id:
        if data.title or data.uom_type or data.target_value or data.target_date or data.thrust_area:
            raise HTTPException(400, "Shared goal: only weightage can be edited")

    new_w = data.weightage if data.weightage else goal.weightage
    if data.weightage and data.weightage != goal.weightage:
        current_sum, total, _ = validate_weightage(db, current_user.id, goal.cycle_id, exclude_goal_id=goal_id, new_weightage=new_w)
        if total > 100.01:
            raise HTTPException(400, f"Total weightage would be {total}%")

    if data.thrust_area is not None: goal.thrust_area = data.thrust_area
    if data.title is not None: goal.title = data.title
    if data.description is not None: goal.description = data.description
    if data.uom_type is not None: goal.uom_type = UoMType(data.uom_type)
    if data.target_value is not None: goal.target_value = data.target_value
    if data.target_date is not None: goal.target_date = data.target_date
    if data.weightage is not None: goal.weightage = data.weightage
    goal.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["employee"]))):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.employee_id == current_user.id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if goal.status != GoalStatus.draft:
        raise HTTPException(400, "Only draft goals can be deleted")
    db.delete(goal)
    db.commit()
    return {"detail": "Goal deleted"}


@router.post("/{goal_id}/submit", response_model=GoalOut)
def submit_goal(goal_id: int, bg: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(require_role(["employee"]))):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.employee_id == current_user.id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if goal.status not in [GoalStatus.draft, GoalStatus.rejected]:
        raise HTTPException(400, f"Cannot submit goal with status '{goal.status.value}'")

    all_goals = db.query(Goal).filter(Goal.employee_id == current_user.id, Goal.cycle_id == goal.cycle_id).all()
    total_w = sum(g.weightage for g in all_goals)
    if abs(total_w - 100) > 0.01:
        raise HTTPException(400, f"Total weightage is {total_w}%. Must equal 100% before submitting.")

    goal.status = GoalStatus.submitted
    goal.updated_at = datetime.utcnow()

    manager = db.query(User).filter(User.id == current_user.manager_id).first()
    if manager:
        create_notification(db, manager.id, f"{current_user.name} submitted goal: {goal.title}")
        submitted_count = sum(1 for g in all_goals if g.status in [GoalStatus.submitted] or g.id == goal_id)
        bg.add_task(notify_goal_submitted, current_user.name, manager.email, submitted_count)

    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


# ─── Manager Approval Routes ─────────────────────────────────

@router.put("/{goal_id}/approve", response_model=GoalOut)
def approve_goal(goal_id: int, bg: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    goal = db.query(Goal).options(joinedload(Goal.employee)).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if goal.status != GoalStatus.submitted:
        raise HTTPException(400, "Only submitted goals can be approved")

    all_goals = db.query(Goal).filter(Goal.employee_id == goal.employee_id, Goal.cycle_id == goal.cycle_id).all()
    total_w = sum(g.weightage for g in all_goals)
    if abs(total_w - 100) > 0.01:
        raise HTTPException(400, f"Employee's total weightage is {total_w}%. Must be 100%.")

    old_status = goal.status.value
    goal.status = GoalStatus.locked
    approval = GoalApproval(goal_id=goal.id, manager_id=current_user.id, action=ApprovalAction.approved)
    db.add(approval)

    log_audit(db, "goals", goal.id, "approved", current_user.id,
              {"status": old_status}, {"status": "locked"})
    create_notification(db, goal.employee_id, f"Your goal '{goal.title}' has been approved")

    emp = goal.employee
    if emp:
        bg.add_task(notify_goals_approved, emp.email, emp.name)

    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


@router.put("/{goal_id}/reject", response_model=GoalOut)
def reject_goal(goal_id: int, data: GoalApprovalComment, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    goal = db.query(Goal).options(joinedload(Goal.employee)).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if goal.status != GoalStatus.submitted:
        raise HTTPException(400, "Only submitted goals can be rejected")

    old_status = goal.status.value
    goal.status = GoalStatus.rejected
    approval = GoalApproval(goal_id=goal.id, manager_id=current_user.id, action=ApprovalAction.rejected, comment=data.comment)
    db.add(approval)
    log_audit(db, "goals", goal.id, "rejected", current_user.id, {"status": old_status}, {"status": "rejected", "comment": data.comment})
    create_notification(db, goal.employee_id, f"Your goal '{goal.title}' was rejected: {data.comment}")
    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


@router.put("/{goal_id}/return", response_model=GoalOut)
def return_goal(goal_id: int, data: GoalApprovalComment, bg: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    goal = db.query(Goal).options(joinedload(Goal.employee)).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if goal.status != GoalStatus.submitted:
        raise HTTPException(400, "Only submitted goals can be returned")

    old_status = goal.status.value
    goal.status = GoalStatus.rejected
    approval = GoalApproval(goal_id=goal.id, manager_id=current_user.id, action=ApprovalAction.returned, comment=data.comment)
    db.add(approval)
    log_audit(db, "goals", goal.id, "returned", current_user.id, {"status": old_status}, {"status": "rejected", "comment": data.comment})
    create_notification(db, goal.employee_id, f"Goal '{goal.title}' returned for rework: {data.comment}")

    emp = goal.employee
    if emp:
        bg.add_task(notify_goals_returned, emp.email, emp.name, data.comment)

    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


@router.put("/{goal_id}/inline-edit", response_model=GoalOut)
def inline_edit_goal(goal_id: int, data: GoalInlineEdit, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")

    old_values = {"target_value": goal.target_value, "weightage": goal.weightage}
    if data.target_value is not None: goal.target_value = data.target_value
    if data.target_date is not None: goal.target_date = data.target_date
    if data.weightage is not None:
        all_goals = db.query(Goal).filter(Goal.employee_id == goal.employee_id, Goal.cycle_id == goal.cycle_id, Goal.id != goal.id).all()
        total = sum(g.weightage for g in all_goals) + data.weightage
        if total > 100.01:
            raise HTTPException(400, f"Total weightage would be {total}%")
        goal.weightage = data.weightage

    new_values = {"target_value": goal.target_value, "weightage": goal.weightage}
    log_audit(db, "goals", goal.id, "inline_edit", current_user.id, old_values, new_values)
    goal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(goal)
    return GoalOut.model_validate(goal)


# ─── Shared Goals ─────────────────────────────────────────────

@router.post("/shared", response_model=List[GoalOut])
def create_shared_goals(data: SharedGoalCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    cycle = db.query(Cycle).filter(Cycle.id == data.cycle_id).first()
    if not cycle:
        raise HTTPException(404, "Cycle not found")

    parent_goal = Goal(employee_id=current_user.id, cycle_id=data.cycle_id, thrust_area=data.thrust_area,
                       title=data.title, description=data.description, uom_type=UoMType(data.uom_type),
                       target_value=data.target_value, target_date=data.target_date,
                       weightage=data.default_weightage, status=GoalStatus.draft,
                       is_shared=True, shared_by=current_user.id)
    db.add(parent_goal)
    db.flush()

    child_goals = []
    for emp_id in data.employee_ids:
        emp = db.query(User).filter(User.id == emp_id).first()
        if not emp:
            continue
        existing = db.query(Goal).filter(Goal.employee_id == emp_id, Goal.cycle_id == data.cycle_id).all()
        if len(existing) >= 8:
            continue

        child = Goal(employee_id=emp_id, cycle_id=data.cycle_id, thrust_area=data.thrust_area,
                     title=data.title, description=data.description, uom_type=UoMType(data.uom_type),
                     target_value=data.target_value, target_date=data.target_date,
                     weightage=data.default_weightage, status=GoalStatus.draft,
                     is_shared=True, shared_by=current_user.id, parent_goal_id=parent_goal.id)
        db.add(child)
        child_goals.append(child)
        create_notification(db, emp_id, f"A shared goal '{data.title}' has been assigned to you")

    db.commit()
    all_goals = [parent_goal] + child_goals
    for g in all_goals:
        db.refresh(g)
    return [GoalOut.model_validate(g) for g in all_goals]
