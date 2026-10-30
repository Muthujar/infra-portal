// A small helper for calling the backend API.
// It adds the login token to every call and turns error responses into readable messages.

const TOKEN_KEY = "infra-portal-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, method: string = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  const response = await fetch("/api" + path, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // Build a friendly message from the API's { error, details } response.
    let message = "Request failed";
    if (data && data.error) {
      message = data.error;
    }
    if (data && data.details) {
      message = message + ": " + data.details.join(", ");
    }

    // Token expired or invalid: log out.
    if (response.status === 401 && path !== "/auth/login") {
      clearToken();
      window.location.href = "/login";
    }
    throw new ApiError(response.status, message);
  }

  return data as T;
}
