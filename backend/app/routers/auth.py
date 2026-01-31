"""Authentication and Strava OAuth router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.database import get_db
from app.models import User
from app.services.strava_service import StravaService
from app.services.auth_service import AuthService
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ============== Schemas ==============

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str


class UserMeResponse(BaseModel):
    id: int
    email: str
    name: str
    strava_connected: bool
    google_calendar_connected: bool


# ============== Dependencies ==============

def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user from JWT token (optional)."""
    if not token:
        return None
    
    auth_service = AuthService(db)
    payload = auth_service.decode_token(token)
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    return auth_service.get_user_by_id(int(user_id))


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get current user from JWT token or create default user for dev."""
    user = get_current_user_optional(token, db)
    
    if user:
        return user
    
    # For development: get or create a default user
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", email="user@runsync.ai")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


# ============== Auth Endpoints ==============

@router.post("/register", response_model=TokenResponse)
def register(
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    """Register a new user."""
    auth_service = AuthService(db)
    
    # Check if email already exists
    existing_user = auth_service.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    
    # Create user
    user = auth_service.create_user(
        email=user_data.email,
        password=user_data.password,
        name=user_data.name,
    )
    
    # Create token
    access_token = auth_service.create_access_token(data={"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        name=user.name,
    )


@router.post("/login", response_model=TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login with email and password."""
    auth_service = AuthService(db)
    
    user = auth_service.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    access_token = auth_service.create_access_token(data={"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        name=user.name or "",
    )


@router.get("/me", response_model=UserMeResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Get current authenticated user info."""
    return UserMeResponse(
        id=current_user.id,
        email=current_user.email or "",
        name=current_user.name or "",
        strava_connected=current_user.strava_athlete_id is not None,
        google_calendar_connected=current_user.google_access_token is not None,
    )


# ============== Strava OAuth ==============

@router.get("/strava")
def strava_auth(db: Session = Depends(get_db)):
    """Initiate Strava OAuth flow."""
    strava_service = StravaService(db)
    redirect_uri = "http://localhost:8000/api/v1/auth/strava/callback"
    auth_url = strava_service.get_auth_url(redirect_uri)
    return RedirectResponse(url=auth_url)


@router.get("/strava/callback")
async def strava_callback(
    code: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Handle Strava OAuth callback."""
    strava_service = StravaService(db)
    
    try:
        token_data = await strava_service.exchange_code(code)
        
        user.strava_athlete_id = token_data["athlete"]["id"]
        user.strava_access_token = token_data["access_token"]
        user.strava_refresh_token = token_data["refresh_token"]
        
        from datetime import datetime
        user.strava_token_expires_at = datetime.fromtimestamp(token_data["expires_at"])
        
        db.commit()
        
        return RedirectResponse(url=f"{settings.frontend_url}?strava_connected=true")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Strava OAuth failed: {str(e)}")


@router.post("/strava/sync")
async def sync_strava_activities(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sync activities from Strava."""
    strava_service = StravaService(db)
    
    try:
        result = await strava_service.sync_activities(user, days=days)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/status")
def auth_status(
    user: User = Depends(get_current_user),
):
    """Get current authentication status."""
    return {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "strava_connected": user.strava_athlete_id is not None,
        "strava_athlete_id": user.strava_athlete_id,
        "google_calendar_connected": user.google_access_token is not None,
    }
