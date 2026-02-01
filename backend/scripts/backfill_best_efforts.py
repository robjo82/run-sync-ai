"""Backfill best_efforts for existing activities."""
import asyncio
import sys
sys.path.insert(0, "/app")

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import User, Activity
from app.services.strava_service import StravaService


async def backfill_best_efforts():
    """Fetch and store best_efforts for all existing activities."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.strava_access_token.isnot(None)).all()
        
        for user in users:
            print(f"Processing user {user.id}: {user.email}")
            strava_service = StravaService(db)
            
            # Get activities without best_efforts
            activities = db.query(Activity).filter(
                Activity.user_id == user.id,
                Activity.best_efforts.is_(None),
                Activity.strava_id.isnot(None)
            ).all()
            
            print(f"  Found {len(activities)} activities to backfill")
            
            for i, activity in enumerate(activities):
                try:
                    detail = await strava_service.get_activity_detail(user, activity.strava_id)
                    if detail:
                        activity.best_efforts = detail.get("best_efforts")
                        activity.gear_id = detail.get("gear_id")
                        print(f"  [{i+1}/{len(activities)}] {activity.name}: {len(activity.best_efforts or [])} efforts")
                except Exception as e:
                    print(f"  [{i+1}/{len(activities)}] Error for {activity.name}: {e}")
                
                # Commit every 10 activities
                if (i + 1) % 10 == 0:
                    db.commit()
            
            db.commit()
            print(f"  Completed user {user.id}")
        
        print("Backfill complete!")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(backfill_best_efforts())
