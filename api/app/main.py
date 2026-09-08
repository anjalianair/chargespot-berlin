import os

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="ChargeSpot Berlin API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://chargespot:development_password@db:5432/chargespot",
)


@app.get("/api/health")
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
