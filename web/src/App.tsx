import { useEffect, useState } from "react";
import L, { type Layer } from "leaflet";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";
import {
  GeoJSON,
  MapContainer,
  ScaleControl,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./App.css";


const DISTRICTS_URL =
  "http://127.0.0.1:9000/collections/api.district_public/items.json?limit=12";

const STATIONS_FIRST_PAGE_URL =
  "http://127.0.0.1:9000/collections/api.charging_station_public/items.json?limit=1000&offset=0";

const STATIONS_SECOND_PAGE_URL =
  "http://127.0.0.1:9000/collections/api.charging_station_public/items.json?limit=1000&offset=1000";


function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const updateMapSize = () => {
      map.invalidateSize();
    };

    const firstTimer = window.setTimeout(updateMapSize, 100);
    const secondTimer = window.setTimeout(updateMapSize, 500);

    window.addEventListener("resize", updateMapSize);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
      window.removeEventListener("resize", updateMapSize);
    };
  }, [map]);

  return null;
}


function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function displayValue(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return escapeHtml(value);
}


function addDistrictPopup(
  feature: Feature<Geometry, GeoJsonProperties>,
  layer: Layer,
) {
  const districtName =
    feature.properties?.name ??
    feature.properties?.district_name ??
    "Berlin district";

  layer.bindPopup(`
    <div class="map-popup">
      <strong>${escapeHtml(districtName)}</strong>
      <p>Berlin administrative district</p>
    </div>
  `);
}


function addStationPopup(
  feature: Feature<Geometry, GeoJsonProperties>,
  layer: Layer,
) {
  const properties = feature.properties ?? {};

  const stationName = properties.name ?? "Charging station";
  const operator = properties.operator;
  const chargerType = properties.charger_type;
  const power = properties.power_kw;
  const address = properties.address;

  layer.bindPopup(`
    <div class="map-popup">
      <strong>${displayValue(stationName, "Charging station")}</strong>

      <dl>
        <dt>Operator</dt>
        <dd>${displayValue(operator)}</dd>

        <dt>Charger type</dt>
        <dd>${displayValue(chargerType)}</dd>

        <dt>Power</dt>
        <dd>${power ? `${escapeHtml(power)} kW` : "Not available"}</dd>

        <dt>Address</dt>
        <dd>${displayValue(address)}</dd>
      </dl>
    </div>
  `);
}


function App() {
  const [districts, setDistricts] =
    useState<FeatureCollection | null>(null);

  const [stations, setStations] =
    useState<FeatureCollection | null>(null);

  const [dataError, setDataError] = useState<string | null>(null);


  useEffect(() => {
    async function loadSpatialData() {
      try {
        const [
          districtResponse,
          firstStationResponse,
          secondStationResponse,
        ] = await Promise.all([
          fetch(DISTRICTS_URL),
          fetch(STATIONS_FIRST_PAGE_URL),
          fetch(STATIONS_SECOND_PAGE_URL),
        ]);

        if (!districtResponse.ok) {
          throw new Error(
            `District request failed with status ${districtResponse.status}`,
          );
        }

        if (!firstStationResponse.ok || !secondStationResponse.ok) {
          throw new Error("One or more station requests failed");
        }

        const districtData =
          (await districtResponse.json()) as FeatureCollection;

        const firstStationPage =
          (await firstStationResponse.json()) as FeatureCollection;

        const secondStationPage =
          (await secondStationResponse.json()) as FeatureCollection;

        const stationData: FeatureCollection = {
          type: "FeatureCollection",
          features: [
            ...firstStationPage.features,
            ...secondStationPage.features,
          ],
        };

        setDistricts(districtData);
        setStations(stationData);
        setDataError(null);
      } catch (error) {
        console.error(error);

        setDataError(
          "Spatial data could not be loaded. Check pg_featureserv on port 9000.",
        );
      }
    }

    loadSpatialData();
  }, []);


  const districtCount = districts?.features.length ?? 0;
  const stationCount = stations?.features.length ?? 0;
  const spatialDataLoaded = districts !== null && stations !== null;


  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>ChargeSpot Berlin</h1>
          <p>Charging Coverage and Candidate-Site Screening</p>
        </div>

        <div className="header-status">
          <span className="status-dot" />

          {dataError
            ? "Spatial service unavailable"
            : spatialDataLoaded
              ? "Spatial data connected"
              : "Loading spatial data"}
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section>
            <p className="section-label">PROJECT PURPOSE</p>

            <h2>Assess charging coverage</h2>

            <p>
              Explore Berlin&apos;s existing charging infrastructure and
              evaluate candidate locations for additional stations.
            </p>
          </section>

          <section className="analysis-placeholder">
            <p className="section-label">ANALYSIS</p>

            <h3>Select a location</h3>

            <p>
              Click on the map to assess the existing charging coverage around
              a candidate location.
            </p>
          </section>

          <section>
            <p className="section-label">DATA STATUS</p>

            {dataError ? (
              <p>{dataError}</p>
            ) : (
              <>
                <p>
                  Charging stations loaded:{" "}
                  <strong>{stationCount.toLocaleString()}</strong>
                </p>

                <p>
                  Berlin districts loaded:{" "}
                  <strong>{districtCount}</strong>
                </p>
              </>
            )}
          </section>

          <section>
            <p className="section-label">MAP LEGEND</p>

            <div className="legend-item">
              <span className="legend-symbol station-symbol" />
              Existing charging station
            </div>

            <div className="legend-item">
              <span className="legend-symbol district-symbol" />
              Berlin district
            </div>

            <div className="legend-item">
              <span className="legend-symbol proposal-symbol" />
              Candidate location
            </div>
          </section>
        </aside>

        <section className="map-area">
          <MapContainer
            center={[52.52, 13.405]}
            zoom={10}
            minZoom={9}
            maxZoom={18}
            zoomControl={false}
            className="map"
          >
            <MapResizeHandler />

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {districts && (
              <GeoJSON
                data={districts}
                style={{
                  color: "#0f8f89",
                  weight: 2,
                  opacity: 0.9,
                  fillColor: "#18a39b",
                  fillOpacity: 0.08,
                }}
                onEachFeature={addDistrictPopup}
              />
            )}

            {stations && (
              <GeoJSON
                data={stations}
                pointToLayer={(_, latlng) =>
                  L.circleMarker(latlng, {
                    radius: 4,
                    color: "#ffffff",
                    weight: 1,
                    fillColor: "#1677a8",
                    fillOpacity: 0.9,
                  })
                }
                onEachFeature={addStationPopup}
              />
            )}

            <ZoomControl position="bottomright" />
            <ScaleControl position="bottomleft" />
          </MapContainer>

          <div className="map-title">
            <strong>Berlin charging coverage</strong>
            <span>EPSG:4326 web map</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

   