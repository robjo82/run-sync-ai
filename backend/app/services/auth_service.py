"""Authentication service with JWT and password hashing."""

from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User


settings = get_settings()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = settings.gemini_api_key[:32] if settings.gemini_api_key else "dev-secret-key-change-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


class AuthService:
    """Service for authentication operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)
    
    @staticmethod
    def get_password_hash(password: str) -> str:
        """Hash a password."""
        return pwd_context.hash(password)
    
    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token."""
        to_encode = data.copy()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    @staticmethod
    def decode_token(token: str) -> Optional[dict]:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError:
            return None
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get a user by email."""
        return self.db.query(User).filter(User.email == email).first()
    
    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get a user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()
    
    def create_user(self, email: str, password: str, name: str) -> User:
        """Create a new user."""
        hashed_password = self.get_password_hash(password)
        user = User(
            email=email,
            name=name,
            hashed_password=hashed_password,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Authenticate a user by email and password."""
        user = self.get_user_by_email(email)
        if not user:
            return None
        if not user.hashed_password:
            return None
        if not self.verify_password(password, user.hashed_password):
            return None
        return user
