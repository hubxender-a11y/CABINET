"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { apiRequest, AUTH_TOKEN_KEY } from "@/lib/api";

type LoginResponse = {
  accessToken: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const expired = new URLSearchParams(window.location.search).get("reason") === "session-expired";
    if (!expired) return;
    window.history.replaceState(null, "", "/login");
    const timer = window.setTimeout(() => setSessionExpired(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.localStorage.setItem(AUTH_TOKEN_KEY, result.accessToken);
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connexion impossible. Vérifiez vos identifiants.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-[75vh] items-center justify-center">
      <form
        onSubmit={submit}
        className="login-card w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-7 shadow-lg"
      >
        <div className="login-brand">
          <Image
            src="/branding/ctrs-logo.jpg"
            alt="Cabinet Transparency"
            width={369}
            height={85}
            priority
            className="app-brand-logo"
            style={{ width: "100%", height: "auto" }}
          />
        </div>
        <div className="login-heading">
          <p className="login-eyebrow">Espace sécurisé</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Connexion au cabinet
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Utilisez le compte d’équipe créé par l’administrateur du cabinet.
          </p>
        </div>
        {sessionExpired && (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Votre session a expiré. Reconnectez-vous; les dernières modifications refusées ne sont pas enregistrées.
          </p>
        )}
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Adresse email
          <input
            required
            autoComplete="username"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Mot de passe
          <input
            required
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="login-submit w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <span>{saving ? "Connexion…" : "Se connecter"}</span>
          {!saving && <ArrowRight className="h-4 w-4" />}
        </button>
        <div className="login-security-note">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <p>Aucun compte public ne peut être créé depuis cette page.</p>
        </div>
      </form>
    </main>
  );
}
