"""Run Sync AI - FastAPI Application Entry Point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import engine, Base
from app.routers import activities_router, checkins_router, coaching_router
from app.routers.auth import router as auth_router
from app.routers.goals import router as goals_router


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup: Create database tables
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: Cleanup if needed


app = FastAPI(
    title="Run Sync AI API",
    description="Intelligent adaptive coaching platform for runners",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        settings.frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(activities_router, prefix="/api/v1")
app.include_router(checkins_router, prefix="/api/v1")
app.include_router(coaching_router, prefix="/api/v1")
app.include_router(goals_router, prefix="/api/v1")


@app.get("/")
def root():
    """Root endpoint with API info."""
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy"}
