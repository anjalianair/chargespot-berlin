WITH geojson_document AS (
    SELECT pg_read_file(
        '/tmp/berlin_districts.geojson'
    )::jsonb AS content
),
features AS (
    SELECT jsonb_array_elements(
        content -> 'features'
    ) AS feature
    FROM geojson_document
),
berlin_districts AS (
    SELECT
        feature -> 'properties' AS properties,
        feature -> 'geometry' AS geometry
    FROM features
    WHERE feature -> 'properties' ? 'ref:DE-BE:BEZ'
)
INSERT INTO district (
    name,
    geom
)
SELECT
    CASE properties ->> 'ref:DE-BE:BEZ'
        WHEN '01' THEN 'Mitte'
        WHEN '02' THEN 'Friedrichshain-Kreuzberg'
        WHEN '03' THEN 'Pankow'
        WHEN '04' THEN 'Charlottenburg-Wilmersdorf'
        WHEN '05' THEN 'Spandau'
        WHEN '06' THEN 'Steglitz-Zehlendorf'
        WHEN '07' THEN U&'Tempelhof-Sch\00F6neberg'
        WHEN '08' THEN U&'Neuk\00F6lln'
        WHEN '09' THEN U&'Treptow-K\00F6penick'
        WHEN '10' THEN 'Marzahn-Hellersdorf'
        WHEN '11' THEN 'Lichtenberg'
        WHEN '12' THEN 'Reinickendorf'
    END,

    ST_Multi(
        ST_CollectionExtract(
            ST_MakeValid(
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(geometry::text),
                        4326
                    ),
                    25833
                )
            ),
            3
        )
    )::geometry(MultiPolygon, 25833)

FROM berlin_districts

ON CONFLICT (name)
DO UPDATE SET
    geom = EXCLUDED.geom;
    