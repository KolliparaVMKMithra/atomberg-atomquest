"""
Database seeding script for AtomQuest demo data.
Creates demo users, an active cycle, and sample goals.
Run once: python seed.py
"""

from datetime import date, datetime
from database import SessionLocal, create_tables
from models import User, Cycle, Goal, UserRole, GoalStatus, UoMType
from auth import hash_password


def seed():
    create_tables()
    db = SessionLocal()

    try:
        # Check if already seeded
        if db.query(User).filter(User.email == "admin@demo.com").first():
            print("✅ Database already seeded. Skipping.")
            return

        print("🌱 Seeding database...")

        # ─── Users ────────────────────────────────────────
        admin = User(
            name="Admin User", email="admin@demo.com",
            hashed_password=hash_password("Atom@Quest2025"),
            role=UserRole.admin, department="HR",
        )
        db.add(admin)
        db.flush()

        manager = User(
            name="Manager User", email="manager@demo.com",
            hashed_password=hash_password("Atom@Quest2025"),
            role=UserRole.manager, department="Engineering",
        )
        db.add(manager)
        db.flush()

        employee = User(
            name="Employee User", email="employee@demo.com",
            hashed_password=hash_password("Atom@Quest2025"),
            role=UserRole.employee, department="Engineering",
            manager_id=manager.id,
        )
        db.add(employee)
        db.flush()

        print(f"  👤 Admin:    admin@demo.com (id={admin.id})")
        print(f"  👤 Manager:  manager@demo.com (id={manager.id})")
        print(f"  👤 Employee: employee@demo.com (id={employee.id})")

        # ─── Cycle ────────────────────────────────────────
        cycle = Cycle(
            name="FY 2025-26",
            goal_setting_start=date(2025, 5, 1),
            q1_start=date(2025, 7, 1),
            q2_start=date(2025, 10, 1),
            q3_start=date(2026, 1, 1),
            q4_start=date(2026, 3, 1),
            is_active=True,
            created_by=admin.id,
        )
        db.add(cycle)
        db.flush()
        print(f"  📅 Cycle: {cycle.name} (id={cycle.id})")

        # ─── Sample Goals ─────────────────────────────────
        goals_data = [
            {
                "thrust_area": "Revenue Growth",
                "title": "Achieve Q1 Sales Target",
                "description": "Reach the quarterly sales target of ₹5,00,000 through new client acquisition and upselling existing accounts.",
                "uom_type": UoMType.numeric_min,
                "target_value": 500000,
                "target_date": None,
                "weightage": 30,
            },
            {
                "thrust_area": "Cost Optimisation",
                "title": "Reduce TAT to 2 Days",
                "description": "Optimize turnaround time for service requests from current 5 days to 2 days through process automation.",
                "uom_type": UoMType.numeric_max,
                "target_value": 2,
                "target_date": None,
                "weightage": 25,
            },
            {
                "thrust_area": "Compliance",
                "title": "Zero Safety Incidents",
                "description": "Maintain zero safety incidents across all project sites through strict adherence to safety protocols.",
                "uom_type": UoMType.zero,
                "target_value": 0,
                "target_date": None,
                "weightage": 20,
            },
            {
                "thrust_area": "People Development",
                "title": "Complete Training by Dec",
                "description": "Complete all mandatory training modules and obtain certification by December 31, 2025.",
                "uom_type": UoMType.timeline,
                "target_value": None,
                "target_date": date(2025, 12, 31),
                "weightage": 25,
            },
        ]

        for gd in goals_data:
            goal = Goal(
                employee_id=employee.id,
                cycle_id=cycle.id,
                thrust_area=gd["thrust_area"],
                title=gd["title"],
                description=gd["description"],
                uom_type=gd["uom_type"],
                target_value=gd["target_value"],
                target_date=gd["target_date"],
                weightage=gd["weightage"],
                status=GoalStatus.draft,
            )
            db.add(goal)
            print(f"  🎯 Goal: {gd['title']} ({gd['weightage']}%)")

        db.commit()
        print("\n✅ Seed complete! Demo credentials:")
        print("   Employee: employee@demo.com / Atom@Quest2025")
        print("   Manager:  manager@demo.com  / Atom@Quest2025")
        print("   Admin:    admin@demo.com    / Atom@Quest2025")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
