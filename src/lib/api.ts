import { expireSession, getSessionToken } from "@/lib/session";

export { AUTH_TOKEN_KEY } from "@/lib/session";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

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

const serverUnavailable = "Le serveur du cabinet est temporairement indisponible. Réessayez dans quelques instants.";

async function request<T>(
  path: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const publicRequest = path === "/auth/login" || path === "/auth/health";
  const token = typeof window === "undefined" || publicRequest ? null : getSessionToken();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const timeout = AbortSignal.timeout(85_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers, signal });
    if (response.status === 401 && token && process.env.NEXT_PUBLIC_API_URL) {
      expireSession(token);
    }
    if (!response.ok) {
      const body = response.headers.get("content-type")?.includes("application/json")
        ? await response.json().catch(() => null)
        : null;
      const message = Array.isArray(body?.message)
        ? body.message.join(" ")
        : typeof body?.message === "string" ? body.message : null;
      throw new ApiRequestError(
        response.status >= 500 ? serverUnavailable : message || `La requête a échoué (HTTP ${response.status}).`,
        response.status,
        path,
      );
    }
    return await read(response);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new ApiRequestError("Le serveur met trop de temps à répondre. Vérifiez l’état de l’opération avant de la relancer.", 504, path);
    }
    if (error instanceof TypeError) {
      throw new ApiRequestError(serverUnavailable, 503, path);
    }
    throw error;
  }
}

export function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request(path, init, (response) => {
    if (response.status === 204) return Promise.resolve(undefined as T);
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new ApiRequestError(serverUnavailable, 503, path);
    }
    return response.json();
  });
}

export function apiRequestForm<T>(path: string, formData: FormData): Promise<T> {
  return request(path, { method: "POST", body: formData }, (response) => {
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new ApiRequestError(serverUnavailable, 503, path);
    }
    return response.json();
  });
}

export function apiRequestBlob(path: string, download = false): Promise<Blob> {
  const requestPath = download ? `${path}?download=true` : path;
  return request(requestPath, {}, (response) => response.blob());
}
