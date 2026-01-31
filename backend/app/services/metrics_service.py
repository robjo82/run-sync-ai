"""Training metrics calculation service - TRIMP, ACWR, CTL/ATL/TSB."""

from sqlalchemy.orm import Session
from datetime import date, timedelta
import math

from app.models import Activity, User
from app.schemas import TrainingMetrics, FitnessHistory


class MetricsService:
    """Service for calculating training load metrics."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def calculate_trimp(self, activity: Activity, user: User) -> float:
        """
        Calculate TRIMP (Training Impulse) for an activity.
        
        Formula: TRIMP = Duration (min) × HR_ratio × 0.64 × e^(1.92 × HR_ratio)
        Where HR_ratio = (HR_avg - HR_rest) / (HR_max - HR_rest)
        
        Uses gender-specific coefficients (assuming male for now):
        - Male: k = 1.92, y-intercept = 0.64
        - Female: k = 1.67, y-intercept = 0.86
        """
        if not activity.average_heartrate:
            # No HR data, estimate based on activity type and duration
            return self._estimate_trimp_no_hr(activity)
        
        hr_rest = user.resting_heart_rate or 60
        hr_max = user.max_heart_rate or 190
        hr_avg = activity.average_heartrate
        
        # Prevent division by zero or negative values
        hr_range = hr_max - hr_rest
        if hr_range <= 0:
            hr_range = 130  # Default range
        
        hr_ratio = (hr_avg - hr_rest) / hr_range
        hr_ratio = max(0, min(hr_ratio, 1))  # Clamp between 0 and 1
        
        duration_min = activity.moving_time / 60
        
        # Male coefficients
        k = 1.92
        y_intercept = 0.64
        
        trimp = duration_min * hr_ratio * y_intercept * math.exp(k * hr_ratio)
        
        return round(trimp, 1)
    
    def _estimate_trimp_no_hr(self, activity: Activity) -> float:
        """Estimate TRIMP when no HR data is available."""
        duration_min = activity.moving_time / 60
        
        # Base multipliers by activity type
        multipliers = {
            "Run": 1.2,
            "Ride": 0.8,
            "Swim": 1.0,
            "Walk": 0.5,
            "Hike": 0.7,
            "Workout": 1.0,
        }
        
        multiplier = multipliers.get(activity.activity_type, 0.8)
        
        # Simple estimate: duration * multiplier
        return round(duration_min * multiplier, 1)
    
    def get_daily_trimp(self, user: User, target_date: date) -> float:
        """Get total TRIMP for a specific date."""
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.include_in_training_load == True,
                Activity.start_date >= target_date,
                Activity.start_date < target_date + timedelta(days=1),
            )
            .all()
        )
        
        return sum(a.trimp_score or 0 for a in activities)
    
    def calculate_acute_load(self, user: User, as_of_date: date = None) -> float:
        """Calculate acute (7-day) training load."""
        as_of_date = as_of_date or date.today()
        start_date = as_of_date - timedelta(days=7)
        
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.include_in_training_load == True,
                Activity.start_date >= start_date,
                Activity.start_date <= as_of_date,
            )
            .all()
        )
        
        return sum(a.trimp_score or 0 for a in activities)
    
    def calculate_chronic_load(self, user: User, as_of_date: date = None) -> float:
        """Calculate chronic (28-day average) training load."""
        as_of_date = as_of_date or date.today()
        start_date = as_of_date - timedelta(days=28)
        
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.include_in_training_load == True,
                Activity.start_date >= start_date,
                Activity.start_date <= as_of_date,
            )
            .all()
        )
        
        total = sum(a.trimp_score or 0 for a in activities)
        return total / 4  # Average per week
    
    def calculate_ctl_atl_tsb(self, user: User, as_of_date: date = None) -> tuple:
        """
        Calculate Chronic Training Load (CTL), Acute Training Load (ATL), 
        and Training Stress Balance (TSB).
        
        Uses exponential weighted moving averages:
        - CTL: 42-day time constant (Fitness)
        - ATL: 7-day time constant (Fatigue)
        - TSB = CTL - ATL (Form)
        """
        as_of_date = as_of_date or date.today()
        
        # Get last 60 days of activities for accurate calculation
        start_date = as_of_date - timedelta(days=60)
        
        # Initialize with reasonable defaults
        ctl = 0.0
        atl = 0.0
        
        # Calculate day by day from start
        current_date = start_date
        while current_date <= as_of_date:
            daily_trimp = self.get_daily_trimp(user, current_date)
            
            # Exponential decay
            ctl = ctl + (daily_trimp - ctl) / 42
            atl = atl + (daily_trimp - atl) / 7
            
            current_date += timedelta(days=1)
        
        tsb = ctl - atl
        
        return round(ctl, 1), round(atl, 1), round(tsb, 1)
    
    def get_current_metrics(self, user: User) -> TrainingMetrics:
        """Get all current training metrics."""
        today = date.today()
        
        acute = self.calculate_acute_load(user)
        chronic = self.calculate_chronic_load(user)
        acwr = acute / chronic if chronic > 0 else 1.0
        
        ctl, atl, tsb = self.calculate_ctl_atl_tsb(user)
        
        # Determine training zone
        if acwr < 0.8:
            zone = "detraining"
        elif acwr <= 1.3:
            zone = "optimal"
        elif acwr <= 1.5:
            zone = "overreaching"
        else:
            zone = "danger"
        
        return TrainingMetrics(
            date=today,
            acute_load=round(acute, 1),
            chronic_load=round(chronic, 1),
            acwr=round(acwr, 2),
            ctl=ctl,
            atl=atl,
            tsb=tsb,
            training_zone=zone,
        )
    
    def get_fitness_history(self, user: User, days: int = 90) -> FitnessHistory:
        """Get historical CTL/ATL/TSB data for charting."""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        dates = []
        ctl_values = []
        atl_values = []
        tsb_values = []
        
        # Calculate for each day in range
        current_date = start_date
        while current_date <= end_date:
            ctl, atl, tsb = self.calculate_ctl_atl_tsb(user, current_date)
            
            dates.append(current_date)
            ctl_values.append(ctl)
            atl_values.append(atl)
            tsb_values.append(tsb)
            
            current_date += timedelta(days=1)
        
        return FitnessHistory(
            dates=dates,
            ctl_values=ctl_values,
            atl_values=atl_values,
            tsb_values=tsb_values,
        )
