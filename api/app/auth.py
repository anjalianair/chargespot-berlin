import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://chargespot:development_password@db:5432/chargespot",
)

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "development-only-secret-change-before-deployment",
)

JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 120

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    display_name: str
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_access_token(user_id: UUID) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        user_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    with psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    ) as connection:
        user = connection.execute(
            """
            SELECT id, display_name, email
            FROM app_user
            WHERE id = %s
            """,
            (user_id,),
        ).fetchone()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )

    return user


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(request: RegisterRequest):
    hashed_password = password_hash.hash(request.password)

    try:
        with psycopg.connect(
            DATABASE_URL,
            row_factory=dict_row,
        ) as connection:
            user = connection.execute(
                """
                INSERT INTO app_user (
                    display_name,
                    email,
                    password_hash
                )
                VALUES (%s, %s, %s)
                RETURNING id, display_name, email
                """,
                (
                    request.display_name.strip(),
                    request.email.lower(),
                    hashed_password,
                ),
            ).fetchone()

    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    return user


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    with psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    ) as connection:
        user = connection.execute(
            """
            SELECT id, email, password_hash
            FROM app_user
            WHERE email = %s
            """,
            (request.email.lower(),),
        ).fetchone()

    if user is None or not password_hash.verify(
        request.password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    return TokenResponse(
        access_token=create_access_token(user["id"])
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
