"""
Users router — CRUD operations for user management.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole
from schemas import UserCreate, UserUpdate, UserOut
from auth import get_current_user, require_role, hash_password

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    users = db.query(User).order_by(User.name).all()
    return [UserOut.model_validate(u) for u in users]


@router.post("/", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already exists")
    if data.manager_id and not db.query(User).filter(User.id == data.manager_id).first():
        raise HTTPException(400, "Manager not found")
    user = User(name=data.name, email=data.email, hashed_password=hash_password(data.password),
                role=UserRole(data.role), department=data.department, manager_id=data.manager_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if data.name is not None: user.name = data.name
    if data.email is not None:
        if db.query(User).filter(User.email == data.email, User.id != user_id).first():
            raise HTTPException(400, "Email in use")
        user.email = data.email
    if data.password is not None: user.hashed_password = hash_password(data.password)
    if data.role is not None: user.role = UserRole(data.role)
    if data.department is not None: user.department = data.department
    if data.manager_id is not None: user.manager_id = data.manager_id
    if data.is_active is not None: user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}")
def soft_delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot deactivate yourself")
    user.is_active = False
    db.commit()
    return {"detail": f"User {user.name} deactivated"}


@router.get("/team", response_model=List[UserOut])
def get_team(db: Session = Depends(get_db), current_user: User = Depends(require_role(["manager", "admin"]))):
    if current_user.role.value == "admin":
        users = db.query(User).filter(User.is_active == True).order_by(User.name).all()
    else:
        users = db.query(User).filter(User.manager_id == current_user.id, User.is_active == True).order_by(User.name).all()
    return [UserOut.model_validate(u) for u in users]
