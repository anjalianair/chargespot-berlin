CREATE SCHEMA IF NOT EXISTS api;

CREATE OR REPLACE VIEW api.charging_station_public AS
SELECT
    id,
    source_id,
    name,
    operator,
    charger_type,
    power_kw,
    address,
    ST_Transform(geom, 4326)::geometry(Point, 4326) AS geom
FROM public.charging_station;

CREATE OR REPLACE VIEW api.district_public AS
SELECT
    id,
    name,
    ST_Transform(geom, 4326)::geometry(MultiPolygon, 4326) AS geom
FROM public.district;
