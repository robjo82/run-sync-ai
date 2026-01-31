"""Race goal model for training plan generation."""

from sqlalchemy import Column, Integer, String, Date, Time, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class RaceGoal(Base):
    """User's race goals for training plan generation."""
    
    __tablename__ = "race_goals"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Race details
    name = Column(String(200), nullable=False)  # "Marathon de Paris 2026"
    race_date = Column(Date, nullable=False, index=True)
    race_type = Column(String(50), nullable=False)  # marathon, half, 10k, 5k, trail, ultra
    distance_km = Column(Integer, nullable=True)  # For custom distances
    
    # Target
    target_time_seconds = Column(Integer, nullable=True)  # Goal finish time in seconds
    priority = Column(String(1), default="A")  # A (main), B (secondary), C (fun)
    
    # Plan generation config
    available_days = Column(String(100), default="1,2,3,4,5,6,7")  # Days available for training (1=Mon)
    max_weekly_hours = Column(Integer, default=10)  # Max training hours per week
    long_run_day = Column(Integer, default=6)  # Preferred day for long run (1=Mon, 7=Sun)
    
    # Status
    status = Column(String(20), default="planning")  # planning, active, completed, cancelled
    plan_generated = Column(Boolean, default=False)
    plan_generated_at = Column(Date, nullable=True)
    
    # Notes
    notes = Column(Text, nullable=True)
    plan_explanation = Column(Text, nullable=True)  # Coach's explanation for the generated plan
    
    # Timestamps
    created_at = Column(Date, default=datetime.utcnow)
    updated_at = Column(Date, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="race_goals")
    planned_sessions = relationship("PlannedSession", back_populates="race_goal", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<RaceGoal {self.name} - {self.race_date}>"
    
    @property
    def target_time_formatted(self):
        """Return target time as HH:MM:SS."""
        if not self.target_time_seconds:
            return None
        hours = self.target_time_seconds // 3600
        minutes = (self.target_time_seconds % 3600) // 60
        seconds = self.target_time_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    @property
    def weeks_until_race(self):
        """Calculate weeks remaining until race date."""
        from datetime import date
        delta = self.race_date - date.today()
        return max(0, delta.days // 7)
