"""User model for authentication and preferences."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class User(Base):
    """User account with Strava integration."""
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=True)  # Null for OAuth-only users
    
    # Strava integration
    strava_athlete_id = Column(Integer, unique=True, index=True, nullable=True)
    strava_access_token = Column(String(512), nullable=True)
    strava_refresh_token = Column(String(512), nullable=True)
    strava_token_expires_at = Column(DateTime, nullable=True)
    
    # Google Calendar integration
    google_access_token = Column(String(512), nullable=True)
    google_refresh_token = Column(String(512), nullable=True)
    google_token_expires_at = Column(DateTime, nullable=True)
    google_calendar_id = Column(String(255), nullable=True)
    
    # User preferences
    preferences = Column(JSON, default=dict)
    
    # Physiological data for calculations
    resting_heart_rate = Column(Integer, default=60)
    max_heart_rate = Column(Integer, default=190)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    activities = relationship("Activity", back_populates="user", cascade="all, delete-orphan")
    checkins = relationship("DailyCheckin", back_populates="user", cascade="all, delete-orphan")
    planned_sessions = relationship("PlannedSession", back_populates="user", cascade="all, delete-orphan")
    race_goals = relationship("RaceGoal", back_populates="user", cascade="all, delete-orphan")
