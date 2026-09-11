const API_BASE_URL =
  "http://127.0.0.1:8000";

export type DistrictStatisticsProperties = {
  name: string;
  area_km2: number;
  station_count: number;
  proposal_count: number;
  stations_per_km2: number;
  density_rank: number;
};

export type DistrictStatisticsFeature = {
  type: "Feature";
  id: number;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
  properties: DistrictStatisticsProperties;
};

export type DistrictStatisticsCollection = {
  type: "FeatureCollection";
  features: DistrictStatisticsFeature[];
};

export async function getDistrictStatistics(): Promise<DistrictStatisticsCollection> {
  const response = await fetch(
    `${API_BASE_URL}/api/analysis/district-statistics`,
  );

  if (!response.ok) {
    throw new Error(
      `District analysis failed with status ${response.status}`,
    );
  }

  return response.json();
}

export function getDensityColour(
  density: number,
): string {
  if (density < 1.25) {
    return "#edf8fb";
  }

  if (density < 1.75) {
    return "#b3cde3";
  }

  if (density < 2.5) {
    return "#8c96c6";
  }

  if (density < 4) {
    return "#8856a7";
  }

  return "#810f7c";
}
