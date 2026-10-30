"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CalendarClock, FilePlus2, FileText, Users } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";

const money = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount);

const statusClass: Record<string, string> = {
  Certifiée: "bg-emerald-100 text-emerald-700",
  Payée: "bg-sky-100 text-sky-700",
  Rejetée: "bg-rose-100 text-rose-700",
  "En attente": "bg-amber-100 text-amber-700",
  Brouillon: "bg-slate-100 text-slate-700",
};

export default function HomePage() {
  const { clients, invoices, databaseConnected, databaseError } = useWorkspaceStore();
  const [selectedClient, setSelectedClient] = useState("all");

  const visibleInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) => selectedClient === "all" || invoice.clientId === selectedClient,
      ),
    [invoices, selectedClient],
  );
  const issuedByCurrency = visibleInvoices
    .filter((invoice) => invoice.status !== "Brouillon" && invoice.status !== "Rejetée")
    .reduce(
      (totals, invoice) => ({
        ...totals,
        [invoice.currency]: totals[invoice.currency] + invoice.amount,
      }),
      { CDF: 0, USD: 0 },
    );
  const outstandingByCurrency = visibleInvoices
    .filter((invoice) => invoice.status !== "Brouillon" && invoice.status !== "Rejetée")
    .reduce(
      (totals, invoice) => {
        const unpaid =
          invoice.status === "Payée"
            ? 0
            : Math.max(invoice.amount - (invoice.paidAmount ?? 0), 0);
        return {
          ...totals,
          [invoice.currency]: totals[invoice.currency] + unpaid,
        };
      },
      { CDF: 0, USD: 0 },
    );
  const certified = visibleInvoices.filter((invoice) => invoice.status === "Certifiée").length;
  const attentionCount = clients.filter((client) => client.status !== "À jour").length;

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Vue du cabinet</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Bonjour, Cabinet Transparency</h1>
          <p className="mt-2 text-sm text-slate-500">Suivez les dossiers, les échéances et la facturation de vos clients.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/clients" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Users className="h-4 w-4" /> Nouveau dossier
          </Link>
          <Link href="/invoices" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
            <FilePlus2 className="h-4 w-4" /> Nouvelle facture
          </Link>
        </div>
      </header>

      <div className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${databaseConnected ? "border-emerald-100 bg-emerald-50/70" : "border-amber-100 bg-amber-50/70"}`}>
        <div>
          <p className={`text-sm font-semibold ${databaseConnected ? "text-emerald-950" : "text-amber-950"}`}>
            {databaseConnected ? "Base de données du cabinet connectée" : "Mode démonstration local"}
          </p>
          <p className={`mt-1 text-xs ${databaseConnected ? "text-emerald-800" : "text-amber-800"}`}>
            {databaseConnected
              ? "Clients et factures sont chargés depuis PostgreSQL."
              : databaseError || "Les données enregistrées dans ce navigateur ne sont visibles que sur cet appareil."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-blue-950">
          Dossier
          <select
            value={selectedClient}
            onChange={(event) => setSelectedClient(event.target.value)}
            className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">Tous les clients</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Dossiers clients", value: selectedClient === "all" ? clients.length : 1, helper: "Portefeuille actif", icon: BriefcaseBusiness, tone: "text-blue-700 bg-blue-50" },
          { label: "Facturation suivie", value: `${money(issuedByCurrency.CDF)} CDF${issuedByCurrency.USD ? ` · ${money(issuedByCurrency.USD)} USD` : ""}`, helper: `${visibleInvoices.length} documents suivis`, icon: FileText, tone: "text-indigo-700 bg-indigo-50" },
          { label: "En attente de règlement", value: `${money(outstandingByCurrency.CDF)} CDF${outstandingByCurrency.USD ? ` · ${money(outstandingByCurrency.USD)} USD` : ""}`, helper: "À rapprocher des paiements", icon: CalendarClock, tone: "text-amber-700 bg-amber-50" },
          { label: "Dossiers à traiter", value: selectedClient === "all" ? attentionCount : clients.find((client) => client.id === selectedClient)?.status === "À jour" ? 0 : 1, helper: `${certified} facture(s) certifiée(s)`, icon: Users, tone: "text-rose-700 bg-rose-50" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{kpi.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">{kpi.value}</p>
                </div>
                <span className={`rounded-xl p-2.5 ${kpi.tone}`}><Icon className="h-5 w-5" /></span>
              </div>
              <p className="mt-3 text-xs text-slate-500">{kpi.helper}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Factures des dossiers</h2>
              <p className="mt-1 text-sm text-slate-500">Émission, suivi et statut de certification</p>
            </div>
            <Link href="/invoices" className="text-sm font-medium text-blue-600 hover:text-blue-800">Tout voir</Link>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Référence</th>
                  <th className="px-4 py-3 font-medium">Dossier client</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.length ? visibleInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-200">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{invoice.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{invoice.client}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{money(invoice.amount)} {invoice.currency}</td>
                    <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[invoice.status]}`}>{invoice.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{invoice.date}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune facture pour ce dossier.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Dossiers clients</h2>
                <p className="mt-1 text-sm text-slate-500">État du portefeuille</p>
              </div>
              <Link href="/clients" className="text-sm font-medium text-blue-600">Gérer</Link>
            </div>
            <div className="mt-4 space-y-3">
              {clients.slice(0, 4).map((client) => (
                <button key={client.id} onClick={() => setSelectedClient(client.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50/40">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{client.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">{client.sector}</span>
                  </span>
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${client.status === "À jour" ? "bg-emerald-50 text-emerald-700" : client.status === "En retard" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{client.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-semibold text-amber-950">À traiter en priorité</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-3 rounded-xl bg-white/80 p-3">
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span><strong className="font-medium text-slate-900">Kivu Foods</strong><span className="mt-0.5 block text-xs text-slate-500">Pièces comptables à relancer</span></span>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-white/80 p-3">
                <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span><strong className="font-medium text-slate-900">Boreal Pharma</strong><span className="mt-0.5 block text-xs text-slate-500">Paiement reçu à rapprocher</span></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
