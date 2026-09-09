# ChargeSpot Berlin

ChargeSpot Berlin is a distributed Web GIS for exploring EV charging stations in Berlin and proposing locations for new charging infrastructure.

Users can view existing charging stations and Berlin districts, create an account, save proposed charging locations, manage their own proposals and find the nearest existing charging station.

## Technology

- PostgreSQL with PostGIS
- pg_featureserv
- FastAPI
- React, TypeScript and Leaflet frontend
- Docker Compose

## Spatial data

- 1,705 OpenStreetMap charging stations
- 12 official Berlin districts
- Database coordinate system: EPSG:25833
- Web/GeoJSON coordinate system: EPSG:4326

## Project structure

```text
chargespot-berlin/
├── api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── analysis.py
│   │   ├── auth.py
│   │   ├── main.py
│   │   └── proposals.py
│   ├── Dockerfile
│   └── requirements.txt
├── database/
│   ├── data/
│   │   ├── berlin_districts.geojson
│   │   └── charging_stations.geojson
│   ├── import_charging_stations.sql
│   ├── import_districts.sql
│   ├── public_views.sql
│   └── schema.sql
├── web/
├── .env.example
├── .gitignore
├── compose.yaml
└── README.md
```

## Requirements

- Git
- Docker Desktop
- Docker Compose

Node.js is required only when running the frontend outside Docker.

## Start the application

Clone the repository and enter the project folder.

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Check the services:

```powershell
docker compose ps
```

During the first startup, PostgreSQL automatically creates the schema, imports the spatial data and creates the public views.

Do not run `docker compose down -v` unless you intentionally want to delete the database volume.

## Service URLs

| Service | URL |
|---|---|
| FastAPI documentation | http://127.0.0.1:8000/docs |
| API health check | http://127.0.0.1:8000/api/health |
| pg_featureserv | http://127.0.0.1:9000 |
| PostgreSQL | localhost:5432 |
| Frontend | http://localhost:5173 |

The frontend URL becomes available after the frontend service is implemented.

## Public GeoJSON data

Charging stations:

```text
http://127.0.0.1:9000/collections/api.charging_station_public/items.json?limit=2000
```

Berlin districts:

```text
http://127.0.0.1:9000/collections/api.district_public/items.json?limit=12
```

## Authentication API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Log in and receive a JWT |
| GET | `/api/auth/me` | Retrieve the logged-in user |

Protected requests require:

```text
Authorization: Bearer <access_token>
```

Passwords are stored as secure hashes.

## Proposal API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/proposals/mine` | Retrieve the current user’s proposals |
| POST | `/api/proposals` | Create a proposal |
| PATCH | `/api/proposals/{proposal_id}` | Update an owned proposal |
| DELETE | `/api/proposals/{proposal_id}` | Delete an owned proposal |

Proposal endpoints require authentication. Users cannot update or delete proposals belonging to another user.

## Nearest-station analysis

Endpoint:

```text
POST /api/analysis/nearest
```

Example request:

```json
{
  "longitude": 13.4132,
  "latitude": 52.5219
}
```

PostGIS finds the nearest charging station and calculates the distance in metres.

## Coordinate rules

GeoJSON coordinates use:

```text
[longitude, latitude]
```

Example:

```json
{
  "type": "Point",
  "coordinates": [13.4132, 52.5219]
}
```

The API transforms coordinates to EPSG:25833 for metric analysis and returns results in EPSG:4326.

Leaflet commonly uses `[latitude, longitude]`, so the frontend must convert the order when creating GeoJSON.

## Verified backend features

- PostGIS database and spatial indexes
- 1,705 charging stations
- 12 Berlin districts
- Public GeoJSON layers
- Registration and login
- JWT authentication
- Secure password hashing
- Proposal creation, retrieval, updating and deletion
- Cross-user ownership protection
- Permanent storage after container restart
- Nearest-station PostGIS analysis
- Coordinate validation
- Missing-proposal handling
- Automatic database initialization
- Docker environment configuration

## Frontend requirements

The frontend should contain:

- OpenStreetMap basemap
- Leaflet map
- Charging-station and district layers
- Interactive legend
- Popups and filters
- Registration and login forms
- Proposal drawing and submission
- Display, editing and deletion of personal proposals
- Client-side Turf.js analysis
- Server analysis results
- Responsive layout
- Frontend Dockerfile

## Mandatory demonstration

The final system should demonstrate that a user can:

1. Navigate the map.
2. View and query spatial data.
3. Register and log in.
4. Create and save a proposal.
5. Retrieve the proposal after revisiting.
6. Edit or delete their own proposal.
7. Remain unable to edit another user’s proposal.
8. Run client-side spatial analysis.
9. Run server-side PostGIS analysis.
10. Start the complete application with Docker Compose.

## Data source

Charging-station and administrative-boundary data were obtained from OpenStreetMap for this educational project.