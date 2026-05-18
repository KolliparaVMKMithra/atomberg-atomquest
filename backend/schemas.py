"""
Pydantic schemas for request/response validation in AtomQuest API.
"""

from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


# ─── Auth Schemas ─────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    department: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── User Schemas ─────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str = Field(..., max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=4)
    role: str = Field(..., pattern="^(employee|manager|admin)$")
    department: Optional[str] = Field(None, max_length=100)
    manager_id: Optional[int] = None


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=4)
    role: Optional[str] = Field(None, pattern="^(employee|manager|admin)$")
    department: Optional[str] = Field(None, max_length=100)
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None


# ─── Cycle Schemas ────────────────────────────────────────────

class CycleCreate(BaseModel):
    name: str = Field(..., max_length=100)
    goal_setting_start: date
    q1_start: date
    q2_start: date
    q3_start: date
    q4_start: date
    is_active: bool = True


class CycleUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    goal_setting_start: Optional[date] = None
    q1_start: Optional[date] = None
    q2_start: Optional[date] = None
    q3_start: Optional[date] = None
    q4_start: Optional[date] = None
    is_active: Optional[bool] = None


class CycleOut(BaseModel):
    id: int
    name: str
    goal_setting_start: date
    q1_start: date
    q2_start: date
    q3_start: date
    q4_start: date
    is_active: bool
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


# ─── Goal Schemas ─────────────────────────────────────────────

class GoalCreate(BaseModel):
    cycle_id: int
    thrust_area: str = Field(..., max_length=100)
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    uom_type: str = Field(..., pattern="^(numeric_min|numeric_max|timeline|zero)$")
    target_value: Optional[float] = None
    target_date: Optional[date] = None
    weightage: float = Field(..., ge=10, le=90)


class GoalUpdate(BaseModel):
    thrust_area: Optional[str] = Field(None, max_length=100)
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    uom_type: Optional[str] = Field(None, pattern="^(numeric_min|numeric_max|timeline|zero)$")
    target_value: Optional[float] = None
    target_date: Optional[date] = None
    weightage: Optional[float] = Field(None, ge=10, le=90)


class GoalInlineEdit(BaseModel):
    target_value: Optional[float] = None
    target_date: Optional[date] = None
    weightage: Optional[float] = Field(None, ge=10, le=90)


class GoalApprovalComment(BaseModel):
    comment: str = Field(..., min_length=1)


class GoalOut(BaseModel):
    id: int
    employee_id: int
    cycle_id: int
    thrust_area: str
    title: str
    description: Optional[str] = None
    uom_type: str
    target_value: Optional[float] = None
    target_date: Optional[date] = None
    weightage: float
    status: str
    is_shared: bool = False
    shared_by: Optional[int] = None
    parent_goal_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    employee: Optional[UserOut] = None
    approvals: Optional[List["GoalApprovalOut"]] = []
    achievements: Optional[List["AchievementOut"]] = []

    class Config:
        from_attributes = True


class SharedGoalCreate(BaseModel):
    cycle_id: int
    thrust_area: str = Field(..., max_length=100)
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    uom_type: str = Field(..., pattern="^(numeric_min|numeric_max|timeline|zero)$")
    target_value: Optional[float] = None
    target_date: Optional[date] = None
    employee_ids: List[int]
    default_weightage: float = Field(..., ge=10, le=90)


# ─── Goal Approval Schemas ────────────────────────────────────

class GoalApprovalOut(BaseModel):
    id: int
    goal_id: int
    manager_id: int
    action: str
    comment: Optional[str] = None
    acted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Achievement Schemas ──────────────────────────────────────

class AchievementCreate(BaseModel):
    goal_id: int
    quarter: str = Field(..., pattern="^(Q1|Q2|Q3|Q4)$")
    actual_value: Optional[float] = None
    actual_date: Optional[date] = None
    status: str = Field(default="not_started", pattern="^(not_started|on_track|completed)$")


class AchievementUpdate(BaseModel):
    actual_value: Optional[float] = None
    actual_date: Optional[date] = None
    status: Optional[str] = Field(None, pattern="^(not_started|on_track|completed)$")


class AchievementOut(BaseModel):
    id: int
    goal_id: int
    quarter: str
    actual_value: Optional[float] = None
    actual_date: Optional[date] = None
    status: str
    progress_score: Optional[float] = None
    updated_at: Optional[datetime] = None
    goal: Optional[GoalOut] = None
    checkins: Optional[List["CheckinOut"]] = []

    class Config:
        from_attributes = True


# ─── Checkin Schemas ──────────────────────────────────────────

class CheckinCreate(BaseModel):
    achievement_id: int
    comment: str = Field(..., min_length=1)


class CheckinOut(BaseModel):
    id: int
    achievement_id: int
    manager_id: int
    comment: str
    created_at: Optional[datetime] = None
    manager: Optional[UserOut] = None

    class Config:
        from_attributes = True


# ─── Notification Schemas ─────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    user_id: int
    message: str
    is_read: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Audit Log Schemas ────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    table_name: str
    record_id: int
    action: str
    changed_by: int
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    changed_at: Optional[datetime] = None
    changed_by_user: Optional[UserOut] = None

    class Config:
        from_attributes = True


# ─── Report / Analytics Schemas ───────────────────────────────

class CompletionDashboardRow(BaseModel):
    employee_id: int
    employee_name: str
    department: Optional[str] = None
    manager_name: Optional[str] = None
    goals_submitted: int = 0
    goals_approved: int = 0
    q1_checkin: Optional[str] = None  # "done" | "not_done" | "not_open"
    q2_checkin: Optional[str] = None
    q3_checkin: Optional[str] = None
    q4_checkin: Optional[str] = None


class AnalyticsResponse(BaseModel):
    qoq_trends: List[dict]
    thrust_area_dist: List[dict]
    completion_heatmap: List[dict]
    manager_effectiveness: List[dict]


# Update forward references
TokenResponse.model_rebuild()
GoalOut.model_rebuild()
AchievementOut.model_rebuild()
