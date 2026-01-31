"""Training plan and planned session models."""

from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class PlannedSession(Base):
    """A planned training session in the user's training plan."""
    
    __tablename__ = "planned_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    race_goal_id = Column(Integer, ForeignKey("race_goals.id"), nullable=True, index=True)
    
    # Scheduling
    scheduled_date = Column(Date, index=True)
    week_number = Column(Integer, nullable=True)  # Week in training plan (1 = first week)
    
    # Session details
    session_type = Column(String(50))  # long_run, interval, tempo, easy, recovery, rest, cross_train
    title = Column(String(255))
    description = Column(Text, nullable=True)
    
    # Targets
    target_duration = Column(Integer, nullable=True)  # minutes
    target_distance = Column(Float, nullable=True)  # meters
    target_intensity = Column(String(50))  # easy, moderate, hard, race_pace
    target_heart_rate_zone = Column(Integer, nullable=True)  # 1-5
    target_pace_per_km = Column(Integer, nullable=True)  # target pace in seconds/km
    
    # Terrain and environment
    terrain_type = Column(String(50), default="road")  # road, trail, track, mixed
    elevation_gain = Column(Integer, default=0)  # target elevation in meters
    
    # Workout structure (for intervals)
    workout_structure = Column(JSON, nullable=True)
    # Example: {\"warmup\": 10, \"intervals\": [{\"duration\": 3, \"intensity\": \"hard\"}], \"cooldown\": 10}
    intervals = Column(JSON, nullable=True)
    # Example: [{\"reps\": 6, \"distance_m\": 1000, \"pace_per_km\": 255, \"recovery_seconds\": 90}]
    
    # Coach details
    workout_details = Column(Text, nullable=True)  # Detailed coach instructions
    
    # AI Adjustments
    original_session = Column(JSON, nullable=True)  # Session before AI modification
    adjustment_reason = Column(String(500), nullable=True)
    adjustment_date = Column(Date, nullable=True)
    
    # Completion tracking
    status = Column(String(50), default="planned")  # planned, completed, skipped, modified
    linked_activity_id = Column(Integer, ForeignKey("activities.id"), nullable=True)
    
    # External integrations
    google_calendar_event_id = Column(String(255), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="planned_sessions")
    race_goal = relationship("RaceGoal", back_populates="planned_sessions")
    linked_activity = relationship("Activity", foreign_keys=[linked_activity_id])
    
    def __repr__(self):
        return f"<PlannedSession {self.scheduled_date} - {self.session_type}: {self.title}>"
