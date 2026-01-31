"""Application configuration from environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # Database
    database_url: str = "postgresql://runsync:runsync_secret@localhost:5432/runsync"
    
    # Gemini AI
    gemini_api_key: str = ""
    
    # Strava
    strava_client_id: str = ""
    strava_client_secret: str = ""
    strava_test_access_token: str = ""
    strava_test_refresh_token: str = ""
    
    # Google Calendar (optional)
    google_client_id: str = ""
    google_client_secret: str = ""
    
    # Frontend
    frontend_url: str = "http://localhost:3000"
    
    # App settings
    app_name: str = "Run Sync AI"
    debug: bool = True
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
