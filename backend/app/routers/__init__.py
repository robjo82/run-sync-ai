"""Routers package."""

from app.routers.activities import router as activities_router
from app.routers.checkins import router as checkins_router
from app.routers.coaching import router as coaching_router
from app.routers.auth import router as auth_router

__all__ = ["activities_router", "checkins_router", "coaching_router", "auth_router"]
