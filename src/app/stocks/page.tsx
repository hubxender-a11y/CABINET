"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Boxes, Plus, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatMoney, formatQuantity, type StockMovement } from "@/lib/inventory";
import { useCompanyProfile } from "@/components/company-profile";

type StockProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stock: string;
  alertLevel: string;
  purchasePrice: string;
};

type StockResponse = { products: StockProduct[]; movements: StockMovement[] };
type MovementType = "IN" | "OUT" | "ADJUSTMENT";

const movementLabels: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  PURCHASE: "Achat réceptionné",
  ADJUSTMENT: "Ajustement",
};

export default function StocksPage() {
  const { profile } = useCompanyProfile();
  const currency = profile?.currencyCode ?? "CDF";
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("IN");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<StockResponse>("/stock");
      setProducts(result.products);
      setMovements(result.movements);
      setProductId((current) =>
        result.products.some((product) => product.id === current)
          ? current
          : result.products[0]?.id ?? "",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger l’état du stock.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadStock);
  }, [loadStock]);

  const totalValuation = useMemo(
    () => products.reduce((sum, product) => sum + Number(product.stock) * Number(product.purchasePrice), 0),
    [products],
  );
  const selectedProduct = products.find((product) => product.id === productId);

  async function createMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<StockMovement>("/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          productId,
          movementType,
          quantity,
          ...(unitCost ? { unitCost } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      setQuantity("1");
      setUnitCost("");
      setDescription("");
      setShowForm(false);
      setMessage(movementType === "ADJUSTMENT" ? "L’inventaire physique a été pris en compte." : "Le mouvement de stock a été enregistré.");
      await loadStock();
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Suivi des fournitures</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Stocks & mouvements</h1>
          <p className="mt-2 text-sm text-slate-500">Entrées, sorties, inventaire physique et alertes de réapprovisionnement.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadStock()} disabled={loading} aria-label="Actualiser le stock" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <button type="button" onClick={() => setShowForm((open) => !open)} disabled={!products.length} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Nouveau mouvement</button>
        </div>
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Références suivies</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{products.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">À réapprovisionner</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{products.filter((product) => Number(product.stock) <= Number(product.alertLevel)).length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Valeur indicative du stock</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatMoney(totalValuation, currency)}</p>
          <p className="mt-1 text-xs text-slate-400">Calculée au prix d’achat enregistré.</p>
        </article>
      </section>

      {showForm && (
        <form onSubmit={createMovement} className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <h2 className="font-semibold text-slate-900 sm:col-span-2 xl:col-span-4">Enregistrer un mouvement ou un inventaire</h2>
          <label className="space-y-2 text-sm font-medium text-slate-700">Produit *
            <select required value={productId} onChange={(event) => setProductId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Type de mouvement *
            <select value={movementType} onChange={(event) => setMovementType(event.target.value as MovementType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <option value="IN">Entrée en stock</option>
              <option value="OUT">Sortie du stock</option>
              <option value="ADJUSTMENT">Inventaire / correction</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">{movementType === "ADJUSTMENT" ? "Quantité réellement comptée *" : "Quantité *"}
            <input required type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
            {movementType === "ADJUSTMENT" && <span className="block text-xs font-normal text-slate-500">Stock actuel : {formatQuantity(selectedProduct?.stock ?? 0)} {selectedProduct?.unit}</span>}
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Coût unitaire ({currency}), facultatif
            <input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="Coût actuel du produit par défaut" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-4">Motif / référence
            <input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex. Fournitures utilisées — bureau Kinshasa" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2 xl:col-span-4">
            <button type="submit" disabled={saving || !productId} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer le mouvement"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Annuler</button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="font-semibold text-slate-900">État actuel du stock</h2>
        </div>
        {loading && !products.length ? (
          <p className="p-6 text-sm text-slate-500">Chargement du stock…</p>
        ) : products.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3 font-medium">Produit</th><th className="px-5 py-3 font-medium">Stock disponible</th><th className="px-5 py-3 font-medium">Seuil d’alerte</th><th className="px-5 py-3 font-medium">Valeur au coût d’achat</th><th className="px-5 py-3 font-medium">État</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const low = Number(product.stock) <= Number(product.alertLevel);
                  return (
                    <tr key={product.id}>
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Boxes className="h-4 w-4" /></span><div><p className="font-medium text-slate-900">{product.name}</p><p className="text-xs text-slate-500">{product.sku}</p></div></div></td>
                      <td className="px-5 py-4 font-medium text-slate-900">{formatQuantity(product.stock)} {product.unit}</td>
                      <td className="px-5 py-4 text-slate-600">{formatQuantity(product.alertLevel)} {product.unit}</td>
                      <td className="px-5 py-4 text-slate-600">{formatMoney(Number(product.stock) * Number(product.purchasePrice), currency)}</td>
                      <td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${low ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{low && <AlertTriangle className="h-3.5 w-3.5" />}{low ? "À réapprovisionner" : "Disponible"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="font-medium text-slate-800">Aucun produit à suivre.</p>
            <p className="mt-1 text-sm text-slate-500">Ajoutez des références au catalogue avant de gérer le stock.</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div><h2 className="font-semibold text-slate-900">Derniers mouvements</h2><p className="mt-1 text-sm text-slate-500">{movements.length} mouvement(s) récent(s)</p></div>
        </div>
        {movements.length ? (
          <div className="divide-y divide-slate-100">
            {movements.map((movement) => {
              const inbound = Number(movement.quantity) > 0;
              return (
                <article key={movement.id} className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-medium text-slate-900">{movement.product.name} <span className="font-normal text-slate-500">· {movementLabels[movement.movementType] ?? movement.movementType}</span></p>
                    <p className="mt-1 text-sm text-slate-500">{movement.description || "Aucun motif indiqué"} · {new Date(movement.createdAt).toLocaleString("fr-CD")}</p>
                  </div>
                  <p className={`font-semibold ${inbound ? "text-emerald-700" : "text-rose-700"}`}>{inbound ? "+" : ""}{formatQuantity(movement.quantity)}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="p-6 text-sm text-slate-500">Aucun mouvement enregistré pour le moment.</p>
        )}
      </section>
    </div>
  );
}
