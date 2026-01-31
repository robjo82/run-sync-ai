"""Daily check-ins API router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date, timedelta

from app.database import get_db
from app.models import DailyCheckin, User
from app.schemas import (
    DailyCheckinCreate,
    DailyCheckinUpdate,
    DailyCheckinResponse,
)

router = APIRouter(prefix="/checkins", tags=["checkins"])


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get or create default user for now."""
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", email="user@runsync.ai")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/", response_model=List[DailyCheckinResponse])
def list_checkins(
    days: int = 14,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List recent check-ins."""
    since = date.today() - timedelta(days=days)
    
    checkins = (
        db.query(DailyCheckin)
        .filter(DailyCheckin.user_id == user.id, DailyCheckin.date >= since)
        .order_by(DailyCheckin.date.desc())
        .all()
    )
    
    return checkins


@router.get("/today", response_model=DailyCheckinResponse)
def get_today_checkin(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get today's check-in."""
    checkin = (
        db.query(DailyCheckin)
        .filter(DailyCheckin.user_id == user.id, DailyCheckin.date == date.today())
        .first()
    )
    if not checkin:
        raise HTTPException(status_code=404, detail="No check-in for today")
    return checkin


@router.post("/", response_model=DailyCheckinResponse)
def create_checkin(
    checkin_data: DailyCheckinCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or update a daily check-in."""
    # Check if check-in already exists for this date
    existing = (
        db.query(DailyCheckin)
        .filter(DailyCheckin.user_id == user.id, DailyCheckin.date == checkin_data.date)
        .first()
    )
    
    if existing:
        # Update existing check-in
        for field, value in checkin_data.model_dump(exclude_unset=True).items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing
    
    # Create new check-in
    checkin = DailyCheckin(user_id=user.id, **checkin_data.model_dump())
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    
    return checkin


@router.patch("/{checkin_id}", response_model=DailyCheckinResponse)
def update_checkin(
    checkin_id: int,
    checkin_data: DailyCheckinUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update an existing check-in."""
    checkin = (
        db.query(DailyCheckin)
        .filter(DailyCheckin.id == checkin_id, DailyCheckin.user_id == user.id)
        .first()
    )
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    for field, value in checkin_data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(checkin, field, value)
    
    db.commit()
    db.refresh(checkin)
    
    return checkin


@router.get("/history/summary")
def get_checkin_summary(
    days: int = 7,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get summary of recent check-ins."""
    since = date.today() - timedelta(days=days)
    
    checkins = (
        db.query(DailyCheckin)
        .filter(DailyCheckin.user_id == user.id, DailyCheckin.date >= since)
        .all()
    )
    
    if not checkins:
        return {
            "period_days": days,
            "checkin_count": 0,
            "avg_sleep_quality": None,
            "avg_energy_level": None,
            "avg_stress_level": None,
            "soreness_reports": [],
        }
    
    sleep_scores = [c.sleep_quality for c in checkins if c.sleep_quality]
    energy_scores = [c.energy_level for c in checkins if c.energy_level]
    stress_scores = [c.stress_level for c in checkins if c.stress_level]
    soreness = [
        {"date": c.date, "level": c.soreness_level, "location": c.soreness_location}
        for c in checkins
        if c.soreness_level > 0
    ]
    
    return {
        "period_days": days,
        "checkin_count": len(checkins),
        "avg_sleep_quality": round(sum(sleep_scores) / len(sleep_scores), 1) if sleep_scores else None,
        "avg_energy_level": round(sum(energy_scores) / len(energy_scores), 1) if energy_scores else None,
        "avg_stress_level": round(sum(stress_scores) / len(stress_scores), 1) if stress_scores else None,
        "soreness_reports": soreness,
    }
