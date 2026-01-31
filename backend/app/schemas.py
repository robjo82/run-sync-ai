"""Pydantic schemas for API request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date


# ============== User Schemas ==============

class UserBase(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    resting_heart_rate: int = 60
    max_heart_rate: int = 190


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: Optional[str] = None
    resting_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    preferences: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    id: int
    strava_athlete_id: Optional[int] = None
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


# ============== Activity Schemas ==============

class ActivityBase(BaseModel):
    activity_type: str
    name: str
    start_date: datetime
    distance: float = 0
    moving_time: int = 0
    elapsed_time: int = 0
    total_elevation_gain: float = 0
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None
    average_speed: float = 0


class ActivityCreate(ActivityBase):
    strava_id: str
    telemetry: Optional[Dict[str, Any]] = None


class ActivityClassification(BaseModel):
    classification: str
    confidence: float
    reasoning: str
    include_in_training_load: bool


class ActivityResponse(ActivityBase):
    id: int
    user_id: int
    strava_id: str
    classification: str
    classification_confidence: float
    classification_reasoning: Optional[str] = None
    include_in_training_load: bool
    manually_classified: bool
    trimp_score: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivitySummary(BaseModel):
    id: int
    name: str
    activity_type: str
    start_date: datetime
    distance: float
    moving_time: int
    classification: str
    classification_confidence: float
    trimp_score: Optional[float] = None

    class Config:
        from_attributes = True


# ============== Daily Check-in Schemas ==============

class DailyCheckinBase(BaseModel):
    date: date
    rpe: Optional[int] = Field(None, ge=1, le=10)
    sleep_quality: Optional[int] = Field(None, ge=1, le=5)
    energy_level: Optional[int] = Field(None, ge=1, le=5)
    stress_level: Optional[int] = Field(None, ge=1, le=5)
    mood: Optional[int] = Field(None, ge=1, le=5)
    soreness_level: int = Field(0, ge=0, le=10)
    soreness_location: Optional[str] = None
    pain_description: Optional[str] = None
    resting_heart_rate: Optional[int] = None
    notes: Optional[str] = None


class DailyCheckinCreate(DailyCheckinBase):
    pass


class DailyCheckinUpdate(BaseModel):
    rpe: Optional[int] = Field(None, ge=1, le=10)
    sleep_quality: Optional[int] = Field(None, ge=1, le=5)
    energy_level: Optional[int] = Field(None, ge=1, le=5)
    stress_level: Optional[int] = Field(None, ge=1, le=5)
    mood: Optional[int] = Field(None, ge=1, le=5)
    soreness_level: Optional[int] = Field(None, ge=0, le=10)
    soreness_location: Optional[str] = None
    pain_description: Optional[str] = None
    resting_heart_rate: Optional[int] = None
    notes: Optional[str] = None


class DailyCheckinResponse(DailyCheckinBase):
    id: int
    user_id: int
    hrv: Optional[float] = None

    class Config:
        from_attributes = True


# ============== Training Plan Schemas ==============

class PlannedSessionBase(BaseModel):
    scheduled_date: date
    session_type: str
    title: str
    description: Optional[str] = None
    target_duration: Optional[int] = None
    target_distance: Optional[float] = None
    target_intensity: str = "moderate"
    target_heart_rate_zone: Optional[int] = Field(None, ge=1, le=5)
    target_pace_per_km: Optional[int] = None  # seconds per km
    terrain_type: str = "road"  # road, trail, track, mixed
    elevation_gain: int = 0  # meters
    intervals: Optional[List[Dict[str, Any]]] = None
    workout_structure: Optional[Dict[str, Any]] = None
    workout_details: Optional[str] = None  # Coach instructions


class PlannedSessionCreate(PlannedSessionBase):
    pass


class PlannedSessionUpdate(BaseModel):
    scheduled_date: Optional[date] = None
    session_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    target_duration: Optional[int] = None
    target_distance: Optional[float] = None
    target_intensity: Optional[str] = None
    target_pace_per_km: Optional[int] = None
    terrain_type: Optional[str] = None
    status: Optional[str] = None


class PlannedSessionResponse(PlannedSessionBase):
    id: int
    user_id: int
    race_goal_id: Optional[int] = None
    week_number: Optional[int] = None
    status: str
    original_session: Optional[Dict[str, Any]] = None
    adjustment_reason: Optional[str] = None
    google_calendar_event_id: Optional[str] = None

    class Config:
        from_attributes = True


# ============== Training Metrics Schemas ==============

class TrainingMetrics(BaseModel):
    """Current training load metrics."""
    date: date
    acute_load: float  # 7-day rolling
    chronic_load: float  # 28-day rolling
    acwr: float  # Acute:Chronic ratio
    ctl: float  # Chronic Training Load (Fitness)
    atl: float  # Acute Training Load (Fatigue)
    tsb: float  # Training Stress Balance (Form)
    training_zone: str  # "optimal", "overreaching", "detraining"


class FitnessHistory(BaseModel):
    """Historical fitness/fatigue data for charting."""
    dates: List[date]
    ctl_values: List[float]
    atl_values: List[float]
    tsb_values: List[float]


# ============== Coaching Schemas ==============

class CoachingContext(BaseModel):
    """Context sent to coaching LLM."""
    recent_activities: List[ActivitySummary]
    current_metrics: TrainingMetrics
    upcoming_sessions: List[PlannedSessionResponse]
    latest_checkin: Optional[DailyCheckinResponse] = None
    user_preferences: Dict[str, Any] = {}


class CoachingDecision(BaseModel):
    """Decision from coaching LLM."""
    action: str  # "maintain", "adjust", "rest"
    confidence: float
    reasoning: str
    adjustments: Optional[List[Dict[str, Any]]] = None
    message_to_user: str


# ============== Race Goal Schemas ==============

class RaceGoalBase(BaseModel):
    """Base race goal schema."""
    name: str
    race_date: date
    race_type: str  # marathon, half, 10k, 5k, trail, ultra
    distance_km: Optional[int] = None
    target_time_seconds: Optional[int] = None
    priority: str = "A"  # A, B, C
    available_days: str = "1,2,3,4,5,6,7"
    max_weekly_hours: int = 10
    long_run_day: int = 6
    notes: Optional[str] = None


class RaceGoalCreate(RaceGoalBase):
    """Schema for creating a race goal."""
    pass


class RaceGoalUpdate(BaseModel):
    """Schema for updating a race goal."""
    name: Optional[str] = None
    race_date: Optional[date] = None
    target_time_seconds: Optional[int] = None
    priority: Optional[str] = None
    available_days: Optional[str] = None
    max_weekly_hours: Optional[int] = None
    long_run_day: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class RaceGoalResponse(RaceGoalBase):
    """Schema for race goal response."""
    id: int
    user_id: int
    status: str
    plan_generated: bool
    weeks_until_race: Optional[int] = None
    plan_explanation: Optional[str] = None

    class Config:
        from_attributes = True


class RaceGoalWithPlan(RaceGoalResponse):
    """Race goal with its associated training sessions."""
    planned_sessions: List[PlannedSessionResponse] = []

    class Config:
        from_attributes = True
