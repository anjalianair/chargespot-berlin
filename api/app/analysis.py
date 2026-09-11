import json
import os

import psycopg
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from app.auth import get_current_user


router = APIRouter(
    prefix="/api/analysis",
    tags=["Spatial Analysis"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    (
        "postgresql://chargespot:"
        "development_password@db:5432/"
        "chargespot"
    ),
)


class NearestStationRequest(BaseModel):
    longitude: float = Field(
        ge=-180,
        le=180,
    )

    latitude: float = Field(
        ge=-90,
        le=90,
    )


@router.post("/nearest")
def find_nearest_station(
    location: NearestStationRequest,
    current_user: dict = Depends(
        get_current_user
    ),
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
                        ST_Transform(
                            station.geom,
                            4326
                        )
                    ) AS geometry
                FROM charging_station AS station
                CROSS JOIN requested_location
                ORDER BY
                    station.geom
                    <->
                    requested_location.geom
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
            detail=(
                "No charging stations "
                "are available"
            ),
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
                "source_id": (
                    station["source_id"]
                ),
                "name": station["name"],
                "operator": (
                    station["operator"]
                ),
                "charger_type": (
                    station["charger_type"]
                ),
                "power_kw": (
                    float(
                        station["power_kw"]
                    )
                    if station["power_kw"]
                    is not None
                    else None
                ),
                "address": (
                    station["address"]
                ),
                "distance_m": float(
                    station["distance_m"]
                ),
            },
        },
    }


@router.get("/district-statistics")
def get_district_statistics():
    with psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH district_statistics AS (
                    SELECT
                        district.id,
                        district.name,
                        district.geom,

                        ST_Area(
                            district.geom
                        ) / 1000000.0
                            AS area_km2,

                        (
                            SELECT COUNT(*)
                            FROM charging_station
                                AS station
                            WHERE ST_Covers(
                                district.geom,
                                station.geom
                            )
                        ) AS station_count,

                        (
                            SELECT COUNT(*)
                            FROM site_proposal
                                AS proposal
                            WHERE ST_Covers(
                                district.geom,
                                proposal.geom
                            )
                        ) AS proposal_count

                    FROM district
                ),

                calculated_statistics AS (
                    SELECT
                        id,
                        name,
                        geom,
                        area_km2,
                        station_count,
                        proposal_count,

                        station_count
                        /
                        NULLIF(
                            area_km2,
                            0
                        ) AS stations_per_km2

                    FROM district_statistics
                ),

                ranked_statistics AS (
                    SELECT
                        *,

                        DENSE_RANK() OVER (
                            ORDER BY
                                stations_per_km2
                                ASC
                        ) AS density_rank

                    FROM calculated_statistics
                )

                SELECT
                    id,
                    name,

                    ROUND(
                        area_km2::numeric,
                        2
                    ) AS area_km2,

                    station_count,
                    proposal_count,

                    ROUND(
                        stations_per_km2
                            ::numeric,
                        2
                    ) AS stations_per_km2,

                    density_rank,

                    ST_AsGeoJSON(
                        ST_Transform(
                            geom,
                            4326
                        )
                    ) AS geometry

                FROM ranked_statistics

                ORDER BY
                    stations_per_km2 ASC,
                    name ASC
                """
            )

            rows = cursor.fetchall()

    features = []

    for row in rows:
        geometry = row["geometry"]

        if isinstance(geometry, str):
            geometry = json.loads(geometry)

        features.append(
            {
                "type": "Feature",
                "id": row["id"],
                "geometry": geometry,
                "properties": {
                    "name": row["name"],
                    "area_km2": float(
                        row["area_km2"]
                    ),
                    "station_count": int(
                        row["station_count"]
                    ),
                    "proposal_count": int(
                        row["proposal_count"]
                    ),
                    "stations_per_km2": float(
                        row["stations_per_km2"]
                    ),
                    "density_rank": int(
                        row["density_rank"]
                    ),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }
