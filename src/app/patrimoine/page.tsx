"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  BadgeCheck,
  Building2,
  Clock3,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

type MovementType =
  "ASSIGNMENT" | "TRANSFER" | "MAINTENANCE" | "RETURN" | "DISPOSAL";

type AssetMovement = {
  id: string;
  movementType: string;
  movementDate: string;
  fromAssignee: string | null;
  toAssignee: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  description: string | null;
};

type FixedAsset = {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  serialNumber: string | null;
  acquiredAt: string;
  acquisitionCost: string;
  residualValue: string;
  usefulLifeMonths: number;
  currency: string;
  status: string;
  assignedTo: string | null;
  location: string | null;
  notes: string | null;
  accumulatedDepreciation: string;
  netBookValue: string;
  movements: AssetMovement[];
};

const movementOptions: { value: MovementType; label: string }[] = [
  { value: "ASSIGNMENT", label: "Affectation à un membre" },
  { value: "TRANSFER", label: "Transfert de bureau" },
  { value: "MAINTENANCE", label: "Mise en maintenance" },
  { value: "RETURN", label: "Retour en service" },
  { value: "DISPOSAL", label: "Sortie du parc" },
];

function formatAmount(value: string | number, currency: string) {
  return new Intl.NumberFormat("fr-CD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function statusLabel(status: string) {
  return status === "ACTIVE"
    ? "En service"
    : status === "MAINTENANCE"
      ? "En maintenance"
      : "Sorti du parc";
}

export default function PatrimoinePage() {
  const today = useKinshasaDate() ?? "";
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetStatus, setAssetStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [movementAsset, setMovementAsset] = useState<FixedAsset | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("ASSIGNMENT");
  const [expandedAssetId, setExpandedAssetId] = useState("");
  const [assetNumber, setAssetNumber] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [residualValue, setResidualValue] = useState("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const [currency, setCurrency] = useState("CDF");
  const [assignedTo, setAssignedTo] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [movementDate, setMovementDate] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAssets(await apiRequest<FixedAsset[]>("/fixed-assets"));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger le registre du patrimoine.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAssets);
  }, [loadAssets]);

  useEffect(() => {
    void apiRequest<{ role: string }>("/auth/me")
      .then((user) => setUserRole(user.role))
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Impossible de vérifier les accès du compte.",
        );
      });
  }, []);

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(editingAsset ? `/fixed-assets/${editingAsset.id}` : "/fixed-assets", {
        method: editingAsset ? "PATCH" : "POST",
        body: JSON.stringify({
          assetNumber: assetNumber.trim(),
          name: name.trim(),
          category: category.trim(),
          acquiredAt,
          acquisitionCost,
          residualValue,
          usefulLifeMonths: Number(usefulLifeMonths),
          currency,
          serialNumber: serialNumber.trim(),
          assignedTo: assignedTo.trim(),
          location: location.trim(),
          notes: notes.trim(),
        }),
      });
      setMessage(editingAsset ? "La fiche matériel a été mise à jour." : "Le matériel a été ajouté au registre.");
      resetAssetForm();
      await loadAssets();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’enregistrer ce matériel.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movementAsset) return;
    setSaving(true);
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const assignee = String(formData.get("assignedTo") ?? "").trim();
    const destination = String(formData.get("location") ?? "").trim();
    const description = movementDescription.trim();
    try {
      await apiRequest(`/fixed-assets/${movementAsset.id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          movementType,
          movementDate,
          ...(movementType === "ASSIGNMENT" ? { assignedTo: assignee } : {}),
          ...(movementType === "TRANSFER" ? { location: destination } : {}),
          ...(description ? { description } : {}),
        }),
      });
      setMovementAsset(null);
      setMovementDescription("");
      setMessage("Le mouvement du matériel a été enregistré.");
      await loadAssets();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’enregistrer ce mouvement.",
      );
    } finally {
      setSaving(false);
    }
  }

  function editAsset(asset: FixedAsset) {
    setEditingAsset(asset);
    setAssetNumber(asset.assetNumber);
    setName(asset.name);
    setCategory(asset.category);
    setSerialNumber(asset.serialNumber ?? "");
    setAcquiredAt(asset.acquiredAt.slice(0, 10));
    setAcquisitionCost(asset.acquisitionCost);
    setResidualValue(asset.residualValue);
    setUsefulLifeMonths(String(asset.usefulLifeMonths));
    setCurrency(asset.currency);
    setAssignedTo(asset.assignedTo ?? "");
    setLocation(asset.location ?? "");
    setNotes(asset.notes ?? "");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetAssetForm() {
    setEditingAsset(null);
    setAssetNumber("");
    setName("");
    setCategory("");
    setSerialNumber("");
    setAcquiredAt("");
    setAcquisitionCost("");
    setResidualValue("0");
    setUsefulLifeMonths("60");
    setCurrency("CDF");
    setAssignedTo("");
    setLocation("");
    setNotes("");
    setShowForm(false);
  }

  function printInventoryReport() {
    if (!reportFrom || !reportTo || reportFrom > reportTo) {
      setError("Choisissez une période valide pour l’état du matériel.");
      return;
    }
    setError("");
    document.body.classList.add("print-asset-report-mode");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("print-asset-report-mode"),
      { once: true },
    );
    window.print();
  }

  const activeCount = assets.filter(
    (asset) => asset.status === "ACTIVE",
  ).length;
  const maintenanceCount = assets.filter(
    (asset) => asset.status === "MAINTENANCE",
  ).length;
  const disposedCount = assets.filter(
    (asset) => asset.status === "DISPOSED",
  ).length;
  const search = assetSearch.trim().toLocaleLowerCase("fr");
  const visibleAssets = assets.filter((asset) =>
    (!assetStatus || asset.status === assetStatus) &&
    [asset.assetNumber, asset.name, asset.category, asset.serialNumber, asset.assignedTo, asset.location]
      .join(" ").toLocaleLowerCase("fr").includes(search),
  );
  const periodMovements = assets.flatMap((asset) =>
    asset.movements
      .filter((movement) => {
        const date = movement.movementDate.slice(0, 10);
        return date >= reportFrom && date <= reportTo;
      })
      .map((movement) => ({ asset, movement })),
  ).sort((a, b) => b.movement.movementDate.localeCompare(a.movement.movementDate));
  const activeValues = new Map<string, number>();
  for (const asset of assets) {
    if (asset.status === "DISPOSED") continue;
    activeValues.set(asset.currency, (activeValues.get(asset.currency) ?? 0) + Number(asset.netBookValue));
  }

  return (
    <div className="space-y-6">
      <header className="asset-page-header">
        <div>
          <p className="asset-page-eyebrow">
            Équipements, mobilier & matériel du cabinet
          </p>
          <h1>Matériel du cabinet</h1>
          <p>
            Inventoriez les équipements, suivez leur état, leur affectation et
            chaque mouvement du cabinet.
          </p>
        </div>
        <div className="asset-page-actions">
          <button
            type="button"
            onClick={() => void loadAssets()}
            disabled={loading}
            aria-label="Actualiser le patrimoine"
            className="asset-refresh-button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
            userRole,
          ) && (
            <button
              type="button"
            onClick={() => {
              if (showForm) {
                resetAssetForm();
              } else {
                if (!acquiredAt) setAcquiredAt(today);
                setShowForm(true);
              }
            }}
              className="asset-add-button"
            >
              <Plus className="h-4 w-4" />{" "}
              {showForm ? "Fermer" : "Ajouter du matériel"}
            </button>
          )}
        </div>
      </header>

      {message && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}

      <section className="asset-stat-grid" aria-label="Résumé du patrimoine">
        {[
          {
            label: "Matériels inventoriés",
            value: assets.length,
            icon: Building2,
            tone: "is-blue",
          },
          {
            label: "En service",
            value: activeCount,
            icon: BadgeCheck,
            tone: "is-green",
          },
          {
            label: "En maintenance",
            value: maintenanceCount,
            icon: Wrench,
            tone: "is-amber",
          },
          {
            label: "Sortis du parc",
            value: disposedCount,
            icon: Archive,
            tone: "is-slate",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <article
              key={stat.label}
              className={`asset-stat-card ${stat.tone}`}
            >
              <span className="asset-stat-icon">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
              </div>
            </article>
          );
        })}
      </section>

      {activeValues.size > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Valeurs nettes par devise">
          <h2 className="font-semibold">Valeur nette indicative du matériel détenu</h2>
          <ul className="mt-2 flex flex-wrap gap-3 text-sm tabular-nums">
            {[...activeValues].map(([code, value]) => <li key={code} className="rounded-lg bg-slate-100 px-3 py-2">{formatAmount(value, code)}</li>)}
          </ul>
        </section>
      )}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end print:hidden" aria-label="État périodique du matériel">
        <div className="sm:col-span-4">
          <h2 className="font-semibold text-slate-900">État périodique du matériel</h2>
          <p className="mt-1 text-sm text-slate-500">Imprimez l’inventaire et les mouvements de la période avec une note pour la Direction.</p>
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Du
          <input type="date" value={reportFrom} max={reportTo || today || undefined} onChange={(event) => setReportFrom(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Au
          <input type="date" value={reportTo} min={reportFrom || undefined} max={today || undefined} onChange={(event) => setReportTo(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Note sur l’état du matériel
          <textarea maxLength={500} rows={2} value={reportNote} onChange={(event) => setReportNote(event.target.value)} placeholder="Ex. deux ordinateurs à remplacer…" className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <button type="button" onClick={printInventoryReport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          <Printer className="h-4 w-4" /> Imprimer l’état
        </button>
      </section>

      {showForm &&
        ["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
          userRole,
        ) && (
          <form
            onSubmit={saveAsset}
            className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <h2 className="font-semibold text-slate-900 sm:col-span-2 xl:col-span-4">
              {editingAsset ? "Modifier la fiche matériel" : "Ajouter un matériel au parc"}
            </h2>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Numéro d’inventaire *
              <input
                required
                minLength={2}
                maxLength={60}
                value={assetNumber}
                onChange={(event) => setAssetNumber(event.target.value)}
                placeholder="Ex. MAT-2026-001"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Désignation *
              <input
                required
                minLength={2}
                maxLength={180}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Ordinateur portable"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Catégorie *
              <input
                required
                minLength={2}
                maxLength={80}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                list="cabinet-material-categories"
                placeholder="Choisir ou saisir une catégorie"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
              <datalist id="cabinet-material-categories">
                <option value="Informatique et numérique" />
                <option value="Mobilier de bureau" />
                <option value="Téléphonie" />
                <option value="Matériel de bureau" />
                <option value="Réseau et télécommunications" />
                <option value="Climatisation et ventilation" />
                <option value="Transport" />
                <option value="Sécurité" />
                <option value="Autres équipements" />
              </datalist>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Numéro de série
              <input
                maxLength={120}
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Date d’acquisition *
              <input
                required
                type="date"
                max={today || undefined}
                value={acquiredAt}
                onChange={(event) => setAcquiredAt(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Coût d’acquisition *
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={acquisitionCost}
                onChange={(event) => setAcquisitionCost(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Valeur résiduelle
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={residualValue}
                onChange={(event) => setResidualValue(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Durée d’usage (mois) *
              <input
                required
                type="number"
                min="12"
                max="600"
                step="1"
                value={usefulLifeMonths}
                onChange={(event) => setUsefulLifeMonths(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Devise *
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <option value="CDF">CDF</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Affecté à
              <input
                maxLength={160}
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                placeholder="Nom du membre du cabinet"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Bureau / emplacement
              <input
                maxLength={160}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Ex. Bureau comptabilité"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
              État, garantie ou observations
              <textarea
                maxLength={1000}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="État actuel, garantie, défaut constaté…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Enregistrement…" : editingAsset ? "Enregistrer les modifications" : "Enregistrer le matériel"}
              </button>
              <button
                type="button"
                onClick={resetAssetForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Registre du matériel
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tous les équipements et biens du cabinet, avec leur état et leur historique.
            </p>
          </div>
          <Building2 className="h-5 w-5 text-blue-600" />
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[2fr_1fr]">
          <label className="grid gap-1 text-sm">Rechercher un matériel
            <input type="search" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Inventaire, désignation, personne ou lieu" className="border px-3" />
          </label>
          <label className="grid gap-1 text-sm">État du matériel
            <select value={assetStatus} onChange={(event) => setAssetStatus(event.target.value)} className="border px-3">
              <option value="">Tous les états</option>
              {["ACTIVE", "MAINTENANCE", "DISPOSED"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </select>
          </label>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chargement du patrimoine…
          </p>
        ) : visibleAssets.length ? (
          <ul className="divide-y divide-slate-100">
            {visibleAssets.map((asset) => (
              <li key={asset.id}>
                <article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {asset.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {asset.assetNumber} · {asset.category}
                      {asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {asset.assignedTo ?? "Non affecté"} ·{" "}
                      {asset.location ?? "Lieu non précisé"}
                    </p>
                    {asset.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        État / observations : {asset.notes}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">
                      Valeur d’acquisition
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {formatAmount(asset.acquisitionCost, asset.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">
                      Amortissement estimé
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {formatAmount(
                        asset.accumulatedDepreciation,
                        asset.currency,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">
                      Valeur nette indicative
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatAmount(asset.netBookValue, asset.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {statusLabel(asset.status)} · {asset.usefulLifeMonths}{" "}
                      mois
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[
                      "COMPANY_ADMIN",
                      "ACCOUNTANT",
                      "FINANCE_MANAGER",
                    ].includes(userRole) && (
                      <button
                        type="button"
                        onClick={() => editAsset(asset)}
                        aria-label={`Modifier la fiche de ${asset.name}`}
                        title="Modifier la fiche"
                        className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {asset.status !== "DISPOSED" &&
                      [
                        "COMPANY_ADMIN",
                        "ACCOUNTANT",
                        "FINANCE_MANAGER",
                      ].includes(userRole) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMovementAsset(asset);
                            setMovementType("ASSIGNMENT");
                            setMovementDate(
                              today,
                            );
                          }}
                          aria-label={`Ajouter un mouvement pour ${asset.name}`}
                          title="Mouvement"
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Wrench className="h-4 w-4" />
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAssetId(
                          expandedAssetId === asset.id ? "" : asset.id,
                        )
                      }
                      aria-label={`Afficher l’historique de ${asset.name}`}
                      title="Historique"
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                      <Clock3 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
                {expandedAssetId === asset.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Historique des mouvements
                    </h3>
                    {asset.movements.length ? (
                      <ul className="mt-2 space-y-2">
                        {asset.movements.map((movement) => (
                          <li
                            key={movement.id}
                            className="flex flex-col justify-between gap-1 text-xs text-slate-600 sm:flex-row"
                          >
                            <span>
                              <strong className="font-medium text-slate-800">
                                {movementOptions.find(
                                  (option) =>
                                    option.value === movement.movementType,
                                )?.label ?? "Acquisition"}
                              </strong>
                              {movement.description
                                ? ` · ${movement.description}`
                                : ""}
                            </span>
                            <span>
                              {formatDate(movement.movementDate)}
                              {movement.toAssignee
                                ? ` · ${movement.toAssignee}`
                                : ""}
                              {movement.toLocation
                                ? ` · ${movement.toLocation}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        Aucun mouvement enregistré.
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {error ? "Registre indisponible" : assets.length ? "Aucun matériel ne correspond aux filtres" : "Aucun matériel enregistré"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ajoutez les équipements, meubles, appareils et autres biens du cabinet.
            </p>
          </div>
        )}
      </section>

      <div className="asset-inventory-print">
        <header className="asset-inventory-print-header">
          <p>CABINET TRANSPARENCY · PATRIMOINE</p>
          <h1>État du matériel du cabinet</h1>
          <p>Période suivie : {reportFrom || "—"} au {reportTo || "—"}</p>
          <p>Situation du parc au {today || "—"}</p>
        </header>
        <section>
          <h2>Inventaire du parc · {assets.length} matériel(s)</h2>
          <table>
            <thead><tr><th>N° inventaire</th><th>Désignation</th><th>Catégorie</th><th>État</th><th>Affecté à / lieu</th><th>Valeur nette indicative</th></tr></thead>
            <tbody>{assets.map((asset) => <tr key={asset.id}><td>{asset.assetNumber}</td><td>{asset.name}{asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ""}</td><td>{asset.category}</td><td>{statusLabel(asset.status)}</td><td>{asset.assignedTo || "Non affecté"}{asset.location ? ` · ${asset.location}` : ""}</td><td>{formatAmount(asset.netBookValue, asset.currency)}</td></tr>)}</tbody>
          </table>
        </section>
        <section>
          <h2>Mouvements pendant la période · {periodMovements.length}</h2>
          {periodMovements.length ? <table><thead><tr><th>Date</th><th>Matériel</th><th>Événement</th><th>Détail</th></tr></thead><tbody>{periodMovements.map(({ asset, movement }) => <tr key={movement.id}><td>{formatDate(movement.movementDate)}</td><td>{asset.assetNumber} · {asset.name}</td><td>{movementOptions.find((option) => option.value === movement.movementType)?.label ?? "Acquisition"}</td><td>{movement.description || movement.toAssignee || movement.toLocation || "—"}</td></tr>)}</tbody></table> : <p>Aucun mouvement enregistré pour cette période.</p>}
        </section>
        <section className="asset-inventory-print-note"><h2>Note à la Direction</h2><p>{reportNote.trim() || "Aucune note communiquée."}</p></section>
        <footer>Document de suivi interne · Valeurs indicatives, sans génération d’écritures comptables.</footer>
      </div>

      {movementAsset &&
        ["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
          userRole,
        ) && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-movement-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <form
              onSubmit={saveMovement}
              className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
            >
              <div>
                <h2
                  id="asset-movement-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Mouvement du matériel
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {movementAsset.assetNumber} · {movementAsset.name}
                </p>
              </div>
              <label className="block space-y-2 text-sm font-medium text-slate-700">
                Événement *
                <select
                  value={movementType}
                  onChange={(event) =>
                    setMovementType(event.target.value as MovementType)
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  {movementOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium text-slate-700">
                Date du mouvement *
                <input
                  required
                  type="date"
                  max={today || undefined}
                  value={movementDate}
                  onChange={(event) => setMovementDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
              {movementType === "ASSIGNMENT" && (
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  Affecter à *
                  <input
                    required
                    name="assignedTo"
                    maxLength={160}
                    defaultValue={movementAsset.assignedTo ?? ""}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>
              )}
              {movementType === "TRANSFER" && (
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  Lieu de destination *
                  <input
                    required
                    name="location"
                    maxLength={160}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>
              )}
              {["MAINTENANCE", "RETURN", "DISPOSAL"].includes(movementType) && (
                <label className="block space-y-2 text-sm font-medium text-slate-700">
                  Commentaire requis *
                  <textarea
                    required
                    value={movementDescription}
                    onChange={(event) =>
                      setMovementDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMovementAsset(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        )}
    </div>
  );
}
