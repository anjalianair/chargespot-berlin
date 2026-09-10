const API_BASE_URL = "http://127.0.0.1:8000";

export type User = {
  id: string;
  display_name: string;
  email: string;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
};

type RegisterData = {
  display_name: string;
  email: string;
  password: string;
};

type LoginData = {
  email: string;
  password: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();

    if (typeof body.detail === "string") {
      return body.detail;
    }

    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item: { msg?: string }) => item.msg ?? "Invalid input")
        .join(", ");
    }
  } catch {
    // The API did not return JSON.
  }

  return `Request failed with status ${response.status}`;
}

export async function registerUser(data: RegisterData): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function loginUser(data: LoginData): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}
export type NearestStationResult = {
  query_location: {
    type: "Point";
    coordinates: [number, number];
  };
  nearest_station: {
    type: "Feature";
    id: number;
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      source_id: string | null;
      name: string | null;
      operator: string | null;
      charger_type: string | null;
      power_kw: number | null;
      address: string | null;
      distance_m: number;
    };
  };
};

export async function findNearestStation(
  longitude: number,
  latitude: number,
  token: string,
): Promise<NearestStationResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/analysis/nearest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        longitude,
        latitude,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}