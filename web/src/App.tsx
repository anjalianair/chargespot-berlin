import { useCallback, useEffect, useState } from "react";
import L, { type Layer } from "leaflet";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
  Polygon,
} from "geojson";
import { buffer, distance, point } from "@turf/turf";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  ScaleControl,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./App.css";

import AuthPanel from "./components/AuthPanel";
import {
  findNearestStation,
  type NearestStationResult,
  type User,
} from "./api";

const DISTRICTS_URL =
  "http://127.0.0.1:9000/collections/api.district_public/items.json?limit=12";

const STATIONS_FIRST_PAGE_URL =
  "http://127.0.0.1:9000/collections/api.charging_station_public/items.json?limit=1000&offset=0";

const STATIONS_SECOND_PAGE_URL =
  "http://127.0.0.1:9000/collections/api.charging_station_public/items.json?limit=1000&offset=1000";

type CoverageClassification =
  | "Potential coverage gap"
  | "Limited coverage"
  | "Moderate coverage"
  | "Well covered";

type CandidateAnalysis = {
  latitude: number;
  longitude: number;
  stationsWithinOneKm: number;
  nearestDistanceMetres: number;
  classification: CoverageClassification;
};

type CandidateResult = {
  analysis: CandidateAnalysis;
  coverageBuffer: Feature<Polygon | MultiPolygon> | null;
};

type ServerAnalysisStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

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
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
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
        <dd>
          ${
            power !== null &&
            power !== undefined &&
            power !== ""
              ? `${escapeHtml(power)} kW`
              : "Not available"
          }
        </dd>

        <dt>Address</dt>
        <dd>${displayValue(address)}</dd>
      </dl>
    </div>
  `);
}

function classifyCoverage(
  stationsWithinOneKm: number,
  nearestDistanceMetres: number,
): CoverageClassification {
  if (
    stationsWithinOneKm === 0 &&
    nearestDistanceMetres >= 1000
  ) {
    return "Potential coverage gap";
  }

  if (
    stationsWithinOneKm <= 2 ||
    nearestDistanceMetres >= 750
  ) {
    return "Limited coverage";
  }

  if (stationsWithinOneKm <= 10) {
    return "Moderate coverage";
  }

  return "Well covered";
}

function calculateCandidateAnalysis(
  latitude: number,
  longitude: number,
  stations: FeatureCollection,
): CandidateResult {
  const candidatePoint = point([longitude, latitude]);

  let nearestDistanceKilometres =
    Number.POSITIVE_INFINITY;

  let stationsWithinOneKm = 0;

  for (const station of stations.features) {
    if (station.geometry?.type !== "Point") {
      continue;
    }

    const stationLongitude = Number(
      station.geometry.coordinates[0],
    );

    const stationLatitude = Number(
      station.geometry.coordinates[1],
    );

    if (
      !Number.isFinite(stationLongitude) ||
      !Number.isFinite(stationLatitude)
    ) {
      continue;
    }

    const stationPoint = point([
      stationLongitude,
      stationLatitude,
    ]);

    const stationDistance = distance(
      candidatePoint,
      stationPoint,
      {
        units: "kilometers",
      },
    );

    if (stationDistance <= 1) {
      stationsWithinOneKm += 1;
    }

    if (stationDistance < nearestDistanceKilometres) {
      nearestDistanceKilometres = stationDistance;
    }
  }

  const nearestDistanceMetres =
    nearestDistanceKilometres * 1000;

  const classification = classifyCoverage(
    stationsWithinOneKm,
    nearestDistanceMetres,
  );

  const generatedBuffer = buffer(
    candidatePoint,
    1,
    {
      units: "kilometers",
      steps: 64,
    },
  );

  return {
    analysis: {
      latitude,
      longitude,
      stationsWithinOneKm,
      nearestDistanceMetres,
      classification,
    },
    coverageBuffer: generatedBuffer ?? null,
  };
}

type CandidateSelectorProps = {
  stations: FeatureCollection;
  onCandidateSelected: (
    result: CandidateResult,
  ) => void;
};

function CandidateSelector({
  stations,
  onCandidateSelected,
}: CandidateSelectorProps) {
  useMapEvents({
    click(event) {
      const result = calculateCandidateAnalysis(
        event.latlng.lat,
        event.latlng.lng,
        stations,
      );

      onCandidateSelected(result);
    },
  });

  return null;
}

function App() {
  const [authenticatedUser, setAuthenticatedUser] =
    useState<User | null>(null);

  const [accessToken, setAccessToken] =
    useState<string | null>(null);

  const [districts, setDistricts] =
    useState<FeatureCollection | null>(null);

  const [stations, setStations] =
    useState<FeatureCollection | null>(null);

  const [candidate, setCandidate] =
    useState<CandidateAnalysis | null>(null);

  const [coverageBuffer, setCoverageBuffer] =
    useState<Feature<Polygon | MultiPolygon> | null>(
      null,
    );

  const [dataError, setDataError] =
    useState<string | null>(null);

  const [serverNearest, setServerNearest] =
    useState<NearestStationResult | null>(null);

  const [serverAnalysisStatus, setServerAnalysisStatus] =
    useState<ServerAnalysisStatus>("idle");

  const [serverAnalysisMessage, setServerAnalysisMessage] =
    useState("");

  const handleAuthenticationChange = useCallback(
    (user: User | null, token: string | null) => {
      setAuthenticatedUser(user);
      setAccessToken(token);

      if (!token) {
        setServerNearest(null);
        setServerAnalysisStatus("idle");
        setServerAnalysisMessage("");
      }
    },
    [],
  );

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

        if (
          !firstStationResponse.ok ||
          !secondStationResponse.ok
        ) {
          throw new Error(
            "One or more station requests failed",
          );
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

    void loadSpatialData();
  }, []);

  async function handleCandidateSelected(
    result: CandidateResult,
  ) {
    setCandidate(result.analysis);
    setCoverageBuffer(result.coverageBuffer);
    setServerNearest(null);

    if (!accessToken) {
      setServerAnalysisStatus("idle");
      setServerAnalysisMessage(
        "Log in to calculate the authoritative PostGIS distance.",
      );
      return;
    }

    setServerAnalysisStatus("loading");
    setServerAnalysisMessage("");

    try {
      const nearestResult = await findNearestStation(
        result.analysis.longitude,
        result.analysis.latitude,
        accessToken,
      );

      setServerNearest(nearestResult);
      setServerAnalysisStatus("success");
    } catch (error) {
      setServerNearest(null);
      setServerAnalysisStatus("error");
      setServerAnalysisMessage(
        error instanceof Error
          ? error.message
          : "Server analysis failed.",
      );
    }
  }

  function clearCandidate() {
    setCandidate(null);
    setCoverageBuffer(null);
    setServerNearest(null);
    setServerAnalysisStatus("idle");
    setServerAnalysisMessage("");
  }

  const districtCount =
    districts?.features.length ?? 0;

  const stationCount =
    stations?.features.length ?? 0;

  const spatialDataLoaded =
    districts !== null && stations !== null;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>ChargeSpot Berlin</h1>

          <p>
            Charging Coverage and Candidate-Site Screening
          </p>
        </div>

        <div className="header-status">
          <span className="status-dot" />

          {authenticatedUser
            ? `Logged in as ${authenticatedUser.display_name}`
            : dataError
              ? "Spatial service unavailable"
              : spatialDataLoaded
                ? "Spatial data connected"
                : "Loading spatial data"}
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section>
            <p className="section-label">
              PROJECT PURPOSE
            </p>

            <h2>Assess charging coverage</h2>

            <p>
              Explore Berlin&apos;s existing charging
              infrastructure and evaluate candidate
              locations for additional stations.
            </p>
          </section>

          <section className="analysis-placeholder">
            <p className="section-label">
              CLIENT-SIDE ANALYSIS
            </p>

            {candidate ? (
              <>
                <h3>{candidate.classification}</h3>

                <div className="analysis-metrics">
                  <div>
                    <span>Stations within 1 km</span>

                    <strong>
                      {candidate.stationsWithinOneKm}
                    </strong>
                  </div>

                  <div>
                    <span>Nearest station</span>

                    <strong>
                      {candidate.nearestDistanceMetres.toFixed(
                        0,
                      )}{" "}
                      m
                    </strong>
                  </div>
                </div>

                <div className="server-analysis">
                  <span className="server-analysis-label">
                    SERVER-SIDE POSTGIS ANALYSIS
                  </span>

                  {serverAnalysisStatus === "loading" && (
                    <p>Calculating exact distance…</p>
                  )}

                  {serverAnalysisStatus === "success" &&
                    serverNearest && (
                      <>
                        <strong>
                          {serverNearest.nearest_station.properties.distance_m.toFixed(
                            0,
                          )}{" "}
                          m
                        </strong>

                        <p>
                          Nearest:{" "}
                          {serverNearest.nearest_station
                            .properties.name ||
                            "Charging station"}
                        </p>
                      </>
                    )}

                  {serverAnalysisMessage && (
                    <p className="server-analysis-message">
                      {serverAnalysisMessage}
                    </p>
                  )}
                </div>

                <p className="coordinate-text">
                  Candidate:{" "}
                  {candidate.longitude.toFixed(5)},{" "}
                  {candidate.latitude.toFixed(5)}
                </p>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={clearCandidate}
                >
                  Clear candidate
                </button>
              </>
            ) : (
              <>
                <h3>Select a location</h3>

                <p>
                  Click on the map to create a
                  one-kilometre buffer and assess
                  existing charging coverage.
                </p>
              </>
            )}
          </section>

          <AuthPanel
            onAuthenticationChange={
              handleAuthenticationChange
            }
          />

          <section>
            <p className="section-label">
              DATA STATUS
            </p>

            {dataError ? (
              <p>{dataError}</p>
            ) : (
              <>
                <p>
                  Charging stations loaded:{" "}
                  <strong>
                    {stationCount.toLocaleString()}
                  </strong>
                </p>

                <p>
                  Berlin districts loaded:{" "}
                  <strong>{districtCount}</strong>
                </p>
              </>
            )}
          </section>

          <section>
            <p className="section-label">
              MAP LEGEND
            </p>

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

            <div className="legend-item">
              <span className="legend-symbol buffer-symbol" />
              One-kilometre assessment area
            </div>
          </section>

          <section>
            <p className="method-note">
              This screening evaluates existing
              infrastructure coverage. It does not model
              demand, grid capacity, land ownership or
              construction cost.
            </p>
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
                  bubblingMouseEvents: true,
                }}
                onEachFeature={addDistrictPopup}
                eventHandlers={{
                  click(event) {
                    if (!stations) {
                      return;
                    }

                    const result =
                      calculateCandidateAnalysis(
                        event.latlng.lat,
                        event.latlng.lng,
                        stations,
                      );

                    void handleCandidateSelected(result);
                  },
                }}
              />
            )}

            {coverageBuffer && (
              <GeoJSON
                key={`${candidate?.latitude}-${candidate?.longitude}`}
                data={coverageBuffer}
                style={{
                  color: "#e77728",
                  weight: 2,
                  dashArray: "7 5",
                  fillColor: "#f5a15f",
                  fillOpacity: 0.16,
                }}
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
                    bubblingMouseEvents: true,
                  })
                }
                onEachFeature={addStationPopup}
                eventHandlers={{
                  click(event) {
                    const result =
                      calculateCandidateAnalysis(
                        event.latlng.lat,
                        event.latlng.lng,
                        stations,
                      );

                    void handleCandidateSelected(result);
                  },
                }}
              />
            )}

            <Pane
              name="candidate-marker-pane"
              style={{
                zIndex: 650,
                pointerEvents: "none",
              }}
            >
              {candidate && (
                <CircleMarker
                  center={[
                    candidate.latitude,
                    candidate.longitude,
                  ]}
                  radius={10}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 4,
                    fillColor: "#e77728",
                    fillOpacity: 1,
                  }}
                />
              )}
            </Pane>

            {stations && (
              <CandidateSelector
                stations={stations}
                onCandidateSelected={(result) => {
                  void handleCandidateSelected(result);
                }}
              />
            )}

            <ZoomControl position="bottomright" />
            <ScaleControl position="bottomleft" />
          </MapContainer>

          <div className="map-title">
            <strong>Berlin charging coverage</strong>

            <span>
              Click the map to screen a candidate location
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
