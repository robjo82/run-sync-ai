"""Coaching thread model for conversational plan management."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class CoachingThread(Base):
    """A conversation thread between user and AI coach for a race goal."""
    
    __tablename__ = "coaching_threads"
    
    id = Column(Integer, primary_key=True, index=True)
    race_goal_id = Column(Integer, ForeignKey("race_goals.id"), nullable=False, index=True)
    
    # Thread metadata
    title = Column(String(200), default="Discussion avec le coach")
    description = Column(Text, nullable=True)
    
    # Status
    is_archived = Column(Boolean, default=False, index=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    race_goal = relationship("RaceGoal", back_populates="threads")
    messages = relationship(
        "CoachingMessage", 
        back_populates="thread", 
        order_by="CoachingMessage.created_at",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<CoachingThread {self.id}: {self.title}>"
    
    @property
    def message_count(self):
        """Return total number of messages in thread."""
        return len(self.messages) if self.messages else 0
    
    @property
    def last_message_at(self):
        """Return timestamp of last message."""
        if self.messages:
            return max(m.created_at for m in self.messages)
        return self.created_at
