"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Image from "next/image";
import { Building2, MapPin, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  companyDisplayName,
  companyLocation,
  useCompanyProfile,
  type CompanyProfile,
  type CompanyProfileChanges,
} from "@/components/company-profile";
import { useNotifications } from "@/components/notification-provider";
import { normalizeInvoiceTemplate } from "@/lib/invoice-template";

const identityFields = [
  ["legalName", "Raison sociale", true],
  ["tradeName", "Nom commercial"],
  ["sector", "Activité du cabinet"],
] as const;

const registrationFields = [
  ["rccm", "RCCM"],
  ["nin", "Identification nationale"],
  ["nif", "NIF"],
  ["taxId", "Autre identifiant fiscal"],
  ["taxRegime", "Régime fiscal"],
  ["vatStatus", "Situation TVA"],
] as const;

const locationFields = [
  ["address", "Adresse"],
  ["commune", "Commune"],
  ["city", "Ville"],
  ["province", "Province"],
] as const;

const contactFields = [
  ["phone", "Téléphone"],
  ["email", "E-mail du cabinet"],
] as const;

type FieldKey = Exclude<keyof CompanyProfileChanges, "invoiceTemplate">;

function toChanges(profile: CompanyProfile): CompanyProfileChanges {
  return {
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    rccm: profile.rccm,
    nin: profile.nin,
    nif: profile.nif,
    taxId: profile.taxId,
    address: profile.address,
    province: profile.province,
    city: profile.city,
    commune: profile.commune,
    phone: profile.phone,
    email: profile.email,
    sector: profile.sector,
    taxRegime: profile.taxRegime,
    vatStatus: profile.vatStatus,
    signatureName: profile.signatureName,
    signatureTitle: profile.signatureTitle,
    signatureDataUrl: profile.signatureDataUrl,
    currencyCode: profile.currencyCode,
    exchangeRateCdfPerUsd: profile.exchangeRateCdfPerUsd,
    invoiceTemplate: normalizeInvoiceTemplate(profile.invoiceTemplate),
  };
}

const maxSignatureDataUrlLength = 70_000;

