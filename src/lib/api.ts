export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
export const AUTH_TOKEN_KEY = "factura-access-token";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem(AUTH_TOKEN_KEY)
      : null;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (
    response.status === 401 &&
    process.env.NEXT_PUBLIC_API_URL &&
    typeof window !== "undefined" &&
    path !== "/auth/login"
  ) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event("factura-auth-expired"));
  }
  if (!response.ok) {
    const body = await response.text();
    throw new ApiRequestError(
      `API ${response.status} sur ${path}: ${body || response.statusText}`,
      response.status,
      path,
    );
  }
  return response.json() as Promise<T>;
}

export async function apiRequestBlob(
  path: string,
  download = false,
): Promise<Blob> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem(AUTH_TOKEN_KEY)
      : null;
  const requestPath = download ? `${path}?download=true` : path;
  const response = await fetch(`${API_BASE}${requestPath}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (
    response.status === 401 &&
    process.env.NEXT_PUBLIC_API_URL &&
    typeof window !== "undefined"
  ) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event("factura-auth-expired"));
  }
  if (!response.ok) {
    const body = await response.text();
    throw new ApiRequestError(
      `API ${response.status} sur ${requestPath}: ${body || response.statusText}`,
      response.status,
      requestPath,
    );
  }
  return response.blob();
}
