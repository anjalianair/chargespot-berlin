CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS charging_station (
    id BIGSERIAL PRIMARY KEY,
    source_id VARCHAR(100) UNIQUE,
    name VARCHAR(255),
    operator VARCHAR(255),
    charger_type VARCHAR(100),
    power_kw NUMERIC(8,2),
    address TEXT,
    geom geometry(Point, 25833) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS charging_station_geom_idx
ON charging_station USING GIST (geom);

CREATE TABLE IF NOT EXISTS district (
    id SMALLSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    geom geometry(MultiPolygon, 25833) NOT NULL
);

CREATE INDEX IF NOT EXISTS district_geom_idx
ON district USING GIST (geom);

CREATE TABLE IF NOT EXISTS site_proposal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL
        REFERENCES app_user(id)
        ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    justification TEXT,
    suggested_charger_type VARCHAR(100),
    suggested_power_kw NUMERIC(8,2),
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    suitability_score NUMERIC(5,2),
    analysis_result JSONB,
    geom geometry(Point, 25833) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT site_proposal_status_check
    CHECK (
        status IN (
            'draft',
            'submitted',
            'reviewed',
            'approved',
            'rejected'
        )
    )
);

CREATE INDEX IF NOT EXISTS site_proposal_geom_idx
ON site_proposal USING GIST (geom);

CREATE INDEX IF NOT EXISTS site_proposal_owner_idx
ON site_proposal (owner_id);