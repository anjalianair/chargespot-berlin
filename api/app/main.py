import os

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.analysis import router as analysis_router
from app.auth import router as auth_router
from app.proposals import router as proposals_router


app = FastAPI(
    title="ChargeSpot Berlin API",
    version="1.0.0",
)

app.include_router(auth_router)
app.include_router(proposals_router)
app.include_router(analysis_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://chargespot:development_password@db:5432/chargespot",
)


@app.get("/api/health", tags=["System"])
def health():
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    current_database(),
                    PostGIS_Version()
                """
            )
            database, postgis_version = cursor.fetchone()

    return {
        "status": "ok",
        "database": database,
        "postgis": postgis_version,
    }
