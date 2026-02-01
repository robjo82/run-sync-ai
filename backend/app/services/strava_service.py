"""Strava API integration service."""

import httpx
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User, Activity
from app.services.llm_service import LLMService
from app.services.metrics_service import MetricsService


class StravaService:
    """Service for Strava API integration."""
    
    BASE_URL = "https://www.strava.com/api/v3"
    AUTH_URL = "https://www.strava.com/oauth/authorize"
    TOKEN_URL = "https://www.strava.com/oauth/token"
    
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
        self.llm_service = LLMService()
        self.metrics_service = MetricsService(db)
    
    def get_auth_url(self, redirect_uri: str) -> str:
        """Generate Strava OAuth authorization URL."""
        params = {
            "client_id": self.settings.strava_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "read,activity:read_all",
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.AUTH_URL}?{query}"
    
    async def exchange_code(self, code: str) -> Dict[str, Any]:
        """Exchange authorization code for tokens."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.settings.strava_client_id,
                    "client_secret": self.settings.strava_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            return response.json()
    
    async def refresh_token(self, user: User) -> Optional[str]:
        """Refresh access token if expired."""
        if not user.strava_refresh_token:
            return None
        
        # Check if token is still valid
        if user.strava_token_expires_at and user.strava_token_expires_at > datetime.utcnow():
            return user.strava_access_token
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.settings.strava_client_id,
                    "client_secret": self.settings.strava_client_secret,
                    "refresh_token": user.strava_refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            # Update user tokens
            user.strava_access_token = data["access_token"]
            user.strava_refresh_token = data["refresh_token"]
            user.strava_token_expires_at = datetime.fromtimestamp(data["expires_at"])
            self.db.commit()
            
            return user.strava_access_token
    
    async def get_activities(
        self,
        user: User,
        after: Optional[datetime] = None,
        before: Optional[datetime] = None,
        per_page: int = 200,
    ) -> List[Dict[str, Any]]:
        """Fetch all activities from Strava within the timeframe (paginated)."""
        access_token = await self.refresh_token(user)
        if not access_token:
            raise ValueError("Strava non connecté. Veuillez d'abord connecter votre compte Strava.")
        
        all_activities = []
        page = 1
        
        async with httpx.AsyncClient() as client:
            while True:
                params = {"per_page": per_page, "page": page}
                if after:
                    params["after"] = int(after.timestamp())
                if before:
                    params["before"] = int(before.timestamp())
                
                response = await client.get(
                    f"{self.BASE_URL}/athlete/activities",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params=params,
                )
                response.raise_for_status()
                page_data = response.json()
                
                if not page_data:
                    break
                
                all_activities.extend(page_data)
                
                if len(page_data) < per_page:
                    break
                
                page += 1
                
        return all_activities
    
    async def get_activity_streams(
        self,
        user: User,
        activity_id: str,
        stream_types: List[str] = None,
    ) -> Dict[str, Any]:
        """Fetch activity streams (time series data)."""
        access_token = await self.refresh_token(user)
        if not access_token:
            return {}
        
        stream_types = stream_types or ["heartrate", "velocity_smooth", "altitude", "cadence"]
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/activities/{activity_id}/streams",
                headers={"Authorization": f"Bearer {access_token}"},
                params={
                    "keys": ",".join(stream_types),
                    "key_by_type": True,
                },
            )
            
            if response.status_code == 404:
                return {}
            
            response.raise_for_status()
            return response.json()

    async def get_athlete_stats(self, user: User) -> Dict[str, Any]:
        """Fetch athlete statistics (totals, records) from Strava."""
        if not user.strava_athlete_id:
            return {}

        access_token = await self.refresh_token(user)
        if not access_token:
            return {}

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/athletes/{user.strava_athlete_id}/stats",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            
            if response.status_code != 200:
                print(f"Error fetching stats for user {user.id}: {response.text}")
                return {}

            return response.json()

    async def get_activity_detail(self, user: User, activity_id: str) -> Dict[str, Any]:
        """Fetch detailed activity data including best_efforts."""
        access_token = await self.refresh_token(user)
        if not access_token:
            return {}

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/activities/{activity_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            
            if response.status_code != 200:
                return {}

            return response.json()
    
    async def sync_activities(
        self,
        user: User,
        days: int = 365,
    ) -> Dict[str, Any]:
        """
        Sync activities from Strava, classify them, and calculate metrics.
        
        Returns summary of synced activities.
        """
        after = datetime.utcnow() - timedelta(days=days)
        activities_data = await self.get_activities(user, after=after)
        
        synced = 0
        skipped = 0
        classified = 0
        
        for activity_data in activities_data:
            strava_id = str(activity_data["id"])
            
            # Check if already exists
            existing = (
                self.db.query(Activity)
                .filter(Activity.strava_id == strava_id)
                .first()
            )
            
            if existing:
                skipped += 1
                continue
            
            # Create activity
            activity = Activity(
                user_id=user.id,
                strava_id=strava_id,
                activity_type=activity_data.get("type", "Run"),
                name=activity_data.get("name", "Activity"),
                description=activity_data.get("description"),
                start_date=datetime.fromisoformat(
                    activity_data["start_date"].replace("Z", "+00:00")
                ),
                start_date_local=datetime.fromisoformat(
                    activity_data["start_date_local"].replace("Z", "+00:00")
                ) if activity_data.get("start_date_local") else None,
                timezone=activity_data.get("timezone"),
                distance=activity_data.get("distance", 0),
                moving_time=activity_data.get("moving_time", 0),
                elapsed_time=activity_data.get("elapsed_time", 0),
                total_elevation_gain=activity_data.get("total_elevation_gain", 0),
                average_heartrate=activity_data.get("average_heartrate"),
                max_heartrate=activity_data.get("max_heartrate"),
                has_heartrate=activity_data.get("has_heartrate", False),
                average_speed=activity_data.get("average_speed", 0),
                max_speed=activity_data.get("max_speed", 0),
                average_watts=activity_data.get("average_watts"),
                weighted_average_watts=activity_data.get("weighted_average_watts"),
                start_latlng=activity_data.get("start_latlng"),
                end_latlng=activity_data.get("end_latlng"),
            )
            
            # Fetch detailed activity to get best_efforts and gear_id
            try:
                detail = await self.get_activity_detail(user, strava_id)
                if detail:
                    activity.best_efforts = detail.get("best_efforts")
                    activity.gear_id = detail.get("gear_id")
            except Exception:
                pass
            
            # Try to fetch streams for more detailed data
            try:
                streams = await self.get_activity_streams(user, strava_id)
                if streams:
                    activity.telemetry = streams
            except Exception:
                pass
            
            # Classify activity using LLM
            try:
                classification = await self.llm_service.classify_activity({
                    "name": activity.name,
                    "type": activity.activity_type,
                    "start_time": activity.start_date_local.isoformat() if activity.start_date_local else None,
                    "distance_km": round(activity.distance / 1000, 2),
                    "duration_min": round(activity.moving_time / 60, 1),
                    "average_heartrate": activity.average_heartrate,
                    "max_heartrate": activity.max_heartrate,
                    "average_speed_kmh": round(activity.average_speed * 3.6, 1),
                    "start_location": activity.start_latlng,
                    "end_location": activity.end_latlng,
                })
                
                activity.classification = classification.get("classification", "workout")
                activity.classification_confidence = classification.get("confidence", 0.5)
                activity.classification_reasoning = classification.get("reasoning", "")
                activity.include_in_training_load = classification.get("include_in_training_load", True)
                classified += 1
            except Exception as e:
                # Default to workout if classification fails
                activity.classification = "workout"
                activity.classification_confidence = 0.5
                activity.include_in_training_load = True
            
            # Calculate TRIMP
            if activity.include_in_training_load:
                activity.trimp_score = self.metrics_service.calculate_trimp(activity, user)
            
            self.db.add(activity)
            synced += 1
        
        self.db.commit()
        
        return {
            "synced": synced,
            "skipped": skipped,
            "classified": classified,
            "total_fetched": len(activities_data),
        }
