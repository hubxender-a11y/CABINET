"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, Bell, Building2, FileText, RefreshCw, Wallet } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { setSessionToken } from "@/lib/session";

type CurrencyTotal = { currency: string; invoiced: string; paid: string; received?: string };
type CompanySummary = {
  id: string; name: string; legalName: string; logoUrl: string | null; primaryColor: string; currencyCode: string;
  counts: { users: number; clients: number; invoices: number; payments: number; expenses: number; paymentOrders: number; pendingPaymentOrders: number; cashVouchers: number; purchases: number; unreadNotifications: number };
  invoicesByCurrency: CurrencyTotal[]; paymentsByCurrency: CurrencyTotal[];
  fundingByAccount: { direction: string; amount: string; currency: string; accountName: string }[];
};
type Overview = { generatedAt: string; companies: CompanySummary[] };

const money = (value: string, currency: string) => new Intl.NumberFormat("fr-CD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));

export default function ManagingPartnerPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [switchingId, setSwitchingId] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try { setOverview(await apiRequest<Overview>("/managing-partner/overview")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Chargement du tableau global impossible."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function openCompany(companyId: string) {
    setSwitchingId(companyId);
    setError("");
    try {
      const session = await apiRequest<{ accessToken: string }>("/auth/switch-company", { method: "POST", body: JSON.stringify({ companyId }) });
      setSessionToken(session.accessToken);
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ouverture de l’entreprise impossible.");
      setSwitchingId("");
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 p-7 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Espace associé-gérant</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pilotage des sociétés</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Consultez les opérations et indicateurs société par société. Ouvrez un espace pour examiner ses rapports, approvisionnements, caisse, règlements et ordres de paiement.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser</button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Sociétés suivies", value: overview?.companies.length ?? "—", icon: Building2 },
          { label: "OP à examiner", value: overview?.companies.reduce((sum, item) => sum + item.counts.pendingPaymentOrders, 0) ?? "—", icon: FileText },
          { label: "Notifications non lues", value: overview?.companies.reduce((sum, item) => sum + item.counts.unreadNotifications, 0) ?? "—", icon: Bell },
          { label: "Bons de commande", value: overview?.companies.reduce((sum, item) => sum + item.counts.purchases, 0) ?? "—", icon: Wallet },
        ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold text-slate-900">{loading ? "…" : value}</p></article>)}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-900">Détail par société</h2><p className="mt-1 text-sm text-slate-500">Les montants sont présentés dans la devise d’origine de chaque société.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Activity className="h-4 w-4" /> Vue actualisée</span></div>
        {loading && !overview ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Chargement des indicateurs…</div> : !overview?.companies.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Aucune société active à afficher.</div> : <div className="grid gap-5 lg:grid-cols-2">{overview.companies.map((company) => <article key={company.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: company.primaryColor || "#b91c1c" }}>{company.name.slice(0, 1).toLocaleUpperCase("fr")}</span><div className="min-w-0"><h3 className="truncate text-lg font-semibold text-slate-900">{company.name}</h3><p className="truncate text-xs text-slate-500">{company.legalName}</p></div></div><button type="button" onClick={() => void openCompany(company.id)} disabled={Boolean(switchingId)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{switchingId === company.id ? "Ouverture…" : "Ouvrir"}<ArrowRight className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">{[
            ["OP à examiner", company.counts.pendingPaymentOrders], ["Notifications", company.counts.unreadNotifications], ["Factures", company.counts.invoices], ["Commandes", company.counts.purchases], ["Utilisateurs", company.counts.users], ["Règlements", company.counts.payments], ["Bons de caisse", company.counts.cashVouchers], ["Clients", company.counts.clients],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-slate-900">{value}</p></div>)}</div>
          <div className="space-y-2 border-t border-slate-100 px-5 py-4">{company.invoicesByCurrency.map((row) => <div key={row.currency} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Facturé · {row.currency}</span><span className="font-semibold text-slate-800">{money(row.invoiced, row.currency)} <span className="font-normal text-slate-500">· payé {money(row.paid, row.currency)}</span></span></div>)}{company.invoicesByCurrency.length === 0 && <p className="text-sm text-slate-500">Aucune facture enregistrée.</p>}{Array.from(new Set(company.fundingByAccount.filter((row) => row.direction === "IN").map((row) => row.currency))).map((currency) => { const amount = company.fundingByAccount.filter((row) => row.direction === "IN" && row.currency === currency).reduce((sum, row) => sum + Number(row.amount), 0); return <div key={`fund-${currency}`} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Approvisionné · {currency}</span><span className="font-semibold text-slate-800">{money(String(amount), currency)}</span></div>; })}</div>
        </article>)}</div>}
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Sélectionnez une société pour examiner ses états détaillés. Les rapports comptables affichés sont ceux réellement disponibles dans son espace; le logiciel ne fabrique pas d’écritures de grand livre non enregistrées.</p>
    </main>
  );
}
