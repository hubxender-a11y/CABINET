"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api";

type Purchase = {
  id: string; number: string; total: string; currency: string; status: string; createdAt: string;
  supplier: { name: string };
  items: { id: string; name: string; quantity: string; total: string }[];
};
const amount = (value: string, currency: string) => new Intl.NumberFormat("fr-CD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));

export default function PurchasesPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await apiRequest<Purchase[]>("/inventory/purchases")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Impossible de charger les bons de commande."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Achats & fournisseurs</p><h1 className="mt-1 text-3xl font-semibold text-slate-900">Bons de commande</h1><p className="mt-2 text-sm text-slate-500">Registre des commandes de la société actuellement sélectionnée.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser</button></header>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 font-semibold text-slate-800"><ClipboardList className="h-5 w-5 text-slate-500" /> Registre</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{rows.length} commande(s)</span></div>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Chargement…</p> : rows.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Aucun bon de commande enregistré dans cette société.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Référence</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Fournisseur</th><th className="px-5 py-3">Articles</th><th className="px-5 py-3">Statut</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-5 py-4 font-semibold text-slate-900">{row.number}</td><td className="px-5 py-4 text-slate-600">{new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeZone: "Africa/Kinshasa" }).format(new Date(row.createdAt))}</td><td className="px-5 py-4 text-slate-700">{row.supplier.name}</td><td className="max-w-sm px-5 py-4 text-slate-600">{row.items.map((item) => `${item.name} × ${item.quantity}`).join(" · ") || "—"}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{row.status}</span></td><td className="px-5 py-4 text-right font-semibold text-slate-900">{amount(row.total, row.currency)}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
