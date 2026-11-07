export const AUTH_TOKEN_KEY = "factura-access-token";
export const SESSION_EXPIRED_EVENT = "factura-auth-expired";
const SESSION_CHANGED_EVENT = "factura-session-changed";

export function getSessionToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function subscribeToSession(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === AUTH_TOKEN_KEY || event.key === null) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
  };
}

export function setSessionToken(token: string | null) {
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function expireSession(token: string | null) {
  if (!token || getSessionToken() !== token) return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  setSessionToken(null);
}

export function sessionExpiration(token: string) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}
