"""Daily check-in model for subjective feedback."""

from sqlalchemy import Column, Integer, String, Date, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class DailyCheckin(Base):
    """Daily subjective feedback for training adjustments."""
    
    __tablename__ = "daily_checkins"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, index=True)
    
    # Subjective metrics (1-10 scales)
    rpe = Column(Integer, nullable=True)  # Rate of Perceived Exertion from yesterday
    sleep_quality = Column(Integer, nullable=True)  # 1-5
    energy_level = Column(Integer, nullable=True)  # 1-5
    stress_level = Column(Integer, nullable=True)  # 1-5
    mood = Column(Integer, nullable=True)  # 1-5
    
    # Soreness/Pain
    soreness_level = Column(Integer, default=0)  # 0-10
    soreness_location = Column(String(100), nullable=True)  # "ankle", "knee", "hip", etc.
    pain_description = Column(String(500), nullable=True)
    
    # Recovery indicators
    resting_heart_rate = Column(Integer, nullable=True)  # Morning HR
    hrv = Column(Float, nullable=True)  # Heart Rate Variability if available
    
    # Notes
    notes = Column(Text, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="checkins")
    
    def __repr__(self):
        return f"<DailyCheckin {self.date} - RPE:{self.rpe}, Soreness:{self.soreness_level}>"
