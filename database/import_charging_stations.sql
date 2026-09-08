WITH geojson_document AS (
    SELECT pg_read_file(
        '/tmp/charging_stations.geojson'
    )::jsonb AS content
),
features AS (
    SELECT jsonb_array_elements(
        content -> 'features'
    ) AS feature
    FROM geojson_document
),
prepared AS (
    SELECT
        feature -> 'properties' AS properties,
        feature -> 'geometry' AS geometry
    FROM features
    WHERE feature -> 'geometry' ->> 'type' = 'Point'
)
INSERT INTO charging_station (
    source_id,
    name,
    operator,
    charger_type,
    power_kw,
    address,
    geom
)
SELECT
    properties ->> '@id',

    COALESCE(
        NULLIF(properties ->> 'name', ''),
        NULLIF(properties ->> 'ref', ''),
        'Charging station'
    ),

    NULLIF(properties ->> 'operator', ''),

    CASE
        WHEN properties ? 'socket:ccs' THEN 'CCS'
        WHEN properties ? 'socket:type2' THEN 'Type 2'
        WHEN properties ? 'socket:chademo' THEN 'CHAdeMO'
        WHEN properties ? 'socket:type2_combo' THEN 'Type 2 Combo'
        ELSE 'Unknown'
    END,

    NULL,

    NULLIF(
        CONCAT_WS(
            ', ',
            properties ->> 'addr:street',
            properties ->> 'addr:housenumber',
            properties ->> 'addr:postcode',
            properties ->> 'addr:city'
        ),
        ''
    ),

    ST_Transform(
        ST_SetSRID(
            ST_GeomFromGeoJSON(geometry::text),
            4326
        ),
        25833
    )
FROM prepared
WHERE properties ->> '@id' IS NOT NULL

ON CONFLICT (source_id)
DO UPDATE SET
    name = EXCLUDED.name,
    operator = EXCLUDED.operator,
    charger_type = EXCLUDED.charger_type,
    address = EXCLUDED.address,
    geom = EXCLUDED.geom,
    updated_at = NOW();
    