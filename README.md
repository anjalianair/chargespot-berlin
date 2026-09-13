# ChargeSpot Berlin

ChargeSpot Berlin is a distributed Web GIS for analysing existing electric-vehicle charging coverage and screening candidate locations for additional charging infrastructure in Berlin.

The system combines React, TypeScript, Leaflet, Turf.js, FastAPI, pg_featureserv, PostgreSQL/PostGIS, Nginx and Docker Compose.

## Project purpose

The application helps users explore existing charging infrastructure and perform preliminary supply-side screening for candidate charging locations.

Users can:

- Explore 1,705 charging stations.
- Explore all 12 Berlin administrative districts.
- Query stations by operator and charger type
- Select a candidate location on the map.
- Create a one-kilometre analysis buffer.
- Count existing stations inside the buffer.
- Calculate distance to the nearest station.
- Compare client-side Turf.js and server-side PostGIS results.
- Register and log in.
- Save candidate locations permanently.
- Reload, edit and delete their own proposals.
- View district charging density using a choropleth map.
## Analytical scope

ChargeSpot Berlin provides preliminary, supply-side decision support for candidate-site screening.

The current analysis measures:

- Distance to the nearest existing charging station
- Number of stations within one kilometre
- Charging-station density by district
- Spatial distribution of existing infrastructure

The results identify locations that may deserve further investigation. A final infrastructure-planning decision would additionally require demand, traffic, electrical-grid capacity, land availability, accessibility and cost data.

The application therefore presents coverage indicators rather than claiming to identify an objectively optimal construction site.
## Architecture

The project contains four Docker services:

| Service | Technology | Port | Purpose |
|---|---|---:|---|
| `db` | PostgreSQL + PostGIS | 5432 | Spatial database |
| `features` | pg_featureserv | 9000 | Read-only OGC-style feature service |
| `api` | FastAPI | 8000 | Authentication, proposal CRUD and spatial analysis |
| `web` | React + Nginx | 5173 | Web client |

The web client requests public station and district data from the spatial services. Authenticated write operations and server-side analyses are handled by FastAPI.

## Main technologies

### Web client

- React
- TypeScript
- Leaflet
- React-Leaflet
- Turf.js
- Vite
- Nginx

### Backend

- FastAPI
- Python
- psycopg
- JWT authentication
- Password hashing

### Spatial database

- PostgreSQL
- PostGIS
- EPSG:25833 for stored spatial data
- EPSG:4326 for web-map GeoJSON

### Deployment

- Docker
- Docker Compose

## Database schema

The database contains the following main tables:

### `app_user`

Stores registered application users.

Important fields:

- `id`
- `display_name`
- `email`
- `password_hash`
- `created_at`

### `charging_station`

Stores imported existing charging stations as PostGIS point geometries.

Important fields:

- `id`
- `source_id`
- `name`
- `operator`
- `charger_type`
- `power_kw`
- `address`
- `geom`

### `district`

Stores the 12 Berlin administrative districts as PostGIS polygon geometries.

Important fields:

- `id`
- `name`
- `geom`

### `site_proposal`

Stores user-created candidate charging locations.

Important fields:

- `id`
- `owner_id`
- `title`
- `justification`
- `suggested_charger_type`
- `suggested_power_kw`
- `status`
- `suitability_score`
- `analysis_result`
- `geom`
- `created_at`
- `updated_at`

## Spatial data

The project contains:

- 1,705 charging-station point features
- 12 Berlin district polygon features

The source GeoJSON files are mounted into the PostGIS container. Database initialization scripts automatically create the schema, import the data and create public API views when a new database volume is created.

## Authentication

The FastAPI backend provides JWT-based authentication.

Users can:

- Register
- Log in
- Restore an existing browser session
- Retrieve their account information
- Log out

Passwords are stored as password hashes rather than readable plain-text passwords.

## Proposal ownership

Each proposal contains an `owner_id`.

The backend ensures that users can:

- Retrieve their own proposals
- Update only their own proposals
- Delete only their own proposals

A user cannot modify another user’s contribution.

## Berlin boundary validation

Before a proposal is created, PostGIS checks whether the candidate point is covered by one of the Berlin district polygons.

Locations outside Berlin are rejected with:

```text
Candidate location must be inside a Berlin district
## Data sources and attribution

### Charging stations

The charging-station dataset contains 1,705 point features derived from
OpenStreetMap. Stations were identified using the
`amenity=charging_station` tag and retain selected OpenStreetMap attributes,
including feature identifiers, operators and socket information.

Source: © OpenStreetMap contributors  
Licence: Open Data Commons Open Database License (ODbL)  
https://www.openstreetmap.org/copyright  
Accessed: September 2026

### Berlin administrative districts

The district dataset contains the 12 Berlin administrative districts derived
from OpenStreetMap administrative-boundary relations. The source features
include OpenStreetMap relation identifiers and the `ref:DE-BE:BEZ` district
reference.

Source: © OpenStreetMap contributors  
Licence: Open Data Commons Open Database License (ODbL)  
https://www.openstreetmap.org/copyright  
Accessed: September 2026

### Basemap

The interactive basemap uses OpenStreetMap map tiles.

Basemap: © OpenStreetMap contributors  
https://www.openstreetmap.org/copyright