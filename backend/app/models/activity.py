"""Activity model for storing training data from Strava."""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Activity(Base):
    """Training activity with LLM classification."""
    
    __tablename__ = "activities"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Strava data
    strava_id = Column(String(50), unique=True, index=True)
    activity_type = Column(String(50))  # "Run", "Ride", "Swim", etc.
    name = Column(String(255))
    description = Column(String(1000), nullable=True)
    
    # Timing
    start_date = Column(DateTime, index=True)
    start_date_local = Column(DateTime)
    timezone = Column(String(100), nullable=True)
    
    # Metrics
    distance = Column(Float, default=0)  # meters
    moving_time = Column(Integer, default=0)  # seconds
    elapsed_time = Column(Integer, default=0)  # seconds
    total_elevation_gain = Column(Float, default=0)  # meters
    
    # Heart rate
    average_heartrate = Column(Float, nullable=True)
    max_heartrate = Column(Float, nullable=True)
    has_heartrate = Column(Boolean, default=False)
    
    # Speed/Pace
    average_speed = Column(Float, default=0)  # m/s
    max_speed = Column(Float, default=0)  # m/s
    
    # Power (for cycling/running with power meter)
    average_watts = Column(Float, nullable=True)
    weighted_average_watts = Column(Float, nullable=True)
    
    # Location
    start_latlng = Column(JSON, nullable=True)  # [lat, lng]
    end_latlng = Column(JSON, nullable=True)
    
    # LLM Classification
    classification = Column(String(50), default="unknown")  # workout, commute, recovery, race
    classification_confidence = Column(Float, default=0.0)
    classification_reasoning = Column(String(500), nullable=True)
    include_in_training_load = Column(Boolean, default=True)
    manually_classified = Column(Boolean, default=False)
    
    # Computed training metrics
    trimp_score = Column(Float, nullable=True)
    relative_effort = Column(Float, nullable=True)
    
    # Raw telemetry streams (JSONB)
    telemetry = Column(JSON, nullable=True)  # {heartrate: [...], speed: [...], altitude: [...]}
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="activities")
    
    def __repr__(self):
        return f"<Activity {self.name} ({self.activity_type}) - {self.classification}>"
