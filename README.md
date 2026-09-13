# ChargeSpot Berlin

ChargeSpot Berlin is a distributed Web GIS for analysing existing electric-vehicle charging coverage and screening possible locations for additional charging infrastructure in Berlin.

The system combines React, TypeScript, Leaflet, Turf.js, FastAPI, pg_featureserv, PostgreSQL/PostGIS, Nginx and Docker Compose.

## Project purpose

The project goes beyond displaying existing charging stations. It allows users to select a possible new charging location and examine the surrounding infrastructure.

The application provides preliminary supply-side screening rather than claiming to identify an objectively optimal construction site.

## Main features

Users can:

* Explore 1,705 existing charging stations.
* Explore all 12 Berlin administrative districts.
* Inspect individual charging-station attributes.
* Filter stations by operator and charger type.
* Select a candidate location on the map.
* Create a one-kilometre assessment area.
* Count stations within the assessment area.
* Calculate the distance to the nearest existing station.
* Compare client-side Turf.js and server-side PostGIS results.
* View charging-station density by district.
* Register and log in.
* Save, edit and delete their own candidate proposals.
* Reload saved proposals after refreshing the application.

PostGIS also validates that a proposal is located inside one of the Berlin district polygons.

## Spatial analysis

The application calculates:

* Straight-line distance to the nearest charging station.
* Number of charging stations within one kilometre.
* Charging-station density per square kilometre for each district.
* Density rank among Berlin’s 12 districts.
* Spatial containment within the Berlin district boundaries.

The nearest-station calculation is a direct spatial distance rather than a road-network or shortest-path calculation.

## Architecture

The application contains four Docker services:

| Service    | Technology             | Port | Purpose                                        |
| ---------- | ---------------------- | ---: | ---------------------------------------------- |
| `db`       | PostgreSQL and PostGIS | 5432 | Spatial database and GIS calculations          |
| `features` | pg_featureserv         | 9000 | Read-only spatial feature service              |
| `api`      | FastAPI                | 8000 | Authentication, proposals and spatial analysis |
| `web`      | React and Nginx        | 5173 | Interactive web application                    |

Public station and district features are delivered through pg_featureserv. Authentication, protected proposal operations and server-side spatial analysis are handled by FastAPI.

## Requirements

Install and start Docker Desktop before running the project.

Git is required when cloning the repository.

## Quick start on Windows

Clone the repository:

```powershell
git clone https://github.com/anjalianair/chargespot-berlin.git
cd chargespot-berlin
```

Run the setup script:

```powershell
.\SetupChargeSpot.bat
```

The setup script:

1. Checks whether Docker Desktop is running.
2. Creates `.env` from `.env.example` when required.
3. Builds and starts all Docker services.
4. Waits for the API health check.
5. Opens the web application.

The first startup may take a few minutes while Docker downloads and builds the required images.

## Manual startup

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

If `.env` already exists, this step is not required.

Build and start the application:

```powershell
docker compose up -d --build
```

Check the services:

```powershell
docker compose ps
```

## Application links

After startup, open:

* Web application: http://127.0.0.1:5173
* API documentation: http://127.0.0.1:8000/docs
* Spatial feature service: http://127.0.0.1:9000
* API health endpoint: http://127.0.0.1:8000/api/health

These addresses become available on the computer where the Docker application is running.

## Using the application

### Explore charging infrastructure

The map displays the existing charging stations and Berlin district boundaries.

Click a station marker to inspect available information such as its operator, charger type, power and address.

The station filters allow the displayed infrastructure to be queried by operator and charger type.

### Analyse a candidate location

Click inside Berlin to select a candidate location.

The application displays:

* A candidate marker.
* A one-kilometre assessment area.
* The number of stations within one kilometre.
* The nearest client-side distance.
* The authoritative PostGIS distance after login.
* The nearest station’s name when available.

Small differences between the Turf.js and PostGIS distance values are expected because the calculations use different spatial representations. The PostGIS result is treated as the authoritative metric value.

### Create an account

Select **Register** in the web application and enter a display name, valid email address and password.

No demonstration password is stored in the repository.

### Save a proposal

After logging in and selecting a candidate location, enter:

* Proposal title
* Justification
* Suggested charger type
* Suggested charging power
* Proposal status

Saved proposals remain available after the application is refreshed. Users can update or delete their own proposals but cannot modify proposals belonging to another account.

### View district statistics

Click a district to view:

* District area
* Number of charging stations
* Stations per square kilometre
* Density rank
* Number of saved proposals

## Spatial data

The repository includes:

* 1,705 charging-station point features.
* 12 Berlin administrative-district polygons.

Spatial data is stored and analysed in EPSG:25833, which supports distance calculations in metres and area calculations in square metres.

Features are transformed to EPSG:4326 before being delivered to the browser as GeoJSON.

When a new database volume is created, the initialization scripts automatically create the schema, import both datasets and create the public API views.

## Project structure

```text
chargespot-berlin/
├── api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── auth.py
│   │   ├── proposals.py
│   │   └── analysis.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── database/
│   ├── data/
│   │   ├── charging_stations.geojson
│   │   └── berlin_districts.geojson
│   ├── schema.sql
│   ├── import_charging_stations.sql
│   ├── import_districts.sql
│   └── public_views.sql
│
├── web/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── AuthPanel.tsx
│   │   │   ├── ProposalManager.tsx
│   │   │   ├── ProposalPanel.tsx
│   │   │   └── StationFilters.tsx
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.ts
│
├── .env.example
├── .gitignore
├── compose.yaml
├── SetupChargeSpot.bat
└── README.md
```

## Stop the application

```powershell
docker compose down
```

This stops the containers but preserves the PostGIS data volume.

## Troubleshooting

Confirm that Docker Desktop is running:

```powershell
docker version
```

Check all services:

```powershell
docker compose ps -a
```

Inspect recent service errors:

```powershell
docker compose logs --tail 100
```

## Scope and limitations

ChargeSpot Berlin is a preliminary supply-side screening tool.

It does not currently model:

* Charging demand
* Electric-vehicle ownership
* Traffic volume
* Road-network travel time
* Electrical-grid capacity
* Land ownership
* Parking availability
* Accessibility
* Construction cost

A large distance from an existing station or a low district station density indicates sparse mapped infrastructure. It does not by itself prove unmet demand or construction feasibility.

## Data sources and attribution

### Charging stations

The charging-station dataset contains 1,705 point features derived from OpenStreetMap.

Stations were identified using the `amenity=charging_station` tag and retain selected OpenStreetMap attributes such as feature identifiers, operators and socket information.

Source: © OpenStreetMap contributors
Licence: Open Data Commons Open Database License
https://www.openstreetmap.org/copyright
Accessed: September 2026

### Berlin administrative districts

The district dataset contains the 12 Berlin administrative districts derived from OpenStreetMap administrative-boundary relations.

The features retain OpenStreetMap relation identifiers and the `ref:DE-BE:BEZ` district reference.

Source: © OpenStreetMap contributors
Licence: Open Data Commons Open Database License
https://www.openstreetmap.org/copyright
Accessed: September 2026

### Basemap

The interactive basemap uses OpenStreetMap map tiles.

Basemap: © OpenStreetMap contributors
https://www.openstreetmap.org/copyright

## Repository

https://github.com/anjalianair/chargespot-berlin

