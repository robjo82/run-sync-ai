"""Activities API router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Activity, User
from app.schemas import (
    ActivityResponse,
    ActivitySummary,
    ActivityClassification,
)
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/activities", tags=["activities"])


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get or create default user for now."""
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", email="user@runsync.ai")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/", response_model=List[ActivitySummary])
def list_activities(
    limit: int = Query(50, le=500),
    offset: int = 0,
    activity_type: Optional[str] = None,
    classification: Optional[str] = None,
    include_excluded: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List user activities with optional filters."""
    query = db.query(Activity).filter(Activity.user_id == user.id)
    
    if activity_type:
        query = query.filter(Activity.activity_type == activity_type)
    
    if classification:
        query = query.filter(Activity.classification == classification)
    
    if not include_excluded:
        query = query.filter(Activity.include_in_training_load == True)
    
    activities = (
        query.order_by(Activity.start_date.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    return activities


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single activity by ID."""
    activity = (
        db.query(Activity)
        .filter(Activity.id == activity_id, Activity.user_id == user.id)
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


@router.patch("/{activity_id}/classification", response_model=ActivityResponse)
def update_classification(
    activity_id: int,
    classification: ActivityClassification,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually update activity classification."""
    activity = (
        db.query(Activity)
        .filter(Activity.id == activity_id, Activity.user_id == user.id)
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    activity.classification = classification.classification
    activity.classification_confidence = 1.0  # Manual = 100% confidence
    activity.classification_reasoning = classification.reasoning
    activity.include_in_training_load = classification.include_in_training_load
    activity.manually_classified = True
    
    # Recalculate TRIMP if needed
    if classification.include_in_training_load and activity.average_heartrate:
        metrics_service = MetricsService(db)
        activity.trimp_score = metrics_service.calculate_trimp(activity, user)
    
    db.commit()
    db.refresh(activity)
    
    return activity


@router.get("/stats/summary")
def get_activity_stats(
    days: int = Query(7, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get activity summary statistics."""
    since = datetime.utcnow() - timedelta(days=days)
    
    activities = (
        db.query(Activity)
        .filter(
            Activity.user_id == user.id,
            Activity.start_date >= since,
            Activity.include_in_training_load == True,
        )
        .all()
    )
    
    total_distance = sum(a.distance for a in activities)
    total_time = sum(a.moving_time for a in activities)
    total_trimp = sum(a.trimp_score or 0 for a in activities)
    
    by_type = {}
    for a in activities:
        if a.activity_type not in by_type:
            by_type[a.activity_type] = {"count": 0, "distance": 0, "time": 0}
        by_type[a.activity_type]["count"] += 1
        by_type[a.activity_type]["distance"] += a.distance
        by_type[a.activity_type]["time"] += a.moving_time
    
    return {
        "period_days": days,
        "total_activities": len(activities),
        "total_distance_km": round(total_distance / 1000, 2),
        "total_time_hours": round(total_time / 3600, 2),
        "total_trimp": round(total_trimp, 1),
        "by_type": by_type,
    }
