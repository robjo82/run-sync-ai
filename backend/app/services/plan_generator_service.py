"""AI-powered training plan generator service with activity-aware planning."""

import json
from datetime import date, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import User, RaceGoal, PlannedSession, Activity
from app.services.llm_service import LLMService
from app.services.metrics_service import MetricsService


class PlanGeneratorService:
    """Service for generating training plans using AI with activity-aware context."""
    
    RACE_DISTANCES = {
        "5k": 5,
        "10k": 10,
        "half": 21.1,
        "marathon": 42.2,
        "ultra": 50,
        "trail": 30,
    }
    
    # VDOT-based pace zones (relative to race pace)
    # Based on Jack Daniels' Running Formula
    PACE_ZONES = {
        "easy": 1.25,      # 25% slower than race pace
        "long": 1.20,      # 20% slower
        "tempo": 1.08,     # 8% slower (threshold)
        "interval": 0.95,  # 5% faster (VO2max)
        "recovery": 1.35,  # 35% slower
    }
    
    SESSION_TYPES = [
        "easy",        # Easy/recovery run
        "long",        # Long run
        "tempo",       # Tempo/threshold run
        "interval",    # Interval/speed work
        "recovery",    # Active recovery
        "rest",        # Rest day
        "cross",       # Cross-training
    ]
    
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService()
        self.metrics_service = MetricsService(db)
    
    def _get_user_activity_profile(self, user: User, days: int = 90) -> Dict[str, Any]:
        """Build a profile of the user's recent training history."""
        since = date.today() - timedelta(days=days)
        
        activities = (
            self.db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.start_date >= since,
                Activity.activity_type.in_(["Run", "Trail Run", "Track"])
            )
            .all()
        )
        
        if not activities:
            return {
                "has_history": False,
                "weekly_volume_km": 0,
                "weekly_hours": 0,
                "runs_per_week": 0,
                "longest_run_km": 0,
                "avg_pace_per_km": None,
                "recent_activities": [],
            }
        
        # Calculate stats
        total_distance = sum(a.distance for a in activities)
        total_time = sum(a.moving_time for a in activities)
        weeks = max(1, days / 7)
        
        # Find longest run
        longest_run = max(activities, key=lambda a: a.distance)
        
        # Calculate average pace (seconds per km)
        avg_pace = None
        paced_activities = [a for a in activities if a.distance > 0 and a.moving_time > 0]
        if paced_activities:
            total_pace_weighted = sum((a.moving_time / (a.distance / 1000)) * a.distance for a in paced_activities)
            total_weight = sum(a.distance for a in paced_activities)
            avg_pace = int(total_pace_weighted / total_weight) if total_weight > 0 else None
        
        # Get recent activity summaries for LLM context
        recent = sorted(activities, key=lambda a: a.start_date, reverse=True)[:10]
        recent_summaries = [
            {
                "date": a.start_date.isoformat() if a.start_date else None,
                "type": a.activity_type,
                "distance_km": round(a.distance / 1000, 1),
                "duration_min": round(a.moving_time / 60, 0),
                "pace_per_km": self._format_pace(int(a.moving_time / (a.distance / 1000))) if a.distance > 0 else None,
                "elevation": a.total_elevation_gain,
            }
            for a in recent
        ]
        
        return {
            "has_history": True,
            "total_activities": len(activities),
            "period_days": days,
            "weekly_volume_km": round(total_distance / 1000 / weeks, 1),
            "weekly_hours": round(total_time / 3600 / weeks, 1),
            "runs_per_week": round(len(activities) / weeks, 1),
            "longest_run_km": round(longest_run.distance / 1000, 1),
            "longest_run_date": longest_run.start_date.isoformat() if longest_run.start_date else None,
            "avg_pace_per_km": avg_pace,
            "avg_pace_formatted": self._format_pace(avg_pace) if avg_pace else None,
            "recent_activities": recent_summaries,
        }
    
    def _calculate_target_paces(self, goal: RaceGoal) -> Dict[str, int]:
        """Calculate target paces for different session types based on goal time."""
        if not goal.target_time_seconds:
            # Default paces if no target time (5:30/km base)
            base_pace = 330  # seconds per km
        else:
            distance = self.RACE_DISTANCES.get(goal.race_type, goal.distance_km or 10)
            base_pace = int(goal.target_time_seconds / distance)  # Race pace
        
        return {
            session_type: int(base_pace * multiplier)
            for session_type, multiplier in self.PACE_ZONES.items()
        }
    
    def _format_pace(self, seconds_per_km: int) -> str:
        """Format pace as MM:SS/km."""
        if not seconds_per_km:
            return "N/A"
        minutes = seconds_per_km // 60
        seconds = seconds_per_km % 60
        return f"{minutes}:{seconds:02d}/km"
    
    async def generate_plan(
        self, goal: RaceGoal, user: User
    ) -> Tuple[List[PlannedSession], str]:
        """
        Generate a periodized training plan for a race goal.
        
        Returns:
            Tuple of (sessions, plan_explanation)
        """
        weeks_until_race = goal.weeks_until_race
        
        if weeks_until_race < 4:
            raise ValueError("Minimum 4 weeks needed to generate a training plan")
        
        # Get current fitness metrics
        current_metrics = self.metrics_service.get_current_metrics(user)
        
        # Get user's activity history profile
        activity_profile = self._get_user_activity_profile(user, days=90)
        
        # Calculate target paces
        target_paces = self._calculate_target_paces(goal)
        
        # Parse available days (1-7, Monday to Sunday)
        available_days = [int(d) for d in goal.available_days.split(",") if d.strip()]
        
        # Build comprehensive context for LLM
        context = {
            # Race details
            "race_name": goal.name,
            "race_type": goal.race_type,
            "race_distance_km": self.RACE_DISTANCES.get(goal.race_type, goal.distance_km or 10),
            "race_date": goal.race_date.isoformat(),
            "weeks_until_race": weeks_until_race,
            "target_time": goal.target_time_formatted,
            "target_time_seconds": goal.target_time_seconds,
            
            # Current fitness
            "current_ctl": current_metrics.ctl if current_metrics else 0,
            "current_atl": current_metrics.atl if current_metrics else 0,
            "current_tsb": current_metrics.tsb if current_metrics else 0,
            "training_zone": current_metrics.training_zone if current_metrics else "unknown",
            
            # Training constraints
            "available_days": available_days,
            "available_days_names": [
                ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][d-1]
                for d in available_days
            ],
            "long_run_day": goal.long_run_day,
            "long_run_day_name": ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][goal.long_run_day-1],
            "max_weekly_hours": goal.max_weekly_hours,
            
            # Target paces
            "target_paces": {k: self._format_pace(v) for k, v in target_paces.items()},
            "target_paces_seconds": target_paces,
            
            # Activity history
            "activity_profile": activity_profile,
            
            # User notes
            "user_notes": goal.notes,
        }
        
        # Generate plan using LLM (with fallback)
        plan_result = await self._generate_plan_with_explanation(context)
        plan_structure = plan_result.get("weeks", [])
        explanation = plan_result.get("explanation", self._generate_fallback_explanation(context))
        
        # If LLM failed, use fallback
        if not plan_structure:
            plan_structure = self._generate_fallback_plan(context, target_paces)
        
        # Create PlannedSession objects
        sessions = self._create_sessions(goal, user, plan_structure, target_paces)
        
        return sessions, explanation
    
    async def _generate_plan_with_explanation(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Call LLM to generate the training plan with explanation."""
        try:
            prompt = self.llm_service.provider.load_prompt("generate_plan")
            prompt = prompt.replace("{context_json}", json.dumps(context, indent=2, default=str, ensure_ascii=False))
        except:
            # Use inline prompt if file not found
            prompt = self._get_inline_prompt(context)
        
        try:
            result = await self.llm_service.provider.complete_json(
                prompt, 
                model="pro",
                temperature=0.3
            )
            return result
        except Exception as e:
            # Return empty for fallback
            return {"weeks": [], "explanation": None}
    
    def _get_inline_prompt(self, context: Dict[str, Any]) -> str:
        """Generate inline prompt for plan generation."""
        return f"""Tu es un coach de course à pied expert. Génère un plan d'entraînement personnalisé.

## Contexte de l'athlète

{json.dumps(context, indent=2, default=str, ensure_ascii=False)}

## Instructions

Génère un plan d'entraînement structuré en JSON avec:
1. Une explication détaillée du plan (philosophie, phases, progression)
2. Les séances pour chaque semaine avec détails précis

## Format de sortie JSON

```json
{{
  "explanation": "Explication complète du plan: philosophie d'entraînement, découpage en phases (base, build, peak, taper), justification des choix de séances, conseils personnalisés basés sur l'historique...",
  "weeks": [
    {{
      "week_number": 1,
      "phase": "base",
      "focus": "Construction aérobie",
      "sessions": [
        {{
          "day": 1,
          "session_type": "easy",
          "duration_minutes": 45,
          "intensity": "easy",
          "pace_per_km": 360,
          "terrain_type": "road",
          "elevation_gain": 0,
          "intervals": null,
          "workout_details": "Footing à allure confortable, respiration aisée, capable de tenir une conversation."
        }},
        {{
          "day": 3,
          "session_type": "interval",
          "duration_minutes": 50,
          "intensity": "hard",
          "pace_per_km": null,
          "terrain_type": "track",
          "elevation_gain": 0,
          "intervals": [
            {{"reps": 6, "distance_m": 1000, "pace_per_km": 255, "recovery_seconds": 90}}
          ],
          "workout_details": "Échauffement 15min, puis 6x1000m à 4:15/km avec 90s récup trot, retour calme 10min."
        }}
      ]
    }}
  ]
}}
```

Génère le plan complet."""
    
    def _generate_fallback_explanation(self, context: Dict[str, Any]) -> str:
        """Generate a default coach explanation."""
        weeks = context["weeks_until_race"]
        race = context["race_name"]
        profile = context.get("activity_profile", {})
        
        has_history = profile.get("has_history", False)
        weekly_km = profile.get("weekly_volume_km", 0)
        
        explanation = f"""## Philosophie du plan pour {race}

Ce plan de {weeks} semaines est conçu pour vous préparer de manière progressive et sécuritaire.

### Votre profil actuel
"""
        if has_history:
            explanation += f"""
Basé sur vos 90 derniers jours d'entraînement:
- Volume hebdomadaire moyen: **{weekly_km} km/semaine**
- Course la plus longue: **{profile.get('longest_run_km', 0)} km**
- Allure moyenne: **{profile.get('avg_pace_formatted', 'N/A')}**

Le plan prend en compte votre charge actuelle pour éviter les blessures.
"""
        else:
            explanation += """
Pas d'historique d'activité détecté. Le plan commence avec un volume conservateur 
et augmente progressivement. N'hésitez pas à ajuster si les séances sont trop difficiles.
"""
        
        explanation += f"""
### Structure du plan

1. **Phase de base** (semaines 1-{max(1, weeks//3)}): Construction de l'endurance fondamentale
2. **Phase de développement** (semaines {weeks//3 + 1}-{2*weeks//3}): Travail spécifique à l'allure cible
3. **Phase d'affûtage** (dernières 2 semaines): Réduction du volume, maintien de l'intensité

### Allures cibles

| Type de séance | Allure |
|----------------|--------|
| Récupération | {context['target_paces'].get('recovery', 'N/A')} |
| Endurance facile | {context['target_paces'].get('easy', 'N/A')} |
| Sortie longue | {context['target_paces'].get('long', 'N/A')} |
| Tempo/Seuil | {context['target_paces'].get('tempo', 'N/A')} |
| Fractionné | {context['target_paces'].get('interval', 'N/A')} |

### Conseils

- Écoutez votre corps: si vous êtes très fatigué, privilégiez la récupération
- Hydratation et sommeil sont aussi importants que l'entraînement
- Les semaines de récupération (toutes les 4 semaines) sont essentielles
"""
        return explanation
    
    def _generate_fallback_plan(
        self, context: Dict[str, Any], target_paces: Dict[str, int]
    ) -> List[Dict[str, Any]]:
        """Generate a detailed rule-based plan as fallback."""
        weeks = []
        weeks_until_race = context["weeks_until_race"]
        available_days = context["available_days"]
        long_run_day = context["long_run_day"]
        profile = context.get("activity_profile", {})
        
        # Base weekly volume on history or conservative default
        base_weekly_km = profile.get("weekly_volume_km", 20) if profile.get("has_history") else 20
        
        # Determine training phases
        taper_weeks = min(2, weeks_until_race // 6)
        peak_weeks = min(2, (weeks_until_race - taper_weeks) // 4)
        build_weeks = weeks_until_race - taper_weeks - peak_weeks
        
        for week_num in range(1, weeks_until_race + 1):
            week_sessions = []
            
            # Determine phase
            if week_num > build_weeks + peak_weeks:
                phase = "taper"
                volume_mult = 0.5 + (0.2 * (weeks_until_race - week_num))
            elif week_num > build_weeks:
                phase = "peak"
                volume_mult = 1.0
            else:
                phase = "build"
                # Progressive build with recovery weeks every 4th week
                if week_num % 4 == 0:
                    volume_mult = 0.7  # Recovery week
                else:
                    volume_mult = 0.7 + (0.3 * week_num / build_weeks)
            
            for day in available_days:
                session_data = self._create_session_for_day(
                    day, long_run_day, week_num, phase, volume_mult, target_paces
                )
                if session_data:
                    week_sessions.append(session_data)
            
            weeks.append({
                "week_number": week_num,
                "phase": phase,
                "focus": self._get_phase_focus(phase),
                "sessions": week_sessions,
            })
        
        return weeks
    
    def _create_session_for_day(
        self, day: int, long_run_day: int, week_num: int, 
        phase: str, volume_mult: float, target_paces: Dict[str, int]
    ) -> Dict[str, Any]:
        """Create a detailed session for a specific day."""
        
        if day == long_run_day:
            duration = int(90 * volume_mult)
            return {
                "day": day,
                "session_type": "long",
                "duration_minutes": duration,
                "intensity": "moderate",
                "pace_per_km": target_paces.get("long"),
                "terrain_type": "road",
                "elevation_gain": 0,
                "intervals": None,
                "workout_details": f"Sortie longue de {duration} minutes à allure confortable. "
                                   f"Objectif: {self._format_pace(target_paces.get('long'))}. "
                                   f"Prenez de l'eau et éventuellement un gel si > 75min.",
            }
        
        # Day before long run = easy/recovery
        if (day == long_run_day - 1) or (day == 7 and long_run_day == 1):
            duration = int(35 * volume_mult)
            return {
                "day": day,
                "session_type": "recovery",
                "duration_minutes": duration,
                "intensity": "easy",
                "pace_per_km": target_paces.get("recovery"),
                "terrain_type": "road",
                "elevation_gain": 0,
                "intervals": None,
                "workout_details": f"Récupération active de {duration} minutes. "
                                   f"Allure très facile: {self._format_pace(target_paces.get('recovery'))}. "
                                   f"Prépare les jambes pour la sortie longue.",
            }
        
        # Tempo or interval based on week and phase
        if phase in ["build", "peak"] and day in [2, 3, 4]:
            if week_num % 2 == 0:
                # Tempo session
                duration = int(50 * volume_mult)
                tempo_duration = duration - 20
                return {
                    "day": day,
                    "session_type": "tempo",
                    "duration_minutes": duration,
                    "intensity": "hard",
                    "pace_per_km": target_paces.get("tempo"),
                    "terrain_type": "road",
                    "elevation_gain": 0,
                    "intervals": None,
                    "workout_details": f"Échauffement 10min, puis {tempo_duration}min à allure seuil "
                                       f"({self._format_pace(target_paces.get('tempo'))}), "
                                       f"puis 10min de retour calme. Effort soutenu mais contrôlé.",
                }
            else:
                # Interval session
                duration = int(50 * volume_mult)
                interval_pace = target_paces.get("interval", 300)
                return {
                    "day": day,
                    "session_type": "interval",
                    "duration_minutes": duration,
                    "intensity": "hard",
                    "pace_per_km": None,  # Variable for intervals
                    "terrain_type": "track",
                    "elevation_gain": 0,
                    "intervals": [
                        {"reps": 6, "distance_m": 1000, "pace_per_km": interval_pace, "recovery_seconds": 90}
                    ],
                    "workout_details": f"Échauffement 15min, puis 6x1000m à "
                                       f"{self._format_pace(interval_pace)} avec 90s récup trot, "
                                       f"retour calme 10min. Travail de VO2max.",
                }
        
        # Default: easy run
        duration = int(45 * volume_mult)
        return {
            "day": day,
            "session_type": "easy",
            "duration_minutes": duration,
            "intensity": "easy",
            "pace_per_km": target_paces.get("easy"),
            "terrain_type": "road",
            "elevation_gain": 0,
            "intervals": None,
            "workout_details": f"Footing tranquille de {duration} minutes à "
                               f"{self._format_pace(target_paces.get('easy'))}. "
                               f"Respiration facile, capable de tenir une conversation.",
        }
    
    def _get_phase_focus(self, phase: str) -> str:
        """Get focus description for a training phase."""
        focuses = {
            "build": "Construction de l'endurance aérobie",
            "peak": "Travail spécifique et intensité maximale",
            "taper": "Récupération et fraîcheur pour le jour J",
        }
        return focuses.get(phase, "Entraînement général")
    
    def _create_sessions(
        self, 
        goal: RaceGoal, 
        user: User, 
        plan_structure: List[Dict[str, Any]],
        target_paces: Dict[str, int]
    ) -> List[PlannedSession]:
        """Create PlannedSession objects from the plan structure."""
        sessions = []
        today = date.today()
        
        # Calculate the Monday of the current week as plan start
        days_since_monday = today.weekday()
        plan_start = today - timedelta(days=days_since_monday)
        
        for week_data in plan_structure:
            week_num = week_data.get("week_number", 1)
            phase = week_data.get("phase", "build")
            
            for session_data in week_data.get("sessions", []):
                day = session_data.get("day", 1)
                session_date = plan_start + timedelta(weeks=week_num-1, days=day-1)
                
                # Skip past dates
                if session_date < today:
                    continue
                
                # Skip dates after race
                if session_date > goal.race_date:
                    continue
                
                session_type = session_data.get("session_type", "easy")
                duration = session_data.get("duration_minutes", 45)
                intensity = session_data.get("intensity", "easy")
                
                # Get detailed fields
                pace = session_data.get("pace_per_km") or target_paces.get(session_type)
                terrain = session_data.get("terrain_type", "road")
                elevation = session_data.get("elevation_gain", 0)
                intervals = session_data.get("intervals")
                workout_details = session_data.get("workout_details", "")
                
                # Generate title and description
                title = self._get_session_title(session_type, week_num, phase)
                description = session_data.get("description") or self._get_session_description(
                    session_type, duration, pace
                )
                
                session = PlannedSession(
                    user_id=user.id,
                    race_goal_id=goal.id,
                    scheduled_date=session_date,
                    week_number=week_num,
                    session_type=session_type,
                    title=title,
                    description=description,
                    target_duration=duration,
                    target_intensity=intensity,
                    target_pace_per_km=pace,
                    terrain_type=terrain,
                    elevation_gain=elevation,
                    intervals=intervals,
                    workout_details=workout_details,
                    status="planned",
                )
                
                self.db.add(session)
                sessions.append(session)
        
        self.db.commit()
        return sessions
    
    def _get_session_title(self, session_type: str, week_num: int, phase: str) -> str:
        """Generate a title for the session."""
        titles = {
            "easy": f"Footing tranquille - S{week_num}",
            "long": f"Sortie longue - S{week_num}",
            "tempo": f"Tempo/Allure seuil - S{week_num}",
            "interval": f"Fractionné - S{week_num}",
            "recovery": f"Récupération active - S{week_num}",
            "rest": f"Repos - S{week_num}",
            "cross": f"Cross-training - S{week_num}",
        }
        return titles.get(session_type, f"{session_type.title()} - S{week_num}")
    
    def _get_session_description(
        self, session_type: str, duration: int, pace: Optional[int] = None
    ) -> str:
        """Generate a default description for the session."""
        pace_str = self._format_pace(pace) if pace else "allure confortable"
        
        descriptions = {
            "easy": f"Course facile de {duration}min à {pace_str}. Respiration aisée.",
            "long": f"Sortie longue de {duration}min à {pace_str}. Restez hydraté.",
            "tempo": f"Échauffement 10min, {duration-20}min à {pace_str}, retour calme 10min.",
            "interval": f"15min échauffement + séries de fractionné + 10min retour calme.",
            "recovery": f"Footing très léger de {duration}min pour la récupération.",
            "rest": "Jour de repos complet. Étirements légers si souhaité.",
            "cross": f"{duration} minutes de vélo, natation ou autre activité sans impact.",
        }
        return descriptions.get(session_type, f"Entraînement de {duration} minutes.")
