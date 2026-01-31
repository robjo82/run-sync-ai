"""Coaching and training metrics API router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta

from app.database import get_db
from app.models import User
from app.schemas import TrainingMetrics, FitnessHistory, CoachingDecision
from app.services.metrics_service import MetricsService
from app.services.coaching_service import CoachingService

router = APIRouter(prefix="/coaching", tags=["coaching"])


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get or create default user for now."""
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", email="user@runsync.ai")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/metrics", response_model=TrainingMetrics)
def get_training_metrics(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get current training load metrics."""
    metrics_service = MetricsService(db)
    return metrics_service.get_current_metrics(user)


@router.get("/fitness-history", response_model=FitnessHistory)
def get_fitness_history(
    days: int = 90,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get historical fitness/fatigue data for charting."""
    metrics_service = MetricsService(db)
    return metrics_service.get_fitness_history(user, days)


@router.get("/recommendation", response_model=CoachingDecision)
async def get_recommendation(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get AI coaching recommendation based on current state."""
    coaching_service = CoachingService(db)
    return await coaching_service.get_recommendation(user)


@router.post("/apply-adjustment")
async def apply_adjustment(
    adjustment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Apply a coaching adjustment to the training plan."""
    coaching_service = CoachingService(db)
    result = await coaching_service.apply_adjustment(user, adjustment_id)
    return result


@router.get("/acwr-status")
def get_acwr_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get current ACWR status with safety zone indicator."""
    metrics_service = MetricsService(db)
    metrics = metrics_service.get_current_metrics(user)
    
    acwr = metrics.acwr
    
    if acwr < 0.8:
        zone = "detraining"
        status = "warning"
        message = "Training load is low. Consider increasing intensity to maintain fitness."
    elif acwr <= 1.3:
        zone = "optimal"
        status = "good"
        message = "Training load is in the optimal zone. Keep it up!"
    elif acwr <= 1.5:
        zone = "overreaching"
        status = "caution"
        message = "Training load is elevated. Monitor for signs of fatigue."
    else:
        zone = "danger"
        status = "danger"
        message = "Training load is very high. Consider reducing intensity to avoid injury."
    
    return {
        "acwr": round(acwr, 2),
        "zone": zone,
        "status": status,
        "message": message,
        "acute_load": round(metrics.acute_load, 1),
        "chronic_load": round(metrics.chronic_load, 1),
    }
