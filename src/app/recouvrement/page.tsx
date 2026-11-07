"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarClock, Search } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { formatDate, formatMoney } from "@/lib/formatting";
import { getReceivables, receivableLabels } from "@/lib/receivables";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

const currencies = ["CDF", "USD"] as const;

const statusStyle = {
  overdue: "bg-rose-50 text-rose-800",
  today: "bg-amber-50 text-amber-900",
  upcoming: "bg-blue-50 text-blue-800",
  undated: "bg-slate-100 text-slate-700",
};

export default function ReceivablesPage() {
  const { invoices, databaseConnected, databaseError } = useWorkspaceStore();
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("all");
  const [status, setStatus] = useState("all");
  const today = useKinshasaDate();
  const receivables = today ? getReceivables(invoices, today) : [];
  const search = query.trim().toLocaleLowerCase("fr");
  const results = receivables.filter((item) =>
    (currency === "all" || item.invoice.currency === currency) &&
    (status === "all" || item.status === status) &&
    `${item.invoice.client} ${item.invoice.id}`.toLocaleLowerCase("fr").includes(search),
  );

  return (
    <div className="space-y-5">
      <header className="workspace-page-heading">
        <p className="uppercase">Trésorerie du cabinet</p>
        <h1>Recouvrement des honoraires</h1>
        <p className="mt-2 text-sm text-slate-600">
          Suivez les factures ouvertes par échéance et préparez l’enregistrement des règlements.
        </p>
      </header>

      {!databaseConnected && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {databaseError || "Vérification de la disponibilité des données du cabinet…"}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Soldes à recevoir par devise">
        {currencies.map((code) => {
          const open = receivables.filter(({ invoice }) => invoice.currency === code);
          const total = open.reduce((sum, { balance }) => sum + balance, 0);
          const overdue = open.reduce((sum, item) => item.status === "overdue" ? sum + item.balance : sum, 0);
          return (
            <article key={code} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-600">Solde ouvert en {code}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {databaseConnected || open.length ? formatMoney(total, code) : "—"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {databaseConnected || open.length ? `${formatMoney(overdue, code)} en retard` : "Données indisponibles"}
              </p>
            </article>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="receivables-title">
        <div className="space-y-4 border-b border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="receivables-title" className="font-semibold text-slate-900">Factures à encaisser</h2>
            <p role="status" className="text-sm text-slate-600">
              {results.length} facture{results.length !== 1 && "s"}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Client ou référence
              <span className="relative">
                <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-500" aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une facture" className="w-full border py-2 pr-3 pl-9" />
              </span>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Devise
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="w-full border px-3">
                <option value="all">Toutes les devises</option>
                {currencies.map((code) => <option key={code}>{code}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Échéance
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full border px-3">
                <option value="all">Toutes les échéances</option>
                {Object.entries(receivableLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {results.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[39rem] text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-5 py-3">Client et facture</th>
                  <th scope="col" className="px-5 py-3">Échéance</th>
                  <th scope="col" className="px-5 py-3 text-right">Solde à recevoir</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ invoice, dueDate, balance, status: paymentStatus }) => (
                  <tr key={invoice.databaseId ?? invoice.id}>
                    <td className="border-t border-slate-100 px-5 py-3">
                      <strong className="block text-slate-900">{invoice.client}</strong>
                      <span className="text-xs text-slate-600">{invoice.id}</span>
                    </td>
                    <td className="border-t border-slate-100 px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[paymentStatus]}`}>
                        {receivableLabels[paymentStatus]}
                      </span>
                      {dueDate && <time dateTime={dueDate} className="mt-1 block text-xs text-slate-600">{formatDate(dueDate)}</time>}
                    </td>
                    <td className="whitespace-nowrap border-t border-slate-100 px-5 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(balance, invoice.currency)}
                    </td>
                    <td className="border-t border-slate-100 px-5 py-3 text-right">
                      <Link href={{ pathname: "/payments", query: { facture: invoice.databaseId ?? invoice.id } }} aria-label={`Préparer un règlement pour ${invoice.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-blue-700 hover:underline">
                        Régler <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 px-5 py-10 text-center text-sm text-slate-600">
            <CalendarClock className="h-6 w-6 text-blue-600" aria-hidden="true" />
            {receivables.length
              ? "Aucune facture ne correspond aux filtres."
              : databaseConnected ? "Aucun solde à recouvrer." : "Aucune facture chargée pour le moment."}
          </div>
        )}
      </section>
    </div>
  );
}
