"""
SQLAlchemy ORM models for AtomQuest Goal Tracking Portal.
All 8 tables as specified in the database schema.
"""

import enum
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, Date,
    Enum as SAEnum, ForeignKey, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base


# ─── Enum Definitions ────────────────────────────────────────

class UserRole(str, enum.Enum):
    employee = "employee"
    manager = "manager"
    admin = "admin"


class GoalStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    locked = "locked"


class UoMType(str, enum.Enum):
    numeric_min = "numeric_min"
    numeric_max = "numeric_max"
    timeline = "timeline"
    zero = "zero"


class ApprovalAction(str, enum.Enum):
    approved = "approved"
    rejected = "rejected"
    returned = "returned"


class Quarter(str, enum.Enum):
    Q1 = "Q1"
    Q2 = "Q2"
    Q3 = "Q3"
    Q4 = "Q4"


class AchievementStatus(str, enum.Enum):
    not_started = "not_started"
    on_track = "on_track"
    completed = "completed"


# ─── Table: users ────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False)
    department = Column(String(100), nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    manager = relationship("User", remote_side=[id], backref="direct_reports")
    goals = relationship("Goal", back_populates="employee", foreign_keys="Goal.employee_id")
    notifications = relationship("Notification", back_populates="user")


# ─── Table: cycles ───────────────────────────────────────────

class Cycle(Base):
    __tablename__ = "cycles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    goal_setting_start = Column(Date, nullable=False)
    q1_start = Column(Date, nullable=False)
    q2_start = Column(Date, nullable=False)
    q3_start = Column(Date, nullable=False)
    q4_start = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    goals = relationship("Goal", back_populates="cycle")


# ─── Table: goals ────────────────────────────────────────────

class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    cycle_id = Column(Integer, ForeignKey("cycles.id"), nullable=False)
    thrust_area = Column(String(100), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    uom_type = Column(SAEnum(UoMType), nullable=False)
    target_value = Column(Float, nullable=True)
    target_date = Column(Date, nullable=True)
    weightage = Column(Float, nullable=False)
    status = Column(SAEnum(GoalStatus), default=GoalStatus.draft)
    is_shared = Column(Boolean, default=False)
    shared_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    parent_goal_id = Column(Integer, ForeignKey("goals.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    employee = relationship("User", back_populates="goals", foreign_keys=[employee_id])
    cycle = relationship("Cycle", back_populates="goals")
    shared_by_user = relationship("User", foreign_keys=[shared_by])
    parent_goal = relationship("Goal", remote_side=[id], backref="child_goals")
    approvals = relationship("GoalApproval", back_populates="goal")
    achievements = relationship("Achievement", back_populates="goal")


# ─── Table: goal_approvals ───────────────────────────────────

class GoalApproval(Base):
    __tablename__ = "goal_approvals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(SAEnum(ApprovalAction), nullable=False)
    comment = Column(Text, nullable=True)
    acted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    goal = relationship("Goal", back_populates="approvals")
    manager = relationship("User", foreign_keys=[manager_id])


# ─── Table: achievements ─────────────────────────────────────

class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    quarter = Column(SAEnum(Quarter), nullable=False)
    actual_value = Column(Float, nullable=True)
    actual_date = Column(Date, nullable=True)
    status = Column(SAEnum(AchievementStatus), default=AchievementStatus.not_started)
    progress_score = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("goal_id", "quarter", name="uq_goal_quarter"),
    )

    # Relationships
    goal = relationship("Goal", back_populates="achievements")
    checkins = relationship("Checkin", back_populates="achievement")


# ─── Table: checkins ─────────────────────────────────────────

class Checkin(Base):
    __tablename__ = "checkins"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    achievement_id = Column(Integer, ForeignKey("achievements.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    achievement = relationship("Achievement", back_populates="checkins")
    manager = relationship("User", foreign_keys=[manager_id])


# ─── Table: audit_logs ───────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    table_name = Column(String(50), nullable=False)
    record_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    changed_by_user = relationship("User", foreign_keys=[changed_by])


# ─── Table: notifications ────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="notifications")
