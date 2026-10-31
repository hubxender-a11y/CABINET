"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Package, Plus, RefreshCw, Search } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatMoney, formatQuantity, type ProductRecord } from "@/lib/inventory";

const emptyProduct = {
  sku: "",
  name: "",
  unit: "unité",
  description: "",
  purchasePrice: "0",
  sellPrice: "0",
  openingStock: "0",
  alertLevel: "0",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState<"CDF" | "USD">("CDF");
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyProduct);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProducts, company] = await Promise.all([
        apiRequest<ProductRecord[]>("/products"),
        apiRequest<{ currencyCode: "CDF" | "USD" }>("/company"),
      ]);
      setProducts(nextProducts);
      setCurrency(company.currencyCode);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger le catalogue.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadProducts);
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("fr");
    if (!term) return products;
    return products.filter((product) =>
      `${product.sku} ${product.name} ${product.description ?? ""}`
        .toLocaleLowerCase("fr")
        .includes(term),
    );
  }, [products, query]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<ProductRecord>("/products", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(emptyProduct);
      setShowForm(false);
      setMessage("Le produit et son stock initial ont été enregistrés.");
      await loadProducts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’ajouter ce produit.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Achats et fournitures</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Produits & fournitures</h1>
          <p className="mt-2 text-sm text-slate-500">{products.length} référence(s) actives dans le catalogue.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadProducts()} disabled={loading} aria-label="Actualiser le catalogue" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={() => setShowForm((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nouveau produit
          </button>
        </div>
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {showForm && (
        <form onSubmit={createProduct} className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm font-medium text-slate-700">Référence / SKU *
            <input required maxLength={60} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="Ex. FOUR-001" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Nom *
            <input required minLength={2} maxLength={180} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Unité
            <input maxLength={40} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="unité, boîte, ramette…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Stock initial
            <input type="number" min="0" step="0.001" required value={form.openingStock} onChange={(event) => setForm({ ...form, openingStock: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Prix d’achat ({currency})
            <input type="number" min="0" step="0.01" required value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Prix de vente ({currency})
            <input type="number" min="0" step="0.01" required value={form.sellPrice} onChange={(event) => setForm({ ...form, sellPrice: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Seuil d’alerte stock
            <input type="number" min="0" step="0.001" required value={form.alertLevel} onChange={(event) => setForm({ ...form, alertLevel: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-4">Description
            <input maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2 xl:col-span-4">
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer le produit"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Annuler</button>
          </div>
        </form>
      )}

      <label className="flex max-w-lg items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400">
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une référence ou un produit…" className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none" />
      </label>

      {loading && !products.length ? (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Chargement du catalogue…</p>
      ) : filteredProducts.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const lowStock = Number(product.stock) <= Number(product.alertLevel);
            return (
              <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{product.sku}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${lowStock ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {lowStock && <AlertTriangle className="h-3.5 w-3.5" />}{lowStock ? "Stock bas" : "Disponible"}
                  </span>
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Package className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{product.name}</h2>
                    {product.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{product.description}</p>}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                  <div><p className="text-slate-400">Stock disponible</p><p className="mt-1 font-semibold text-slate-900">{formatQuantity(product.stock)} {product.unit}</p></div>
                  <div><p className="text-slate-400">Seuil d’alerte</p><p className="mt-1 font-semibold text-slate-900">{formatQuantity(product.alertLevel)} {product.unit}</p></div>
                  <div><p className="text-slate-400">Prix d’achat</p><p className="mt-1 font-medium text-slate-800">{formatMoney(product.purchasePrice, currency)}</p></div>
                  <div><p className="text-slate-400">Prix de vente</p><p className="mt-1 font-medium text-slate-800">{formatMoney(product.sellPrice, currency)}</p></div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <p className="font-medium text-slate-800">{products.length ? "Aucun produit ne correspond à la recherche." : "Le catalogue est encore vide."}</p>
          <p className="mt-1 text-sm text-slate-500">Ajoutez les fournitures et produits suivis par le cabinet.</p>
        </div>
      )}
    </div>
  );
}
