"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Truck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatMoney, formatQuantity, type ProductRecord, type PurchaseRecord, type SupplierRecord } from "@/lib/inventory";
import { useCompanyProfile } from "@/components/company-profile";

type PurchaseLine = { productId: string; quantity: string; unitPrice: string };
const newLine = (): PurchaseLine => ({ productId: "", quantity: "1", unitPrice: "0" });

export default function PurchasesPage() {
  const { profile } = useCompanyProfile();
  const currency = profile?.currencyCode ?? "CDF";
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<PurchaseLine[]>([newLine()]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProducts, nextSuppliers, nextPurchases] = await Promise.all([
        apiRequest<ProductRecord[]>("/products"),
        apiRequest<SupplierRecord[]>("/suppliers"),
        apiRequest<PurchaseRecord[]>("/purchases"),
      ]);
      setProducts(nextProducts);
      setSuppliers(nextSuppliers);
      setPurchases(nextPurchases);
      setSupplierId((current) => current || nextSuppliers[0]?.id || "");
      setItems((current) =>
        current.map((item) =>
          item.productId || !nextProducts[0]
            ? item
            : { ...item, productId: nextProducts[0].id, unitPrice: nextProducts[0].purchasePrice },
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger les achats et fournisseurs.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const estimatedTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [items],
  );

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const supplier = await apiRequest<SupplierRecord>("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: supplierName,
          phone: supplierPhone || undefined,
          email: supplierEmail || undefined,
          address: supplierAddress || undefined,
        }),
      });
      setSuppliers((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name, "fr")));
      setSupplierId(supplier.id);
      setSupplierName("");
      setSupplierPhone("");
      setSupplierEmail("");
      setSupplierAddress("");
      setShowSupplierForm(false);
      setMessage("Le fournisseur a été ajouté.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’ajouter ce fournisseur.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<PurchaseRecord>("/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          items: items.map((item) => ({
            ...item,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
          })),
        }),
      });
      setItems([newLine()]);
      setShowPurchaseForm(false);
      setMessage("L’achat fournisseur a été créé en brouillon.");
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’enregistrer cet achat.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function receivePurchase(purchase: PurchaseRecord) {
    if (!window.confirm(`Réceptionner l’achat ${purchase.number} ? Le stock sera augmenté.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/purchases/${purchase.id}/receive`, { method: "POST" });
      setMessage(`L’achat ${purchase.number} a été réceptionné et le stock mis à jour.`);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de réceptionner cet achat.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    setItems((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Approvisionnement du cabinet</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Fournisseurs & achats</h1>
          <p className="mt-2 text-sm text-slate-500">{suppliers.length} fournisseur(s) · {purchases.length} achat(s) récent(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadData()} disabled={loading} aria-label="Actualiser les achats" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <button type="button" onClick={() => setShowSupplierForm((open) => !open)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Ajouter un fournisseur</button>
          <button type="button" onClick={() => setShowPurchaseForm((open) => !open)} disabled={!products.length || !suppliers.length} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Nouvel achat</button>
        </div>
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {showSupplierForm && (
        <form onSubmit={createSupplier} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <h2 className="font-semibold text-slate-900 sm:col-span-2 xl:col-span-4">Nouveau fournisseur</h2>
          <label className="space-y-2 text-sm font-medium text-slate-700">Nom / raison sociale *
            <input required minLength={2} maxLength={180} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Téléphone
            <input maxLength={40} value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">E-mail
            <input type="email" maxLength={160} value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">Adresse
            <input maxLength={300} value={supplierAddress} onChange={(event) => setSupplierAddress(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <div className="flex gap-3 sm:col-span-2 xl:col-span-4">
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer le fournisseur"}</button>
            <button type="button" onClick={() => setShowSupplierForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700">Annuler</button>
          </div>
        </form>
      )}

      {showPurchaseForm && (
        <form onSubmit={createPurchase} className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-2 text-sm font-medium text-slate-700">Fournisseur *
              <select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <option value="">Choisir un fournisseur</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <p className="text-sm text-slate-600">Total estimé : <strong className="text-slate-900">{formatMoney(estimatedTotal, currency)}</strong></p>
          </div>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_140px_160px_auto] sm:items-end">
                <label className="space-y-2 text-xs font-medium text-slate-500">Produit *
                  <select required value={item.productId} onChange={(event) => {
                    const selected = products.find((product) => product.id === event.target.value);
                    updateLine(index, { productId: event.target.value, unitPrice: selected?.purchasePrice ?? "0" });
                  }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="">Choisir un produit</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-xs font-medium text-slate-500">Quantité *
                  <input required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="space-y-2 text-xs font-medium text-slate-500">Prix unitaire ({currency}) *
                  <input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" />
                </label>
                <button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 disabled:opacity-40">Retirer</button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setItems((current) => [...current, { ...newLine(), productId: products[0]?.id ?? "", unitPrice: products[0]?.purchasePrice ?? "0" }])} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Ajouter une ligne</button>
            <button type="submit" disabled={saving || !supplierId || !products.length} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Créer l’achat en brouillon"}</button>
            <button type="button" onClick={() => setShowPurchaseForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Annuler</button>
          </div>
          <p className="text-xs text-slate-500">Le stock ne sera modifié qu’après réception de l’achat.</p>
        </form>
      )}

      {loading && !purchases.length ? (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Chargement des achats…</p>
      ) : purchases.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Historique des achats</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {purchases.map((purchase) => (
              <article key={purchase.id} className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Truck className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{purchase.number}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${purchase.status === "RECEIVED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{purchase.status === "RECEIVED" ? "Réceptionné" : "Brouillon"}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{purchase.supplier.name} · {new Date(purchase.createdAt).toLocaleDateString("fr-CD")}</p>
                    <p className="mt-1 text-xs text-slate-500">{purchase.items.map((item) => `${item.name} (${formatQuantity(item.quantity)})`).join(" · ")}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 lg:justify-end">
                  <p className="font-semibold text-slate-900">{formatMoney(purchase.total, purchase.currency)}</p>
                  {purchase.status === "DRAFT" && (
                    <button type="button" disabled={saving} onClick={() => void receivePurchase(purchase)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Réceptionner</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <p className="font-medium text-slate-800">Aucun achat enregistré.</p>
          <p className="mt-1 text-sm text-slate-500">Ajoutez vos fournisseurs et enregistrez leurs achats pour suivre les entrées en stock.</p>
        </div>
      )}
    </div>
  );
}
