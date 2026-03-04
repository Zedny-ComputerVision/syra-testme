import asyncio
from app.db.session import engine, AsyncSessionLocal
from app.models.models import User, Test, Question, Session, ProctoringAlert, Attempt
from app.core.security import get_password_hash
from datetime import datetime, timedelta, timezone
from sqlalchemy.future import select

async def seed_database():
    print("🌱 Starting database seeding...")
    async with AsyncSessionLocal() as db:
        try:
            # 1. Create Admin User with correct credentials
            result = await db.execute(select(User).where(User.email == "admin@gmail.com"))
            admin_user = result.scalars().first()
            if not admin_user:
                hashed_password = get_password_hash("admin")
                admin_user = User(
                    name="Admin User",
                    email="admin@gmail.com",
                    password_hash=hashed_password,
                    role="admin"
                )
                db.add(admin_user)
                await db.commit()
                await db.refresh(admin_user)
                print("✅ Created admin user: admin@gmail.com / admin")
            
            admin_user_id = admin_user.id

            # 2. Create Candidate User
            result = await db.execute(select(User).where(User.email == "john@example.com"))
            john_user = result.scalars().first()
            if not john_user:
                hashed_password = get_password_hash("password123")
                john_user = User(
                    name="John Doe",
                    email="john@example.com",
                    password_hash=hashed_password,
                    role="candidate"
                )
                db.add(john_user)
                await db.commit()
                await db.refresh(john_user)
                print("✅ Created test user: john@example.com / password123")
            
            john_user_id = john_user.id

            # 3. Create sample tests
            tests_data = [
                {
                    "name": "Senior Frontend Developer Assessment",
                    "description": "Comprehensive evaluation of React, TypeScript, and modern CSS practices. Includes practical coding challenges and theoretical questions.",
                    "status": "available",
                    "image": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=1000",
                    "created_by": admin_user_id
                }
            ]

            test_ids = []
            for t_data in tests_data:
                res = await db.execute(select(Test).where(Test.name == t_data["name"]))
                existing_test = res.scalars().first()
                if not existing_test:
                    test = Test(**t_data)
                    db.add(test)
                    await db.commit()
                    await db.refresh(test)
                    test_ids.append(test.id)
                else:
                    test_ids.append(existing_test.id)
            
            print(f"✅ Sample tests ready (Count: {len(test_ids)})")

            # 4. Create questions
            if test_ids:
                res = await db.execute(select(Question).where(Question.test_id == test_ids[0]))
                if not res.scalars().first():
                    q1 = Question(test_id=test_ids[0], text="Which is NOT a hook?", options=["useState", "useEffect", "useComp"], correct_option=2, points=10)
                    db.add(q1)
                    await db.commit()
                    print("✅ Created questions")

            # 5. Create session
            if test_ids:
                res = await db.execute(select(Session).where(Session.test_id == test_ids[0]))
                s_exists = res.scalars().first()
                if not s_exists:
                    session = Session(
                        test_id=test_ids[0],
                        available_from=datetime.now(timezone.utc),
                        available_to=datetime.now(timezone.utc) + timedelta(days=7),
                        seats=50,
                        group_id=1
                    )
                    db.add(session)
                    await db.commit()
                    await db.refresh(session)
                    session_id = session.id
                    print("✅ Created sample session")
                else:
                    session_id = s_exists.id

            # 6. Create attempt and alerts
            res = await db.execute(select(Attempt).where(Attempt.user_id == john_user_id))
            if not res.scalars().first():
                attempt = Attempt(
                    test_id=test_ids[0],
                    user_id=john_user_id,
                    session_id=session_id if 'session_id' in locals() else None,
                    status="completed",
                    score=10,
                    started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                    ended_at=datetime.now(timezone.utc) - timedelta(minutes=30)
                )
                db.add(attempt)
                await db.commit()
                await db.refresh(attempt)
                
                a1 = ProctoringAlert(attempt_id=attempt.id, user_id=john_user_id, message="Multiple faces detected")
                a2 = ProctoringAlert(attempt_id=attempt.id, user_id=john_user_id, message="Looking away")
                db.add_all([a1, a2])
                await db.commit()
                print("✅ Created sample attempt and alerts")

            print("\n🎉 Database seeding completed successfully!")
        except Exception as e:
            await db.rollback()
            print(f"❌ Error seeding database: {e}")
            raise e

if __name__ == "__main__":
    asyncio.run(seed_database())

