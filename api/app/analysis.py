import json
import os

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from app.auth import get_current_user


router = APIRouter(
    prefix="/api/analysis",
    tags=["Spatial Analysis"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://chargespot:development_password@db:5432/chargespot",
)


class NearestStationRequest(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


@router.post("/nearest")
def find_nearest_station(
    location: NearestStationRequest,
    current_user: dict = Depends(get_current_user),
):
    with psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH requested_location AS (
                    SELECT ST_Transform(
                        ST_SetSRID(
                            ST_Point(
                                %s::double precision,
                                %s::double precision
                            ),
                            4326
                        ),
                        25833
                    ) AS geom
                )
                SELECT
                    station.id,
                    station.source_id,
                    station.name,
                    station.operator,
                    station.charger_type,
                    station.power_kw,
                    station.address,
                    ROUND(
                        ST_Distance(
                            station.geom,
                            requested_location.geom
                        )::numeric,
                        2
                    ) AS distance_m,
                    ST_AsGeoJSON(
                        ST_Transform(station.geom, 4326)
                    ) AS geometry
                FROM charging_station AS station
                CROSS JOIN requested_location
                ORDER BY station.geom <-> requested_location.geom
                LIMIT 1
                """,
                (
                    location.longitude,
                    location.latitude,
                ),
            )

            station = cursor.fetchone()

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="No charging stations are available",
        )

    geometry = station["geometry"]

    if isinstance(geometry, str):
        geometry = json.loads(geometry)

    return {
        "query_location": {
            "type": "Point",
            "coordinates": [
                location.longitude,
                location.latitude,
            ],
        },
        "nearest_station": {
            "type": "Feature",
            "id": station["id"],
            "geometry": geometry,
            "properties": {
                "source_id": station["source_id"],
                "name": station["name"],
                "operator": station["operator"],
                "charger_type": station["charger_type"],
                "power_kw": (
                    float(station["power_kw"])
                    if station["power_kw"] is not None
                    else None
                ),
                "address": station["address"],
                "distance_m": float(station["distance_m"]),
            },
        },
    }