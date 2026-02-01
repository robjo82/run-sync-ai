"""Coaching threads API router for conversational plan management."""

from typing import List, Optional
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models import User, RaceGoal, CoachingThread, CoachingMessage
from app.schemas import (
    CoachingThreadCreate,
    CoachingThreadResponse,
    CoachingThreadWithMessages,
    CoachingMessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.services.conversational_coach_service import ConversationalCoachService

router = APIRouter(prefix="/threads", tags=["coaching-threads"])


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get or create default user for now."""
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", email="user@runsync.ai")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/goal/{goal_id}", response_model=List[CoachingThreadResponse])
def list_goal_threads(
    goal_id: int,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all coaching threads for a goal."""
    # Verify goal belongs to user
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    query = db.query(CoachingThread).filter(CoachingThread.race_goal_id == goal_id)
    
    if not include_archived:
        query = query.filter(CoachingThread.is_archived == False)
    
    threads = query.order_by(CoachingThread.updated_at.desc()).all()
    
    # Add message count to each thread
    result = []
    for thread in threads:
        thread_dict = {
            "id": thread.id,
            "race_goal_id": thread.race_goal_id,
            "title": thread.title,
            "description": thread.description,
            "is_archived": thread.is_archived,
            "created_at": thread.created_at,
            "updated_at": thread.updated_at,
            "message_count": len(thread.messages) if thread.messages else 0,
        }
        result.append(thread_dict)
    
    return result


@router.post("/goal/{goal_id}", response_model=CoachingThreadWithMessages)
async def create_thread(
    goal_id: int,
    thread_data: CoachingThreadCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new coaching thread for a goal."""
    # Verify goal belongs to user
    goal = (
        db.query(RaceGoal)
        .filter(RaceGoal.id == goal_id, RaceGoal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Create the thread
    thread = CoachingThread(
        race_goal_id=goal_id,
        title=thread_data.title,
        description=thread_data.description,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    
    # If initial message provided, process it
    if thread_data.initial_message:
        coach_service = ConversationalCoachService(db)
        await coach_service.process_message(
            user_message=thread_data.initial_message,
            goal=goal,
            user=user,
            thread=thread,
        )
        db.refresh(thread)
    
    return thread


@router.get("/{thread_id}", response_model=CoachingThreadWithMessages)
def get_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a coaching thread with all its messages."""
    thread = db.query(CoachingThread).filter(CoachingThread.id == thread_id).first()
    
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Verify user owns the goal
    goal = db.query(RaceGoal).filter(RaceGoal.id == thread.race_goal_id).first()
    if not goal or goal.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return thread


@router.post("/{thread_id}/messages", response_model=SendMessageResponse)
async def send_message(
    thread_id: int,
    message: SendMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Send a message in a coaching thread.
    The coach will analyze and respond.
    """
    thread = db.query(CoachingThread).filter(CoachingThread.id == thread_id).first()
    
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Verify user owns the goal
    goal = db.query(RaceGoal).filter(RaceGoal.id == thread.race_goal_id).first()
    if not goal or goal.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if thread.is_archived:
        raise HTTPException(status_code=400, detail="Cannot send messages to archived thread")
    
    # Process the message
    # Process the message
    coach_service = ConversationalCoachService(db)
    
    # Check if client accepts stream (optional, or just force stream if we change the contract)
    # Ideally we'd check Accept header, but for this task we switch to stream always
    # or arguably we should have a separate endpoint / param.
    # Given the implementation plan says "Convert messages endpoint", we switch it.
    
    async def event_generator():
        async for event in coach_service.stream_process_message(
            user_message=message.content,
            goal=goal,
            user=user,
            thread=thread,
        ):
            yield json.dumps(event) + "\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.delete("/{thread_id}")
def archive_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Archive a coaching thread (soft delete)."""
    thread = db.query(CoachingThread).filter(CoachingThread.id == thread_id).first()
    
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Verify user owns the goal
    goal = db.query(RaceGoal).filter(RaceGoal.id == thread.race_goal_id).first()
    if not goal or goal.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    thread.is_archived = True
    db.commit()
    
    return {"message": "Thread archived successfully"}


@router.post("/{thread_id}/restore")
def restore_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Restore an archived coaching thread."""
    thread = db.query(CoachingThread).filter(CoachingThread.id == thread_id).first()
    
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Verify user owns the goal
    goal = db.query(RaceGoal).filter(RaceGoal.id == thread.race_goal_id).first()
    if not goal or goal.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    thread.is_archived = False
    db.commit()
    
    return {"message": "Thread restored successfully"}
