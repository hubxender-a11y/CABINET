"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  BadgeCheck,
  Building2,
  Clock3,
  Plus,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

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
  { value: "DISPOSAL", label: "Sortie du patrimoine" },
];

function formatAmount(value: string, currency: string) {
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
      : "Sorti du patrimoine";
}

export default function PatrimoinePage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [movementAsset, setMovementAsset] = useState<FixedAsset | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("ASSIGNMENT");
  const [expandedAssetId, setExpandedAssetId] = useState("");
  const [assetNumber, setAssetNumber] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [acquiredAt, setAcquiredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [residualValue, setResidualValue] = useState("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const [currency, setCurrency] = useState("CDF");
  const [assignedTo, setAssignedTo] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [movementDate, setMovementDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
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

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/fixed-assets", {
        method: "POST",
        body: JSON.stringify({
          assetNumber: assetNumber.trim(),
          name: name.trim(),
          category: category.trim(),
          acquiredAt,
          acquisitionCost,
          residualValue,
          usefulLifeMonths: Number(usefulLifeMonths),
          currency,
          ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
          ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      setAssetNumber("");
      setName("");
      setCategory("");
      setSerialNumber("");
      setAcquisitionCost("");
      setResidualValue("0");
      setUsefulLifeMonths("60");
      setAssignedTo("");
      setLocation("");
      setNotes("");
      setShowForm(false);
      setMessage("Le bien a été ajouté au registre patrimonial.");
      await loadAssets();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’enregistrer ce bien.",
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
      setMessage("Le mouvement du bien a été enregistré.");
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

  const activeCount = assets.filter(
    (asset) => asset.status === "ACTIVE",
  ).length;
  const maintenanceCount = assets.filter(
    (asset) => asset.status === "MAINTENANCE",
  ).length;
  const disposedCount = assets.filter(
    (asset) => asset.status === "DISPOSED",
  ).length;

  return (
    <div className="space-y-6">
      <header className="asset-page-header">
        <div>
          <p className="asset-page-eyebrow">
            Stock, matériel & patrimoine · biens durables
          </p>
          <h1>Patrimoine du cabinet</h1>
          <p>
            Suivez les biens, leurs affectations et mouvements. La valeur nette
            est indicative et ne génère pas d’écritures comptables.
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
              onClick={() => setShowForm((open) => !open)}
              className="asset-add-button"
            >
              <Plus className="h-4 w-4" />{" "}
              {showForm ? "Fermer le formulaire" : "Nouveau bien"}
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
            label: "Biens inventoriés",
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
            label: "Sortis du patrimoine",
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

      {showForm &&
        ["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
          userRole,
        ) && (
          <form
            onSubmit={createAsset}
            className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <h2 className="font-semibold text-slate-900 sm:col-span-2 xl:col-span-4">
              Fiche du bien patrimonial
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
                placeholder="Informatique, mobilier…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
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
                max={new Date().toISOString().slice(0, 10)}
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
              Notes
              <input
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Enregistrement…" : "Enregistrer le bien"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
              Registre des immobilisations
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              L’inventaire de patrimoine reste distinct des stocks de
              fournitures.
            </p>
          </div>
          <Building2 className="h-5 w-5 text-blue-600" />
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chargement du patrimoine…
          </p>
        ) : assets.length ? (
          <ul className="divide-y divide-slate-100">
            {assets.map((asset) => (
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
                              new Date().toISOString().slice(0, 10),
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
              Aucun bien patrimonial enregistré
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ajoutez le matériel durable du cabinet ici. Les fournitures
              restent dans le module de stock.
            </p>
          </div>
        )}
      </section>

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
                  Mouvement du bien
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
                  max={new Date().toISOString().slice(0, 10)}
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
