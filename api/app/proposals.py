import json
import os
from typing import Literal
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from app.auth import get_current_user


router = APIRouter(prefix="/api/proposals", tags=["Proposals"])

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://chargespot:development_password@db:5432/chargespot",
)


class ProposalCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    justification: str | None = Field(default=None, max_length=1000)
    suggested_charger_type: str | None = Field(default=None, max_length=100)
    suggested_power_kw: float | None = Field(default=None, gt=0, le=1000)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class ProposalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    justification: str | None = Field(default=None, max_length=1000)
    suggested_charger_type: str | None = Field(default=None, max_length=100)
    suggested_power_kw: float | None = Field(default=None, gt=0, le=1000)
    proposal_status: Literal[
        "draft",
        "submitted",
        "reviewed",
        "approved",
        "rejected",
    ] | None = None
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)


def proposal_to_feature(row: dict) -> dict:
    geometry = row.get("geometry")

    if isinstance(geometry, str):
        geometry = json.loads(geometry)

    return {
        "type": "Feature",
        "id": str(row["id"]),
        "geometry": geometry,
        "properties": {
            "title": row["title"],
            "justification": row["justification"],
            "suggested_charger_type": row["suggested_charger_type"],
            "suggested_power_kw": (
                float(row["suggested_power_kw"])
                if row["suggested_power_kw"] is not None
                else None
            ),
            "status": row["status"],
            "suitability_score": (
                float(row["suitability_score"])
                if row["suitability_score"] is not None
                else None
            ),
            "created_at": row["created_at"].isoformat(),
            "updated_at": row["updated_at"].isoformat(),
        },
    }


SELECT_PROPOSAL = """
    SELECT
        id,
        owner_id,
        title,
        justification,
        suggested_charger_type,
        suggested_power_kw,
        status,
        suitability_score,
        created_at,
        updated_at,
        ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry
    FROM site_proposal
"""


@router.get("/mine")
def get_my_proposals(current_user: dict = Depends(get_current_user)):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                SELECT_PROPOSAL
                + """
                WHERE owner_id = %s
                ORDER BY created_at DESC
                """,
                (current_user["id"],),
            )
            rows = cursor.fetchall()

    return {
        "type": "FeatureCollection",
        "features": [proposal_to_feature(row) for row in rows],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_proposal(
    proposal: ProposalCreate,
    current_user: dict = Depends(get_current_user),
):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO site_proposal (
                    owner_id,
                    title,
                    justification,
                    suggested_charger_type,
                    suggested_power_kw,
                    geom
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    ST_Transform(
                        ST_SetSRID(ST_Point(%s, %s), 4326),
                        25833
                    )
                )
                RETURNING id
                """,
                (
                    current_user["id"],
                    proposal.title,
                    proposal.justification,
                    proposal.suggested_charger_type,
                    proposal.suggested_power_kw,
                    proposal.longitude,
                    proposal.latitude,
                ),
            )
            proposal_id = cursor.fetchone()["id"]

            cursor.execute(
                SELECT_PROPOSAL + " WHERE id = %s",
                (proposal_id,),
            )
            row = cursor.fetchone()

        connection.commit()

    return proposal_to_feature(row)


@router.patch("/{proposal_id}")
def update_proposal(
    proposal_id: UUID,
    proposal: ProposalUpdate,
    current_user: dict = Depends(get_current_user),
):
    if (proposal.longitude is None) != (proposal.latitude is None):
        raise HTTPException(
            status_code=422,
            detail="Longitude and latitude must be supplied together",
        )

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE site_proposal
                SET
                    title = COALESCE(%s, title),
                    justification = COALESCE(%s, justification),
                    suggested_charger_type =
                        COALESCE(%s, suggested_charger_type),
                    suggested_power_kw =
                        COALESCE(%s, suggested_power_kw),
                    status = COALESCE(%s, status),
geom = CASE
    WHEN %s::double precision IS NOT NULL
         AND %s::double precision IS NOT NULL
    THEN ST_Transform(
        ST_SetSRID(
            ST_Point(
                %s::double precision,
                %s::double precision
            ),
            4326
        ),
        25833
    )
    ELSE geom
END,
updated_at = NOW()
                WHERE id = %s
                  AND owner_id = %s
                RETURNING id
                """,
                (
                    proposal.title,
                    proposal.justification,
                    proposal.suggested_charger_type,
                    proposal.suggested_power_kw,
                    proposal.proposal_status,
                    proposal.longitude,
                    proposal.latitude,
                    proposal.longitude,
                    proposal.latitude,
                    proposal_id,
                    current_user["id"],
                ),
            )
            updated = cursor.fetchone()

            if updated is None:
                raise HTTPException(
                    status_code=404,
                    detail="Proposal not found or you do not own it",
                )

            cursor.execute(
                SELECT_PROPOSAL + " WHERE id = %s",
                (proposal_id,),
            )
            row = cursor.fetchone()

        connection.commit()

    return proposal_to_feature(row)


@router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proposal(
    proposal_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM site_proposal
                WHERE id = %s
                  AND owner_id = %s
                """,
                (proposal_id, current_user["id"]),
            )

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Proposal not found or you do not own it",
                )

        connection.commit()
