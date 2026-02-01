"""Activities API router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Activity, User
from app.schemas import (
    ActivityResponse,
    ActivitySummary,
    ActivityClassification,
)
from pydantic import BaseModel
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


@router.get("/records")
async def get_personal_records(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get personal records: Strava career stats + local best efforts."""
    from datetime import date
    from app.services.strava_service import StravaService
    
    # Fetch Strava career stats
    strava_service = StravaService(db)
    strava_stats = await strava_service.get_athlete_stats(user)
    
    all_run = strava_stats.get("all_run_totals", {})
    recent_run = strava_stats.get("recent_run_totals", {})
    ytd_run = strava_stats.get("ytd_run_totals", {})
    
    # Query local DB for best efforts (fastest pace for 5k, 10k, half, marathon)
    def get_best_for_distance(min_distance, max_distance=None):
        query = db.query(Activity).filter(
            Activity.user_id == user.id,
            Activity.activity_type == "Run",
            Activity.distance >= min_distance,
            Activity.moving_time > 0
        )
        if max_distance:
            query = query.filter(Activity.distance < max_distance)
        
        activities = query.all()
        if not activities:
            return None
        
        # Calculate pace (time per km) and find best
        best = min(activities, key=lambda a: a.moving_time / (a.distance / 1000))
        pace_s_per_km = best.moving_time / (best.distance / 1000)
        mins = int(pace_s_per_km // 60)
        secs = int(pace_s_per_km % 60)
        return {
            "time_seconds": best.moving_time,
            "time_formatted": f"{int(best.moving_time // 3600)}:{int((best.moving_time % 3600) // 60):02d}:{int(best.moving_time % 60):02d}",
            "pace": f"{mins}:{secs:02d}/km",
            "date": best.start_date.isoformat() if best.start_date else None,
            "activity_name": best.name,
        }
    
    best_5k = get_best_for_distance(5000, 10000)
    best_10k = get_best_for_distance(10000, 21000)
    best_half = get_best_for_distance(21000, 42000)
    best_marathon = get_best_for_distance(42000)
    
    return {
        "career": {
            "total_runs": all_run.get("count", 0),
            "total_km": round(all_run.get("distance", 0) / 1000, 1),
            "total_elevation": all_run.get("elevation_gain", 0),
            "total_time_hours": round(all_run.get("moving_time", 0) / 3600, 1),
        },
        "ytd": {
            "runs": ytd_run.get("count", 0),
            "km": round(ytd_run.get("distance", 0) / 1000, 1),
            "elevation": ytd_run.get("elevation_gain", 0),
        },
        "recent_4w": {
            "runs": recent_run.get("count", 0),
            "km": round(recent_run.get("distance", 0) / 1000, 1),
        },
        "best_efforts": {
            "5k": best_5k,
            "10k": best_10k,
            "half_marathon": best_half,
            "marathon": best_marathon,
        }
    }


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


@router.post("/classify", response_model=Dict[str, int])
async def batch_classify_activities(
    activity_ids: List[int],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Batch classify activities using AI."""
    from app.services.llm_service import LLMService
    
    activities = (
        db.query(Activity)
        .filter(
            Activity.id.in_(activity_ids),
            Activity.user_id == user.id
        )
        .all()
    )
    
    if not activities:
        raise HTTPException(status_code=404, detail="No activities found")
        
    llm_service = LLMService()
    metrics_service = MetricsService(db)
    
    updated_count = 0
    
    for activity in activities:
        try:
            # Prepare data for LLM
            activity_data = {
                "name": activity.name,
                "type": activity.activity_type,
                "start_time": activity.start_date_local.isoformat() if activity.start_date_local else None,
                "distance_km": round((activity.distance or 0) / 1000, 2),
                "duration_min": round((activity.moving_time or 0) / 60, 1),
                "average_heartrate": activity.average_heartrate,
                "max_heartrate": activity.max_heartrate,
                "average_speed_kmh": round((activity.average_speed or 0) * 3.6, 1),
                "start_location": activity.start_latlng,
                "end_location": activity.end_latlng,
            }
            
            # Classify
            classification = await llm_service.classify_activity(activity_data)
            
            # Update activity
            activity.classification = classification.get("classification", "workout")
            activity.classification_confidence = classification.get("confidence", 0.5)
            activity.classification_reasoning = classification.get("reasoning", "")
            activity.include_in_training_load = classification.get("include_in_training_load", True)
            
            # Recalculate TRIMP if applicable
            if activity.include_in_training_load:
                activity.trimp_score = metrics_service.calculate_trimp(activity, user)
            else:
                activity.trimp_score = None
                
            updated_count += 1
            
        except Exception as e:
            print(f"Failed to classify activity {activity.id}: {e}")
            
    db.commit()
    
    return {
        "processed": len(activities),
        "updated": updated_count
    }


class BatchUpdateRequest(BaseModel):
    activity_ids: List[int]
    classification: ActivityClassification


@router.post("/batch-update", response_model=Dict[str, int])
def batch_update_classification(
    request: BatchUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Batch manually update activity classification."""
    activities = (
        db.query(Activity)
        .filter(
            Activity.id.in_(request.activity_ids),
            Activity.user_id == user.id
        )
        .all()
    )
    
    if not activities:
        raise HTTPException(status_code=404, detail="No activities found")
    
    metrics_service = MetricsService(db)
    updated_count = 0
    
    for activity in activities:
        # Update fields
        activity.classification = request.classification.classification
        activity.classification_confidence = request.classification.confidence
        activity.classification_reasoning = request.classification.reasoning
        activity.include_in_training_load = request.classification.include_in_training_load
        activity.manually_classified = True
        
        # Recalculate TRIMP if applicable
        if activity.include_in_training_load and activity.average_heartrate:
            activity.trimp_score = metrics_service.calculate_trimp(activity, user)
        elif not activity.include_in_training_load:
            activity.trimp_score = None
            
        updated_count += 1
            
    db.commit()
    
    return {
        "processed": len(activities),
        "updated": updated_count
    }


