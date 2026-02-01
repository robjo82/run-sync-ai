"""Athlete Profile Service - Builds comprehensive athlete profiles for coaching."""

import json
from datetime import date, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import User, Activity, DailyCheckin, RaceGoal
from app.services.metrics_service import MetricsService


class AthleteProfileService:
    """
    Service for building comprehensive athlete profiles from available data.
    
    Aggregates:
    - Strava best efforts (personal records)
    - Recent training summary (last 30/90 days)
    - Current fitness metrics (CTL, ATL, TSB, ACWR)
    - Training patterns (preferred days, average volume)
    - Goal analysis (realism based on records)
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.metrics_service = MetricsService(db)
    
    def build_complete_profile(
        self, 
        user: User, 
        goal: Optional[RaceGoal] = None,
        days_history: int = 90
    ) -> Dict[str, Any]:
        """
        Build a complete athlete profile for coaching context.
        
        Returns a dictionary with all relevant athlete data for personalized coaching.
        """
        profile = {
            "personal_records": self._get_personal_records(user),
            "recent_training": self._get_training_summary(user, days_history),
            "current_fitness": self._get_fitness_metrics(user),
            "training_patterns": self._get_training_patterns(user, days=30),
            "recent_checkins": self._get_recent_checkins(user, limit=5),
        }
        
        if goal:
            profile["goal_analysis"] = self._analyze_goal(goal, profile["personal_records"])
        
        return profile
    
    def _get_personal_records(self, user: User) -> Dict[str, Any]:
        """Extract personal records from Strava best efforts."""
        # Get most recent activities with best efforts
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.best_efforts.isnot(None)
            )
            .order_by(Activity.start_date.desc())
            .limit(100)
            .all()
        )
        
        # Aggregate best times per distance
        records = {}
        for activity in activities:
            if not activity.best_efforts:
                continue
            
            try:
                best_efforts = json.loads(activity.best_efforts) if isinstance(
                    activity.best_efforts, str
                ) else activity.best_efforts
                
                for effort in best_efforts:
                    distance_name = effort.get("name", "")
                    elapsed_time = effort.get("elapsed_time", 0)
                    
                    if not distance_name or not elapsed_time:
                        continue
                    
                    # Keep the best (fastest) time
                    if distance_name not in records or elapsed_time < records[distance_name]["time_seconds"]:
                        records[distance_name] = {
                            "time_seconds": elapsed_time,
                            "time_formatted": self._format_time(elapsed_time),
                            "date": activity.start_date.isoformat() if activity.start_date else None,
                            "pace_per_km": self._calculate_pace(distance_name, elapsed_time)
                        }
            except (json.JSONDecodeError, TypeError):
                continue
        
        return records
    
    def _get_training_summary(self, user: User, days: int = 90) -> Dict[str, Any]:
        """Get summary of recent training."""
        cutoff_date = date.today() - timedelta(days=days)
        
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.start_date >= cutoff_date,
                Activity.activity_type.in_(["Run", "run", "VirtualRun"])
            )
            .all()
        )
        
        if not activities:
            return {
                "period_days": days,
                "total_runs": 0,
                "total_distance_km": 0,
                "total_duration_hours": 0,
                "avg_runs_per_week": 0,
                "avg_distance_per_run_km": 0,
                "longest_run_km": 0,
            }
        
        total_distance = sum(a.distance or 0 for a in activities) / 1000  # meters to km
        total_duration = sum(a.moving_time or 0 for a in activities) / 3600  # seconds to hours
        max_distance = max(a.distance or 0 for a in activities) / 1000
        
        weeks = days / 7
        
        return {
            "period_days": days,
            "total_runs": len(activities),
            "total_distance_km": round(total_distance, 1),
            "total_duration_hours": round(total_duration, 1),
            "avg_runs_per_week": round(len(activities) / weeks, 1),
            "avg_distance_per_run_km": round(total_distance / len(activities), 1) if activities else 0,
            "longest_run_km": round(max_distance, 1),
            "avg_pace_per_km": self._format_time(int(total_duration * 3600 / total_distance)) if total_distance > 0 else None,
        }
    
    def _get_fitness_metrics(self, user: User) -> Dict[str, Any]:
        """Get current fitness metrics (CTL, ATL, TSB, ACWR)."""
        try:
            metrics = self.metrics_service.get_current_metrics(user)
            return {
                "CTL": round(metrics.ctl if hasattr(metrics, 'ctl') else 0, 1),  # Chronic Training Load (fitness)
                "ATL": round(metrics.atl if hasattr(metrics, 'atl') else 0, 1),  # Acute Training Load (fatigue)
                "TSB": round(metrics.tsb if hasattr(metrics, 'tsb') else 0, 1),  # Training Stress Balance (form)
                "ACWR": round(metrics.acwr if hasattr(metrics, 'acwr') else 1.0, 2),  # Acute:Chronic Workload Ratio
                "interpretation": self._interpret_metrics({
                    "ctl": metrics.ctl if hasattr(metrics, 'ctl') else 0,
                    "atl": metrics.atl if hasattr(metrics, 'atl') else 0,
                    "tsb": metrics.tsb if hasattr(metrics, 'tsb') else 0,
                    "acwr": metrics.acwr if hasattr(metrics, 'acwr') else 1.0,
                }),
            }
        except Exception:
            return {
                "CTL": 0,
                "ATL": 0, 
                "TSB": 0,
                "ACWR": 1.0,
                "interpretation": "Données insuffisantes pour calculer les métriques.",
            }
    
    def _get_training_patterns(self, user: User, days: int = 30) -> Dict[str, Any]:
        """Analyze training patterns from recent activities."""
        cutoff_date = date.today() - timedelta(days=days)
        
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.start_date >= cutoff_date,
                Activity.activity_type.in_(["Run", "run", "VirtualRun"])
            )
            .all()
        )
        
        if not activities:
            return {"preferred_days": [], "typical_time_of_day": None}
        
        # Count activities by day of week
        day_counts = {}
        time_slots = {"morning": 0, "afternoon": 0, "evening": 0}
        
        for activity in activities:
            if activity.start_date:
                day_name = activity.start_date.strftime("%A")
                day_counts[day_name] = day_counts.get(day_name, 0) + 1
                
                hour = activity.start_date.hour
                if 5 <= hour < 12:
                    time_slots["morning"] += 1
                elif 12 <= hour < 18:
                    time_slots["afternoon"] += 1
                else:
                    time_slots["evening"] += 1
        
        # Sort days by frequency
        preferred_days = sorted(day_counts.items(), key=lambda x: x[1], reverse=True)
        preferred_time = max(time_slots.items(), key=lambda x: x[1])[0] if any(time_slots.values()) else None
        
        return {
            "preferred_days": [{"day": d, "count": c} for d, c in preferred_days[:4]],
            "typical_time_of_day": preferred_time,
            "days_with_runs": len(day_counts),
        }
    
    def _get_recent_checkins(self, user: User, limit: int = 5) -> List[Dict[str, Any]]:
        """Get recent daily check-ins for subjective feedback."""
        checkins = (
            self.db.query(DailyCheckin)
            .filter(DailyCheckin.user_id == user.id)
            .order_by(DailyCheckin.date.desc())
            .limit(limit)
            .all()
        )
        
        return [
            {
                "date": c.date.isoformat() if c.date else None,
                "energy": c.energy_level,
                "soreness": c.soreness_level,
                "mood": c.mood,
                "sleep_quality": c.sleep_quality,
                "rpe": c.rpe,
                "notes": c.notes[:100] if c.notes else None,
            }
            for c in checkins
        ]
    
    def _analyze_goal(self, goal: RaceGoal, records: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze goal realism based on athlete's records."""
        analysis = {
            "race_type": goal.race_type,
            "target_time_seconds": goal.target_time_seconds,
            "target_time_formatted": self._format_time(goal.target_time_seconds) if goal.target_time_seconds else None,
            "weeks_until_race": goal.weeks_until_race,
            "estimated_paces": {},
        }
        
        # Map race types to distances
        race_distances_km = {
            "5k": 5, "10k": 10, "half": 21.1, 
            "marathon": 42.195, "ultra": 50
        }
        
        distance_km = race_distances_km.get(goal.race_type, 10)
        
        if goal.target_time_seconds:
            # Calculate target pace
            target_pace = goal.target_time_seconds / distance_km
            analysis["target_pace_per_km"] = self._format_time(int(target_pace))
            
            # Estimate training paces based on target
            analysis["estimated_paces"] = {
                "easy": self._format_time(int(target_pace * 1.25)),  # ~25% slower
                "tempo": self._format_time(int(target_pace * 0.95)),  # ~5% faster
                "interval": self._format_time(int(target_pace * 0.85)),  # ~15% faster
                "marathon": self._format_time(int(target_pace)),
            }
        
        # Check if goal is realistic based on records
        if records:
            # Get relevant record for comparison
            reference_records = ["5K", "10K", "5km", "10km", "Half-Marathon"]
            for ref in reference_records:
                if ref in records:
                    analysis["reference_record"] = {
                        "distance": ref,
                        "time": records[ref]["time_formatted"],
                        "pace": records[ref].get("pace_per_km"),
                    }
                    break
        
        return analysis
    
    def _format_time(self, seconds: int) -> str:
        """Format seconds to HH:MM:SS or MM:SS."""
        if not seconds:
            return "N/A"
        
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        
        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"
    
    def _calculate_pace(self, distance_name: str, elapsed_time: int) -> Optional[str]:
        """Calculate pace per km for known distances."""
        distance_map = {
            "400m": 0.4, "1/2 mile": 0.805, "1K": 1, "1 mile": 1.609,
            "2 mile": 3.219, "5K": 5, "10K": 10, "15K": 15,
            "10 mile": 16.09, "Half-Marathon": 21.1, "Marathon": 42.195,
        }
        
        distance_km = distance_map.get(distance_name)
        if not distance_km or not elapsed_time:
            return None
        
        pace_seconds = elapsed_time / distance_km
        return self._format_time(int(pace_seconds))
    
    def _interpret_metrics(self, metrics: Dict[str, Any]) -> str:
        """Generate human-readable interpretation of fitness metrics."""
        tsb = metrics.get("tsb", 0)
        acwr = metrics.get("acwr", 1.0)
        ctl = metrics.get("ctl", 0)
        
        interpretations = []
        
        # TSB interpretation
        if tsb > 10:
            interpretations.append("Forme excellente, prêt pour une course ou séance intense.")
        elif tsb > 0:
            interpretations.append("Bonne forme, récupération suffisante.")
        elif tsb > -10:
            interpretations.append("Légère fatigue accumulée, surveiller la récupération.")
        else:
            interpretations.append("Fatigue importante, envisager un jour de repos.")
        
        # ACWR interpretation  
        if acwr < 0.8:
            interpretations.append("Charge d'entraînement en baisse, possibilité d'augmenter progressivement.")
        elif acwr <= 1.3:
            interpretations.append("Charge optimale, continuer ainsi.")
        else:
            interpretations.append("Attention à la surcharge, risque de blessure accru.")
        
        # CTL interpretation
        if ctl < 20:
            interpretations.append(f"Niveau de fitness faible (CTL={ctl:.0f}), construction nécessaire.")
        elif ctl < 40:
            interpretations.append(f"Fitness modérée (CTL={ctl:.0f}), bon point de départ.")
        else:
            interpretations.append(f"Bonne base de fitness (CTL={ctl:.0f}).")
        
        return " ".join(interpretations)
    
    def get_profile_summary_for_prompt(
        self, 
        user: User, 
        goal: Optional[RaceGoal] = None
    ) -> str:
        """
        Get a formatted string summary suitable for LLM prompts.
        
        This is a condensed version optimized for context windows.
        """
        profile = self.build_complete_profile(user, goal)
        
        lines = ["## Profil Athlète"]
        
        # Personal records
        if profile["personal_records"]:
            records_str = ", ".join([
                f"{k}: {v['time_formatted']}"
                for k, v in list(profile["personal_records"].items())[:5]
            ])
            lines.append(f"**Records:** {records_str}")
        
        # Training summary
        ts = profile["recent_training"]
        if ts["total_runs"] > 0:
            lines.append(
                f"**Derniers {ts['period_days']}j:** {ts['total_runs']} sorties, "
                f"{ts['total_distance_km']}km, {ts['avg_runs_per_week']}/sem, "
                f"max {ts['longest_run_km']}km"
            )
        
        # Fitness
        fm = profile["current_fitness"]
        lines.append(
            f"**Fitness:** CTL={fm['CTL']}, ATL={fm['ATL']}, TSB={fm['TSB']}, ACWR={fm['ACWR']}"
        )
        lines.append(f"*{fm['interpretation']}*")
        
        # Patterns
        patterns = profile["training_patterns"]
        if patterns.get("preferred_days"):
            days = ", ".join([d["day"] for d in patterns["preferred_days"][:3]])
            lines.append(f"**Jours préférés:** {days} ({patterns.get('typical_time_of_day', 'variable')})")
        
        # Goal analysis
        if "goal_analysis" in profile:
            ga = profile["goal_analysis"]
            if ga.get("target_time_formatted"):
                lines.append(f"**Objectif:** {ga['race_type']} en {ga['target_time_formatted']}")
                if ga.get("estimated_paces"):
                    paces = ga["estimated_paces"]
                    lines.append(
                        f"**Allures estimées:** Easy={paces.get('easy')}, "
                        f"Tempo={paces.get('tempo')}, Marathon={paces.get('marathon')}"
                    )
        
        # Recent checkins
        checkins = profile.get("recent_checkins", [])
        if checkins:
            latest = checkins[0]
            lines.append(
                f"**Check-in récent ({latest.get('date', 'N/A')}):** "
                f"Énergie={latest.get('energy', '?')}/5, Humeur={latest.get('mood', '?')}/5"
            )
        
        return "\n".join(lines)
