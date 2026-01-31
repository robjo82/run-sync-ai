"""Race goals API router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date

from app.database import get_db
from app.models import User, RaceGoal, PlannedSession
from app.schemas import (
    RaceGoalCreate,
    RaceGoalUpdate,
    RaceGoalResponse,
    RaceGoalWithPlan,
)
from app.services.plan_generator_service import PlanGeneratorService

router = APIRouter(prefix="/goals", tags=["goals"])


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get or create default user for now."""
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", email="user@runsync.ai")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/", response_model=List[RaceGoalResponse])
def list_goals(
    status: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List user's race goals."""
    query = db.query(RaceGoal).filter(RaceGoal.user_id == user.id)
    
    if status:
        query = query.filter(RaceGoal.status == status)
    
    goals = query.order_by(RaceGoal.race_date).all()
    return goals


@router.post("/", response_model=RaceGoalResponse)
def create_goal(
    goal_data: RaceGoalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new race goal."""
    goal = RaceGoal(user_id=user.id, **goal_data.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get("/{goal_id}", response_model=RaceGoalWithPlan)
def get_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a race goal with its training plan."""
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.patch("/{goal_id}", response_model=RaceGoalResponse)
def update_goal(
    goal_id: int,
    goal_data: RaceGoalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a race goal."""
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    for field, value in goal_data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(goal, field, value)
    
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a race goal and its associated plan."""
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted successfully"}


@router.post("/{goal_id}/generate-plan")
async def generate_plan(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a training plan for a race goal using AI."""
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Check if plan already exists
    if goal.plan_generated:
        # Delete existing sessions
        db.query(PlannedSession).filter(
            PlannedSession.race_goal_id == goal_id
        ).delete()
    
    # Generate plan
    generator = PlanGeneratorService(db)
    
    try:
        sessions, explanation = await generator.generate_plan(goal, user)
        
        # Mark goal as having a plan and save explanation
        goal.plan_generated = True
        goal.plan_generated_at = date.today()
        goal.plan_explanation = explanation
        goal.status = "active"
        db.commit()
        
        return {
            "message": "Plan généré avec succès",
            "sessions_created": len(sessions),
            "weeks": goal.weeks_until_race,
            "explanation": explanation,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plan generation failed: {str(e)}")


@router.get("/{goal_id}/calendar")
def get_goal_calendar(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Get unified calendar view for a goal.
    Returns both past Strava activities and planned future sessions.
    """
    from app.models import Activity
    from datetime import timedelta
    
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    today = date.today()
    
    # Get planned sessions for this goal
    planned_sessions = (
        db.query(PlannedSession)
        .filter(PlannedSession.race_goal_id == goal_id)
        .order_by(PlannedSession.scheduled_date)
        .all()
    )
    
    # Get past activities (last 90 days or since goal creation)
    start_date = min(
        goal.created_at if goal.created_at else today,
        today - timedelta(days=90)
    )
    
    past_activities = (
        db.query(Activity)
        .filter(
            Activity.user_id == user.id,
            Activity.start_date >= start_date,
            Activity.activity_type.in_(["Run", "Trail Run", "Track"])
        )
        .order_by(Activity.start_date)
        .all()
    )
    
    # Format for calendar
    calendar_items = []
    
    # Add past activities
    for activity in past_activities:
        activity_date = activity.start_date.date() if hasattr(activity.start_date, 'date') else activity.start_date
        calendar_items.append({
            "type": "activity",
            "id": activity.id,
            "date": activity_date.isoformat() if activity_date else None,
            "title": activity.name,
            "activity_type": activity.activity_type,
            "distance_km": round(activity.distance / 1000, 1) if activity.distance else 0,
            "duration_min": round(activity.moving_time / 60, 0) if activity.moving_time else 0,
            "pace_per_km": int(activity.moving_time / (activity.distance / 1000)) if activity.distance > 0 else None,
            "elevation": activity.total_elevation_gain,
            "completed": True,
        })
    
    # Add planned sessions
    for session in planned_sessions:
        calendar_items.append({
            "type": "planned",
            "id": session.id,
            "date": session.scheduled_date.isoformat() if session.scheduled_date else None,
            "title": session.title,
            "session_type": session.session_type,
            "target_duration_min": session.target_duration,
            "target_pace_per_km": session.target_pace_per_km,
            "terrain_type": session.terrain_type,
            "elevation_gain": session.elevation_gain,
            "intervals": session.intervals,
            "workout_details": session.workout_details,
            "status": session.status,
            "week_number": session.week_number,
            "completed": session.status == "completed",
        })
    
    # Sort by date
    calendar_items.sort(key=lambda x: x["date"] or "")
    
    return {
        "goal_id": goal_id,
        "goal_name": goal.name,
        "race_date": goal.race_date.isoformat() if goal.race_date else None,
        "plan_explanation": goal.plan_explanation,
        "items": calendar_items,
    }

