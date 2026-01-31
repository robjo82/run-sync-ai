"""Coaching message model for thread conversations."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class CoachingMessage(Base):
    """A message in a coaching conversation thread."""
    
    __tablename__ = "coaching_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("coaching_threads.id"), nullable=False, index=True)
    
    # Message content
    role = Column(String(20), nullable=False)  # "user", "coach", "system"
    content = Column(Text, nullable=False)
    
    # Message classification
    message_type = Column(String(50), default="general")
    # Types: "plan_request", "explanation", "question", "adjustment", 
    #        "off_topic", "confirmation", "general"
    
    # Sessions affected by this message (for plan modifications)
    sessions_affected = Column(JSON, nullable=True)
    # Format: [{"id": 1, "action": "created"}, {"id": 2, "action": "modified"}]
    
    # Metadata
    tokens_used = Column(Integer, nullable=True)  # LLM tokens for tracking
    processing_time_ms = Column(Integer, nullable=True)  # Response time
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    thread = relationship("CoachingThread", back_populates="messages")
    
    def __repr__(self):
        preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"<CoachingMessage {self.role}: {preview}>"
    
    @property
    def is_user_message(self):
        return self.role == "user"
    
    @property
    def is_coach_message(self):
        return self.role == "coach"
    
    @property
    def has_plan_changes(self):
        """Return True if this message resulted in plan modifications."""
        return bool(self.sessions_affected)
