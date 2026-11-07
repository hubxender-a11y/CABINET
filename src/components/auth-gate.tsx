"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import {
  expireSession,
  getSessionToken,
  sessionExpiration,
  SESSION_EXPIRED_EVENT,
  subscribeToSession,
} from "@/lib/session";

const requiresSession = Boolean(process.env.NEXT_PUBLIC_API_URL);
const getServerSession = () => undefined;
const expiredSession = Symbol("expired session");

function getBrowserSession(): string | typeof expiredSession | null {
  const token = getSessionToken();
  return token && sessionExpiration(token) <= Date.now() ? expiredSession : token;
}

function returnPath() {
  const requested = new URLSearchParams(window.location.search).get("next");
  if (!requested?.startsWith("/")) return "/";
  const target = new URL(requested, window.location.origin);
  return target.origin === window.location.origin && target.pathname !== "/login"
    ? target.pathname + target.search + target.hash
    : "/";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useSyncExternalStore<string | typeof expiredSession | null | undefined>(
    subscribeToSession,
    getBrowserSession,
    getServerSession,
  );
  const expired = useRef(false);
  const isLogin = pathname === "/login";

  useEffect(() => {
    const onExpired = () => { expired.current = true; };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    if (!requiresSession || !token) return;
    if (token === expiredSession) {
      expireSession(getSessionToken());
      return;
    }
    const timeout = window.setTimeout(() => expireSession(token), Math.max(0, sessionExpiration(token) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [token]);

  useEffect(() => {
    if (!requiresSession || token === undefined || token === expiredSession) return;
    if (!isLogin && !token) {
      const query = new URLSearchParams();
      if (expired.current) {
        query.set("reason", "session-expired");
        expired.current = false;
      }
      if (pathname !== "/") query.set("next", pathname + window.location.search);
      router.replace(query.size ? `/login?${query}` : "/login");
    } else if (isLogin && token) {
      router.replace(returnPath());
    }
  }, [isLogin, pathname, router, token]);

  if (!requiresSession) return children;
  if (isLogin ? token === null : typeof token === "string") {
    return <Fragment key={typeof token === "string" ? token : "login"}>{children}</Fragment>;
  }
  return (
    <div role="status" className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Vérification de la session…
    </div>
  );
}
