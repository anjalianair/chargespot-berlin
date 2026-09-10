import {
  useCallback,
  useEffect,
  useState,
} from "react";
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
  Popup,
  ScaleControl,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./App.css";

import AuthPanel from "./components/AuthPanel";
import ProposalPanel from "./components/ProposalPanel";
import {
  findNearestStation,
  getMyProposals,
  type NearestStationResult,
  type ProposalFeature,
  type User,
} from "./api";

const DISTRICTS_URL =
  "http://127.0.0.1:9000/collections/api.district_public/items.json?limit=12";

const STATIONS_PAGE_ONE =
  "http://127.0.0.1:9000/collections/api.charging_station_public/items.json?limit=1000&offset=0";

const STATIONS_PAGE_TWO =
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
  coverageBuffer: Feature<
    Polygon | MultiPolygon
  > | null;
};

type ServerStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const updateSize = () => map.invalidateSize();

    const firstTimer = window.setTimeout(
      updateSize,
      100,
    );

    const secondTimer = window.setTimeout(
      updateSize,
      500,
    );

    window.addEventListener("resize", updateSize);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
      window.removeEventListener(
        "resize",
        updateSize,
      );
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

function displayValue(
  value: unknown,
  fallback = "Not available",
) {
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
  feature: Feature<
    Geometry,
    GeoJsonProperties
  >,
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
  feature: Feature<
    Geometry,
    GeoJsonProperties
  >,
  layer: Layer,
) {
  const properties = feature.properties ?? {};

  layer.bindPopup(`
    <div class="map-popup">
      <strong>
        ${displayValue(
          properties.name,
          "Charging station",
        )}
      </strong>

      <dl>
        <dt>Operator</dt>
        <dd>
          ${displayValue(properties.operator)}
        </dd>

        <dt>Charger type</dt>
        <dd>
          ${displayValue(
            properties.charger_type,
          )}
        </dd>

        <dt>Power</dt>
        <dd>
          ${
            properties.power_kw
              ? `${escapeHtml(
                  properties.power_kw,
                )} kW`
              : "Not available"
          }
        </dd>

        <dt>Address</dt>
        <dd>
          ${displayValue(properties.address)}
        </dd>
      </dl>
    </div>
  `);
}

function classifyCoverage(
  stationCount: number,
  nearestDistance: number,
): CoverageClassification {
  if (
    stationCount === 0 &&
    nearestDistance >= 1000
  ) {
    return "Potential coverage gap";
  }

  if (
    stationCount <= 2 ||
    nearestDistance >= 750
  ) {
    return "Limited coverage";
  }

  if (stationCount <= 10) {
    return "Moderate coverage";
  }

  return "Well covered";
}

function analyseCandidate(
  latitude: number,
  longitude: number,
  stations: FeatureCollection,
): CandidateResult {
  const candidatePoint = point([
    longitude,
    latitude,
  ]);

  let nearestKilometres =
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

    const stationDistance = distance(
      candidatePoint,
      point([
        stationLongitude,
        stationLatitude,
      ]),
      {
        units: "kilometers",
      },
    );

    if (stationDistance <= 1) {
      stationsWithinOneKm += 1;
    }

    if (stationDistance < nearestKilometres) {
      nearestKilometres = stationDistance;
    }
  }

  const nearestDistanceMetres =
    nearestKilometres * 1000;

  const coverageBuffer = buffer(
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
      classification: classifyCoverage(
        stationsWithinOneKm,
        nearestDistanceMetres,
      ),
    },
    coverageBuffer: coverageBuffer ?? null,
  };
}

type CandidateSelectorProps = {
  stations: FeatureCollection;
  onSelect: (result: CandidateResult) => void;
};

