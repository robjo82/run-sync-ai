"""Coaching service - the AI brain that makes training decisions."""

from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import Optional

from app.models import User, Activity, DailyCheckin, PlannedSession
from app.schemas import (
    CoachingDecision,
    ActivitySummary,
    DailyCheckinResponse,
    PlannedSessionResponse,
)
from app.services.llm_service import LLMService
from app.services.metrics_service import MetricsService


class CoachingService:
    """AI-powered coaching service for training decisions."""
    
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService()
        self.metrics_service = MetricsService(db)
    
    async def get_recommendation(self, user: User) -> CoachingDecision:
        """
        Get an AI coaching recommendation based on current state.
        
        Aggregates:
        1. Recent training load (cleaned data)
        2. Upcoming planned sessions
        3. Latest subjective feedback
        4. Current metrics (ACWR, CTL/ATL/TSB)
        
        Sends to Gemini Pro for decision.
        """
        # Gather context
        context = await self._build_coaching_context(user)
        
        # Get LLM decision
        try:
            decision_data = await self.llm_service.get_coaching_decision(context)
            
            return CoachingDecision(
                action=decision_data.get("action", "maintain"),
                confidence=decision_data.get("confidence", 0.5),
                reasoning=decision_data.get("reasoning", ""),
                adjustments=decision_data.get("adjustments"),
                message_to_user=decision_data.get("message_to_user", "Keep up the good work!"),
            )
        except Exception as e:
            # Fallback to rule-based decision if LLM fails
            return self._fallback_decision(user, context)
    
    async def _build_coaching_context(self, user: User) -> dict:
        """Build the context object for the coaching LLM."""
        today = date.today()
        
        # Recent activities (last 14 days, cleaned)
        recent_activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.include_in_training_load == True,
                Activity.start_date >= today - timedelta(days=14),
            )
            .order_by(Activity.start_date.desc())
            .limit(20)
            .all()
        )
        
        activities_data = [
            {
                "id": a.id,
                "name": a.name,
                "type": a.activity_type,
                "date": a.start_date.isoformat() if a.start_date else None,
                "distance_km": round(a.distance / 1000, 2) if a.distance else 0,
                "duration_min": round(a.moving_time / 60, 1) if a.moving_time else 0,
                "trimp": a.trimp_score,
                "classification": a.classification,
            }
            for a in recent_activities
        ]
        
        # Current metrics
        metrics = self.metrics_service.get_current_metrics(user)
        
        # Upcoming sessions (next 7 days)
        upcoming_sessions = (
            self.db.query(PlannedSession)
            .filter(
                PlannedSession.user_id == user.id,
                PlannedSession.scheduled_date >= today,
                PlannedSession.scheduled_date <= today + timedelta(days=7),
                PlannedSession.status == "planned",
            )
            .order_by(PlannedSession.scheduled_date)
            .all()
        )
        
        sessions_data = [
            {
                "id": s.id,
                "date": s.scheduled_date.isoformat(),
                "type": s.session_type,
                "title": s.title,
                "target_duration_min": s.target_duration,
                "target_intensity": s.target_intensity,
            }
            for s in upcoming_sessions
        ]
        
        # Latest check-in
        latest_checkin = (
            self.db.query(DailyCheckin)
            .filter(
                DailyCheckin.user_id == user.id,
                DailyCheckin.date >= today - timedelta(days=3),
            )
            .order_by(DailyCheckin.date.desc())
            .first()
        )
        
        checkin_data = None
        if latest_checkin:
            checkin_data = {
                "date": latest_checkin.date.isoformat(),
                "sleep_quality": latest_checkin.sleep_quality,
                "energy_level": latest_checkin.energy_level,
                "stress_level": latest_checkin.stress_level,
                "soreness_level": latest_checkin.soreness_level,
                "soreness_location": latest_checkin.soreness_location,
                "rpe": latest_checkin.rpe,
                "notes": latest_checkin.notes,
            }
        
        return {
            "current_date": today.isoformat(),
            "metrics": {
                "acwr": metrics.acwr,
                "acute_load_7d": metrics.acute_load,
                "chronic_load_28d": metrics.chronic_load,
                "ctl_fitness": metrics.ctl,
                "atl_fatigue": metrics.atl,
                "tsb_form": metrics.tsb,
                "training_zone": metrics.training_zone,
            },
            "recent_activities": activities_data,
            "upcoming_sessions": sessions_data,
            "latest_checkin": checkin_data,
            "user_preferences": user.preferences or {},
        }
    
    def _fallback_decision(self, user: User, context: dict) -> CoachingDecision:
        """Rule-based fallback if LLM is unavailable."""
        metrics = context.get("metrics", {})
        acwr = metrics.get("acwr", 1.0)
        checkin = context.get("latest_checkin")
        
        # Check for danger signs
        if acwr > 1.5:
            return CoachingDecision(
                action="rest",
                confidence=0.8,
                reasoning=f"ACWR is {acwr:.2f}, which is above the safe threshold of 1.5.",
                adjustments=None,
                message_to_user="Your training load has spiked recently. Take an easy day to let your body recover.",
            )
        
        if checkin and checkin.get("soreness_level", 0) >= 7:
            return CoachingDecision(
                action="adjust",
                confidence=0.7,
                reasoning=f"High soreness level ({checkin['soreness_level']}/10) reported.",
                adjustments=[{"type": "reduce_intensity", "details": "Lower intensity for next 2 days"}],
                message_to_user=f"I noticed you're feeling sore. Let's take it easy until that improves.",
            )
        
        if acwr < 0.8:
            return CoachingDecision(
                action="adjust",
                confidence=0.6,
                reasoning=f"ACWR is {acwr:.2f}, indicating potential detraining.",
                adjustments=[{"type": "increase_volume", "details": "Consider adding an extra easy run"}],
                message_to_user="Your training load has been light recently. Ready to pick things up a bit?",
            )
        
        return CoachingDecision(
            action="maintain",
            confidence=0.7,
            reasoning="All metrics are within normal ranges.",
            adjustments=None,
            message_to_user="Everything looks good! Stick to your plan.",
        )
    
    async def apply_adjustment(self, user: User, adjustment_id: str) -> dict:
        """Apply a coaching adjustment to the training plan."""
        # TODO: Implement adjustment application logic
        # This would modify PlannedSession records and sync to Google Calendar
        return {"status": "applied", "adjustment_id": adjustment_id}