function optimizeSignatureImage(file: File) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Sélectionnez un fichier image pour la signature."));
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("L’image de signature ne peut pas dépasser 5 Mo."));
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire l’image de signature."));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Le fichier sélectionné ne peut pas être décodé comme une image."));
      image.onload = () => {
        const scale = Math.min(1, 900 / image.width, 360 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Impossible de préparer l’image de signature."));
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length <= maxSignatureDataUrlLength) {
            resolve(dataUrl);
            return;
          }
        }
        reject(new Error("Cette image est trop détaillée. Choisissez une signature plus simple."));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { notify } = useNotifications();
  const {
    profile,
    loading,
    error: profileError,
    refreshProfile,
    saveProfile,
  } = useCompanyProfile();
  const [draft, setDraft] = useState<CompanyProfileChanges | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!profile) return;
    void Promise.resolve().then(() => setDraft(toChanges(profile)));
  }, [profile]);

  const isDirty = useMemo(
    () => Boolean(profile && draft && JSON.stringify(toChanges(profile)) !== JSON.stringify(draft)),
    [draft, profile],
  );

  const updateField = useCallback(
    <K extends FieldKey>(key: K, value: CompanyProfileChanges[K]) => {
      setDraft((current) => (current ? { ...current, [key]: value } : current));
      setMessage("");
    },
    [],
  );

  async function reload() {
    setError("");
    setMessage("");
    try {
      const current = await refreshProfile();
      setDraft(toChanges(current));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’actualiser le profil du cabinet.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !isDirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await saveProfile(draft);
      setDraft(toChanges(updated));
      setMessage(
        "Paramètres enregistrés. Le menu, le tableau de bord et les prochains documents utilisent maintenant ces informations.",
      );
      notify({
        type: "success",
        title: "Paramètres enregistrés",
        message: "Les informations du cabinet et la signature ont été confirmées en base.",
      });
    } catch (caught) {
      const reason =
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer les paramètres.";
      setError(reason);
      notify({ type: "error", title: "Paramètres non enregistrés", message: reason });
    } finally {
      setSaving(false);
    }
  }

  async function handleSignatureImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const signatureDataUrl = await optimizeSignatureImage(file);
      updateField("signatureDataUrl", signatureDataUrl);
      notify({
        type: "info",
        title: "Signature prête",
        message: "Pensez à enregistrer les modifications pour la sauvegarder dans le cabinet.",
      });
    } catch (caught) {
      const reason =
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer l’image de signature.";
      setError(reason);
      notify({ type: "error", title: "Image de signature refusée", message: reason });
    } finally {
      event.target.value = "";
    }
  }

  function renderFields(fields: readonly (readonly [FieldKey, string, ...boolean[]])[]) {
    return fields.map(([key, label, required]) => (
      <label key={key} className="space-y-2 text-sm font-medium text-slate-700">
        {label}{required ? " *" : ""}
        <input
          required={Boolean(required)}
          type={key === "email" ? "email" : "text"}
          maxLength={key === "address" ? 300 : key === "email" ? 160 : 180}
          value={draft?.[key] ?? ""}
          onChange={(event) => updateField(key, event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>
    ));
  }

  const displayName = draft?.tradeName?.trim() || draft?.legalName?.trim() || companyDisplayName(profile);
  const displayLocation = draft
    ? [draft.commune, draft.city, draft.province]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(", ") || "République Démocratique du Congo"
    : companyLocation(profile);

  return (
    <div className="space-y-6">
      <header className="workspace-page-heading flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Configuration du cabinet</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Identité & paramètres</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Une seule fiche de référence pour l’espace de travail, les tableaux de bord et les prochains documents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {(error || profileError) && (
        <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {error || profileError}
        </p>
      )}

      {loading && !draft ? (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Chargement du profil enregistré…</p>
      ) : draft ? (
        <form onSubmit={submit} className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Building2 className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-slate-900">Identité professionnelle</h2>
                <p className="text-sm text-slate-500">Le nom commercial est affiché dans l’application; la raison sociale reste la référence légale.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {renderFields(identityFields)}
              {renderFields(registrationFields)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MapPin className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-slate-900">Adresse et coordonnées</h2>
                <p className="text-sm text-slate-500">Utilisées dans l’espace de travail et les pieds des documents générés.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {renderFields(locationFields)}
              {renderFields(contactFields)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ShieldCheck className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-slate-900">Signature des factures</h2>
                <p className="text-sm text-slate-500">Configurez le signataire et son image. Le bloc de signature apparaît sur la facture et à l’impression.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Nom du signataire
                <input
                  type="text"
                  maxLength={120}
                  value={draft.signatureName ?? ""}
                  onChange={(event) => updateField("signatureName", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Nom et prénom"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Fonction
                <input
                  type="text"
                  maxLength={120}
                  value={draft.signatureTitle ?? ""}
                  onChange={(event) => updateField("signatureTitle", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Ex. Gérant, Associé"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                Image de signature
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleSignatureImage(event)}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-medium file:text-blue-700"
                />
                <span className="block text-xs font-normal leading-5 text-slate-500">
                  Formats image courants acceptés, maximum 5 Mo. L’image est optimisée pour la facture et enregistrée avec les paramètres du cabinet.
                </span>
              </label>
              {draft.signatureDataUrl && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <Image
                    src={draft.signatureDataUrl}
                    alt="Aperçu de la signature"
                    width={220}
                    height={90}
                    unoptimized
                    className="h-[90px] w-[220px] object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => updateField("signatureDataUrl", null)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Retirer l’image
                  </button>
                </div>
              )}
              {(draft.signatureName || draft.signatureTitle || draft.signatureDataUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    updateField("signatureName", null);
                    updateField("signatureTitle", null);
                    updateField("signatureDataUrl", null);
                  }}
                  className="justify-self-start text-sm font-medium text-rose-700 hover:text-rose-800 sm:col-span-2"
                >
                  Désactiver la signature sur les factures
                </button>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ShieldCheck className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-slate-900">Paramètres comptables</h2>
                <p className="text-sm text-slate-500">La devise principale est proposée par défaut aux prochaines saisies.</p>
              </div>
            </div>
            <label className="block max-w-md space-y-2 text-sm font-medium text-slate-700">
              Devise principale du cabinet
              <select
                value={draft.currencyCode}
                onChange={(event) => updateField("currencyCode", event.target.value as CompanyProfileChanges["currencyCode"])}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="CDF">Franc congolais (CDF)</option>
                <option value="USD">Dollar américain (USD)</option>
              </select>
              <span className="block text-xs font-normal leading-5 text-slate-500">
                Ce choix ne convertit ni ne modifie les factures, paiements ou charges déjà enregistrés. Le tableau de bord garde les montants séparés par devise.
              </span>
            </label>
            <label className="mt-5 block max-w-md space-y-2 text-sm font-medium text-slate-700">
              Taux de change manuel
              <span className="flex items-center gap-3">
                <span className="shrink-0 text-slate-600">1 USD =</span>
                <input
                  type="number"
                  min="0.000001"
                  max="999999999999"
                  step="0.000001"
                  inputMode="decimal"
                  value={draft.exchangeRateCdfPerUsd ?? ""}
                  onChange={(event) =>
                    updateField(
                      "exchangeRateCdfPerUsd",
                      event.target.value || null,
                    )
                  }
                  placeholder="Ex. 2800"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <span className="shrink-0 text-slate-600">CDF</span>
              </span>
              <span className="block text-xs font-normal leading-5 text-slate-500">
                Saisissez le taux appliqué par votre banque ou votre politique comptable; il n’est pas récupéré automatiquement. Les modifications sont historisées. Le taux de chaque facture sera figé à sa création pour afficher un équivalent indicatif sans modifier son montant comptable.
              </span>
              {profile?.exchangeRateAppliedAt && (
                <span className="block text-xs font-normal text-slate-500">
                  Dernière mise à jour :{" "}
                  {new Intl.DateTimeFormat("fr-CD", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Africa/Kinshasa",
                  }).format(new Date(profile.exchangeRateAppliedAt))}
                </span>
              )}
            </label>
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Aperçu de l’espace</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{displayName}</p>
            <p className="mt-1 text-sm text-slate-600">{displayLocation}</p>
            <p className="mt-1 text-xs text-slate-500">Devise principale : {draft.currencyCode}</p>
          </section>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <p className={`text-sm ${isDirty ? "font-medium text-amber-800" : "text-slate-500"}`}>
              {isDirty ? "Modifications non enregistrées" : "Toutes les modifications sont enregistrées"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!isDirty || saving}
                onClick={() => profile && setDraft(toChanges(profile))}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!isDirty || saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          Le profil du cabinet n’a pas pu être chargé. Vérifiez votre connexion, puis actualisez cette page.
        </div>
      )}
    </div>
  );
}