function CandidateSelector({
  stations,
  onSelect,
}: CandidateSelectorProps) {
  useMapEvents({
    click(event) {
      onSelect(
        analyseCandidate(
          event.latlng.lat,
          event.latlng.lng,
          stations,
        ),
      );
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
    useState<Feature<
      Polygon | MultiPolygon
    > | null>(null);

  const [serverNearest, setServerNearest] =
    useState<NearestStationResult | null>(
      null,
    );

  const [serverStatus, setServerStatus] =
    useState<ServerStatus>("idle");

  const [serverMessage, setServerMessage] =
    useState("");

  const [savedProposals, setSavedProposals] =
    useState<ProposalFeature[]>([]);

  const [proposalLoadMessage, setProposalLoadMessage] =
    useState("");

  const [dataError, setDataError] =
    useState<string | null>(null);

  const handleAuthenticationChange = useCallback(
    (user: User | null, token: string | null) => {
      setAuthenticatedUser(user);
      setAccessToken(token);

      if (!token) {
        setSavedProposals([]);
        setServerNearest(null);
        setServerStatus("idle");
        setServerMessage("");
      }
    },
    [],
  );

  useEffect(() => {
    async function loadSpatialData() {
      try {
        const [
          districtResponse,
          stationResponseOne,
          stationResponseTwo,
        ] = await Promise.all([
          fetch(DISTRICTS_URL),
          fetch(STATIONS_PAGE_ONE),
          fetch(STATIONS_PAGE_TWO),
        ]);

        if (
          !districtResponse.ok ||
          !stationResponseOne.ok ||
          !stationResponseTwo.ok
        ) {
          throw new Error(
            "A spatial-data request failed.",
          );
        }

        const districtData =
          (await districtResponse.json()) as FeatureCollection;

        const stationPageOne =
          (await stationResponseOne.json()) as FeatureCollection;

        const stationPageTwo =
          (await stationResponseTwo.json()) as FeatureCollection;

        setDistricts(districtData);

        setStations({
          type: "FeatureCollection",
          features: [
            ...stationPageOne.features,
            ...stationPageTwo.features,
          ],
        });

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

  useEffect(() => {
    let cancelled = false;

    if (!accessToken) {
      setSavedProposals([]);
      setProposalLoadMessage("");

      return () => {
        cancelled = true;
      };
    }

    async function loadSavedProposals() {
      try {
        const collection =
          await getMyProposals(accessToken!);

        if (!cancelled) {
          setSavedProposals(
            collection.features,
          );

          setProposalLoadMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setProposalLoadMessage(
            error instanceof Error
              ? error.message
              : "Saved proposals could not be loaded.",
          );
        }
      }
    }

    void loadSavedProposals();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleCandidateSelected(
    result: CandidateResult,
  ) {
    setCandidate(result.analysis);
    setCoverageBuffer(
      result.coverageBuffer,
    );

    setServerNearest(null);

    if (!accessToken) {
      setServerStatus("idle");

      setServerMessage(
        "Log in to calculate the authoritative PostGIS distance.",
      );

      return;
    }

    setServerStatus("loading");
    setServerMessage("");

    try {
      const resultFromServer =
        await findNearestStation(
          result.analysis.longitude,
          result.analysis.latitude,
          accessToken,
        );

      setServerNearest(resultFromServer);
      setServerStatus("success");
    } catch (error) {
      setServerStatus("error");

      setServerMessage(
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
    setServerStatus("idle");
    setServerMessage("");
  }

  function handleProposalCreated(
    proposal: ProposalFeature,
  ) {
    setSavedProposals((current) => [
      proposal,
      ...current.filter(
        (item) => item.id !== proposal.id,
      ),
    ]);
  }

  const districtCount =
    districts?.features.length ?? 0;

  const stationCount =
    stations?.features.length ?? 0;

  const spatialDataLoaded =
    districts !== null &&
    stations !== null;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>ChargeSpot Berlin</h1>

          <p>
            Charging Coverage and
            Candidate-Site Screening
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
              Explore Berlin&apos;s existing
              charging infrastructure and
              evaluate candidate locations
              for additional stations.
            </p>
          </section>

          <section className="analysis-placeholder">
            <p className="section-label">
              CLIENT-SIDE ANALYSIS
            </p>

            {candidate ? (
              <>
                <h3>
                  {candidate.classification}
                </h3>

                <div className="analysis-metrics">
                  <div>
                    <span>
                      Stations within 1 km
                    </span>

                    <strong>
                      {
                        candidate
                          .stationsWithinOneKm
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Nearest station
                    </span>

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

                  {serverStatus ===
                    "loading" && (
                    <p>
                      Calculating exact
                      distance…
                    </p>
                  )}

                  {serverStatus ===
                    "success" &&
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
                          {serverNearest
                            .nearest_station
                            .properties.name ||
                            "Charging station"}
                        </p>
                      </>
                    )}

                  {serverMessage && (
                    <p className="server-analysis-message">
                      {serverMessage}
                    </p>
                  )}
                </div>

                <p className="coordinate-text">
                  Candidate:{" "}
                  {candidate.longitude.toFixed(
                    5,
                  )}
                  ,{" "}
                  {candidate.latitude.toFixed(
                    5,
                  )}
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
                  Click on the map to create
                  a one-kilometre buffer and
                  assess existing charging
                  coverage.
                </p>
              </>
            )}
          </section>

          <AuthPanel
            onAuthenticationChange={
              handleAuthenticationChange
            }
          />

          <ProposalPanel
            candidate={candidate}
            accessToken={accessToken}
            onProposalCreated={
              handleProposalCreated
            }
          />

          {proposalLoadMessage && (
            <p className="form-message error">
              {proposalLoadMessage}
            </p>
          )}

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
                  <strong>
                    {districtCount}
                  </strong>
                </p>

                {authenticatedUser && (
                  <p>
                    My saved proposals:{" "}
                    <strong>
                      {savedProposals.length}
                    </strong>
                  </p>
                )}
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
              Current candidate
            </div>

            <div className="legend-item">
              <span className="legend-symbol saved-proposal-symbol" />
              My saved proposal
            </div>

            <div className="legend-item">
              <span className="legend-symbol buffer-symbol" />
              One-kilometre assessment area
            </div>
          </section>

          <section>
            <p className="method-note">
              This screening evaluates
              existing infrastructure coverage.
              It does not model demand, grid
              capacity, land ownership or
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
                onEachFeature={
                  addDistrictPopup
                }
                eventHandlers={{
                  click(event) {
                    if (!stations) {
                      return;
                    }

                    void handleCandidateSelected(
                      analyseCandidate(
                        event.latlng.lat,
                        event.latlng.lng,
                        stations,
                      ),
                    );
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
                onEachFeature={
                  addStationPopup
                }
                eventHandlers={{
                  click(event) {
                    void handleCandidateSelected(
                      analyseCandidate(
                        event.latlng.lat,
                        event.latlng.lng,
                        stations,
                      ),
                    );
                  },
                }}
              />
            )}

            <Pane
              name="saved-proposals-pane"
              style={{ zIndex: 625 }}
            >
              {savedProposals.map(
                (proposal) => (
                  <CircleMarker
                    key={proposal.id}
                    center={[
                      proposal.geometry
                        .coordinates[1],
                      proposal.geometry
                        .coordinates[0],
                    ]}
                    radius={8}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 3,
                      fillColor: "#7c3aed",
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <div className="map-popup">
                        <strong>
                          {
                            proposal.properties
                              .title
                          }
                        </strong>

                        <p>
                          {
                            proposal.properties
                              .justification
                          }
                        </p>

                        <dl>
                          <dt>
                            Charger type
                          </dt>

                          <dd>
                            {proposal
                              .properties
                              .suggested_charger_type ||
                              "Not specified"}
                          </dd>

                          <dt>Power</dt>

                          <dd>
                            {proposal
                              .properties
                              .suggested_power_kw
                              ? `${proposal.properties.suggested_power_kw} kW`
                              : "Not specified"}
                          </dd>

                          <dt>Status</dt>

                          <dd>
                            {
                              proposal.properties
                                .status
                            }
                          </dd>
                        </dl>
                      </div>
                    </Popup>
                  </CircleMarker>
                ),
              )}
            </Pane>

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
                onSelect={(result) => {
                  void handleCandidateSelected(
                    result,
                  );
                }}
              />
            )}

            <ZoomControl position="bottomright" />

            <ScaleControl position="bottomleft" />
          </MapContainer>

          <div className="map-title">
            <strong>
              Berlin charging coverage
            </strong>

            <span>
              Click the map to screen a
              candidate location
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;