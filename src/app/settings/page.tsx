"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Building2, RefreshCw, Save } from "lucide-react";
import { apiRequest } from "@/lib/api";

type CompanyProfile = {
  id: string;
  legalName: string;
  tradeName: string | null;
  rccm: string | null;
  nin: string | null;
  nif: string | null;
  taxId: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  commune: string | null;
  phone: string | null;
  email: string | null;
  sector: string | null;
  taxRegime: string | null;
  vatStatus: string | null;
  currencyCode: "CDF" | "USD";
};

const textFields = [
  ["legalName", "Raison sociale", true],
  ["tradeName", "Nom commercial"],
  ["rccm", "RCCM"],
  ["nin", "N° d’identification nationale"],
  ["nif", "NIF"],
  ["taxId", "Autre identifiant fiscal"],
  ["address", "Adresse"],
  ["province", "Province"],
  ["city", "Ville"],
  ["commune", "Commune"],
  ["phone", "Téléphone"],
  ["email", "E-mail du cabinet"],
  ["sector", "Secteur d’activité"],
  ["taxRegime", "Régime fiscal"],
  ["vatStatus", "Situation TVA"],
] as const;

type TextFieldKey = (typeof textFields)[number][0];

export default function SettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProfile(await apiRequest<CompanyProfile>("/company"));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger le profil du cabinet.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadProfile);
  }, [loadProfile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");
    setMessage("");
    const changes = Object.fromEntries(
      Object.entries(profile).filter(([key]) => key !== "id"),
    );
    try {
      const updated = await apiRequest<CompanyProfile>("/company", {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setProfile(updated);
      setMessage("Les coordonnées et paramètres du cabinet ont été enregistrés.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’enregistrer les paramètres.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Configuration</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Paramètres du cabinet</h1>
          <p className="mt-2 text-sm text-slate-500">Ces informations servent sur les documents et dans le suivi comptable.</p>
        </div>
        <button type="button" onClick={() => void loadProfile()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {loading && !profile ? (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Chargement des informations du cabinet…</p>
      ) : profile ? (
        <form onSubmit={saveProfile} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Building2 className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-slate-900">Identité et coordonnées</h2>
                <p className="text-sm text-slate-500">Renseignez les données légales et les contacts du cabinet.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {textFields.map(([key, label, required]) => (
                <label key={key} className="space-y-2 text-sm font-medium text-slate-700">
                  {label}{required ? " *" : ""}
                  <input
                    required={Boolean(required)}
                    type={key === "email" ? "email" : "text"}
                    maxLength={key === "address" ? 300 : key === "email" ? 160 : 180}
                    value={profile[key as TextFieldKey] ?? ""}
                    onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                  />
                </label>
              ))}
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Devise principale
                <select value={profile.currencyCode} onChange={(event) => setProfile({ ...profile, currencyCode: event.target.value as CompanyProfile["currencyCode"] })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <option value="CDF">Franc congolais (CDF)</option>
                  <option value="USD">Dollar américain (USD)</option>
                </select>
              </label>
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
            </button>
            <p className="text-xs text-slate-500">La modification est réservée à l’administrateur du cabinet.</p>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Les données du cabinet ne sont pas disponibles. Corrigez l’erreur ci-dessus puis actualisez.
        </div>
      )}
    </div>
  );
}
