"""Training metrics calculation service - TRIMP, ACWR, CTL/ATL/TSB."""

from sqlalchemy.orm import Session
from datetime import date, timedelta, datetime
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
    
    
    def calculate_rolling_metrics(self, user: User, start_date: date, end_date: date) -> dict:
        """
        Efficiently calculate rolling metrics (CTL, ATL, TSB) for a date range
        in a single pass with O(1) DB queries.
        
        Returns a dict mapping date -> {ctl, atl, tsb}
        """
        # Fetch ALL activities needed for calculation (including initialization period)
        # We need 180 days prior to start_date to stabilize CTL
        init_start_date = start_date - timedelta(days=180)
        
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.include_in_training_load == True,
                Activity.start_date >= init_start_date,
                Activity.start_date <= end_date,
            )
            .all()
        )
        
        # Map activities to dates for fast lookup
        daily_stress = {}
        for activity in activities:
            d = activity.start_date.date() if isinstance(activity.start_date, datetime) else activity.start_date
            daily_stress[d] = daily_stress.get(d, 0) + (activity.trimp_score or 0)
            
        # Initialize metrics
        ctl = 0.0
        atl = 0.0
        
        results = {}
        
        # Iterate through every single day to calculate rolling averages
        # (EMA must be calculated sequentially day-by-day)
        curr = init_start_date
        while curr <= end_date:
            trimp = daily_stress.get(curr, 0)
            
            # Coggan's formula: EMA_today = EMA_yesterday + (Val_today - EMA_yesterday) / Time_Constant
            ctl = ctl + (trimp - ctl) / 42.0
            atl = atl + (trimp - atl) / 7.0
            tsb = ctl - atl
            
            # Store only requested range
            if curr >= start_date:
                results[curr] = {
                    "ctl": round(ctl, 1),
                    "atl": round(atl, 1),
                    "tsb": round(tsb, 1)
                }
            
            curr += timedelta(days=1)
            
        return results

    def get_current_metrics(self, user: User) -> TrainingMetrics:
        """Get all current training metrics with safe ACWR."""
        today = date.today()
        
        # Use the rolling calculator for consistency and speed (only need last day)
        metrics_map = self.calculate_rolling_metrics(user, today, today)
        current = metrics_map.get(today, {"ctl": 0, "atl": 0, "tsb": 0})
        
        auth_ctl = current["ctl"]
        auth_atl = current["atl"]
        
        # Calculate ACWR (Acute:Chronic Workload Ratio)
        # ACWR = ATL / CTL
        # SCIENTIFIC SAFEGUARD: Handle low chronic load to avoid mathematical explosions.
        # If an athlete is returning from break, CTL can be ~0. 
        # Making a single run result in ACWR 20.0 is statistically correct but practically useless alarmism.
        # We enforce a 'floor' on CTL representing a minimal active lifestyle (~10 TSS/day).
        
        min_chronic_floor = 10.0
        effective_chronic = max(auth_ctl, min_chronic_floor)
        
        acwr = auth_atl / effective_chronic
        
        # Refined Zones based on Gabbett et al. (Optimal: 0.8 - 1.3)
        # We add tolerance for "Form Building" if absolute load is low
        if acwr < 0.8:
            zone = "detraining"
        elif acwr <= 1.3:
            zone = "optimal"
        elif acwr <= 1.5:
            # If absolute acute load is low (< 30), high ACWR is just "getting moving", not dangerous overload
            if auth_atl < 30:
                zone = "optimal" # Override for low volume
            else:
                zone = "overreaching"
        else:
            # Dangerous spikes
            if auth_atl < 40:
                zone = "caution" # Lower alert for low volume spikes
            else:
                zone = "danger"
        
        return TrainingMetrics(
            date=today,
            acute_load=round(auth_atl, 1),
            chronic_load=round(auth_ctl, 1),
            acwr=round(acwr, 2),
            ctl=auth_ctl,
            atl=auth_atl,
            tsb=current["tsb"],
            training_zone=zone,
        )
    
    def get_fitness_history(self, user: User, days: int = 90) -> FitnessHistory:
        """Get historical CTL/ATL/TSB data for charting."""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        metrics_map = self.calculate_rolling_metrics(user, start_date, end_date)
        
        dates = []
        ctl_values = []
        atl_values = []
        tsb_values = []
        
        # Sort by date
        sorted_dates = sorted(metrics_map.keys())
        
        for d in sorted_dates:
            data = metrics_map[d]
            dates.append(d)
            ctl_values.append(data["ctl"])
            atl_values.append(data["atl"])
            tsb_values.append(data["tsb"])
            
        return FitnessHistory(
            dates=dates,
            ctl_values=ctl_values,
            atl_values=atl_values,
            tsb_values=tsb_values,
        )
