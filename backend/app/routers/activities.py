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
    """Get personal records: Strava career stats + aggregated best efforts."""
    from app.services.strava_service import StravaService
    
    # Fetch Strava career stats
    strava_service = StravaService(db)
    
    try:
        import httpx
        try:
            strava_stats = await strava_service.get_athlete_stats(user)
        except (httpx.TimeoutException, httpx.ConnectError, Exception) as e:
            print(f"Strava stats fetch failed: {e}")
            strava_stats = {}
    except Exception:
        strava_stats = {}
    
    all_run = strava_stats.get("all_run_totals", {})
    recent_run = strava_stats.get("recent_run_totals", {})
    ytd_run = strava_stats.get("ytd_run_totals", {})
    
    # Fallback: if Strava stats missing, calculate from local DB
    if not all_run:
        all_activities = db.query(Activity).filter(Activity.user_id == user.id).all()
        current_year = datetime.now().year
        now = datetime.now()
        four_weeks_ago = now - timedelta(weeks=4)
        
        # Career
        all_run = {
            "count": len(all_activities),
            "distance": sum(a.distance for a in all_activities),
            "moving_time": sum(a.moving_time for a in all_activities),
            "elevation_gain": sum(a.total_elevation_gain for a in all_activities),
        }
        
        # YTD
        ytd_activities = [a for a in all_activities if a.start_date.year == current_year]
        ytd_run = {
            "count": len(ytd_activities),
            "distance": sum(a.distance for a in ytd_activities),
            "elevation_gain": sum(a.total_elevation_gain for a in ytd_activities),
        }
        
        # Recent 4w
        recent_activities = [a for a in all_activities if a.start_date >= four_weeks_ago]
        recent_run = {
            "count": len(recent_activities),
            "distance": sum(a.distance for a in recent_activities),
        }
    
    # Aggregate best efforts from stored activities
    # Strava stores best_efforts as: [{name: "5K", elapsed_time: 1256, ...}, ...]
    activities_with_efforts = db.query(Activity).filter(
        Activity.user_id == user.id,
        Activity.best_efforts.isnot(None)
    ).all()
    
    # Map of distance names to best times found
    EFFORT_DISTANCES = {
        "400m": {"target": "400m", "display": "400m"},
        "1K": {"target": "1K", "display": "1 KM"},
        "1 mile": {"target": "1 mile", "display": "1 Mile"},
        "5K": {"target": "5K", "display": "5K"},
        "10K": {"target": "10K", "display": "10K"},
        "Half-Marathon": {"target": "Half-Marathon", "display": "Semi"},
        "Marathon": {"target": "Marathon", "display": "Marathon"},
    }
    
    best_efforts_map = {}
    
    for activity in activities_with_efforts:
        if not activity.best_efforts:
            continue
        for effort in activity.best_efforts:
            name = effort.get("name")
            if name not in EFFORT_DISTANCES:
                continue
            
            elapsed_time = effort.get("elapsed_time", 0)
            if elapsed_time <= 0:
                continue
            
            # Check if this is better than current best
            if name not in best_efforts_map or elapsed_time < best_efforts_map[name]["elapsed_time"]:
                # Format time
                hours = int(elapsed_time // 3600)
                mins = int((elapsed_time % 3600) // 60)
                secs = int(elapsed_time % 60)
                if hours > 0:
                    time_formatted = f"{hours}:{mins:02d}:{secs:02d}"
                else:
                    time_formatted = f"{mins}:{secs:02d}"
                
                best_efforts_map[name] = {
                    "elapsed_time": elapsed_time,
                    "time_formatted": time_formatted,
                    "date": activity.start_date.isoformat() if activity.start_date else None,
                    "activity_name": activity.name,
                    "display_name": EFFORT_DISTANCES[name]["display"],
                }
    
    # Build response for specific distances
    def get_effort(name):
        if name in best_efforts_map:
            e = best_efforts_map[name]
            return {
                "time_seconds": e["elapsed_time"],
                "time_formatted": e["time_formatted"],
                "date": e["date"],
                "activity_name": e["activity_name"],
            }
        return None
    
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
            "5k": get_effort("5K"),
            "10k": get_effort("10K"),
            "half_marathon": get_effort("Half-Marathon"),
            "marathon": get_effort("Marathon"),
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


