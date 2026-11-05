"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AUTH_TOKEN_KEY } from "@/lib/api";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(!process.env.NEXT_PUBLIC_API_URL);

  useEffect(() => {
    const handleExpiredSession = () =>
      router.replace("/login?reason=session-expired");
    window.addEventListener("factura-auth-expired", handleExpiredSession);
    const timer = window.setTimeout(() => {
      if (!process.env.NEXT_PUBLIC_API_URL) {
        setReady(true);
        return;
      }
      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (pathname !== "/login" && !token) {
        router.replace("/login");
        return;
      }
      if (pathname === "/login" && token) {
        router.replace("/");
        return;
      }
      setReady(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("factura-auth-expired", handleExpiredSession);
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Vérification de la session…
      </div>
    );
  }
  return children;
}
