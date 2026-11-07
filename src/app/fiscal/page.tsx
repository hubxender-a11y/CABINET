"use client";

import Link from "next/link";
import { useState } from "react";
import { useCompanyProfile } from "@/components/company-profile";
import { useWorkspaceStore } from "@/components/workspace-store";
import { formatDate, formatMoney } from "@/lib/formatting";

const fiscalLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_FISCALIZATION: "À examiner",
  CERTIFIED: "Certifiée",
  REJECTED: "Rejetée",
  CANCELLED: "Annulée",
};

export default function FiscalPage() {
  const { profile } = useCompanyProfile();
  const { clients, invoices, databaseConnected, databaseError } = useWorkspaceStore();
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const periodInvoices = invoices.filter((invoice) => !period || invoice.date.startsWith(period));
  const rows = periodInvoices.filter((invoice) => !status || invoice.fiscalStatus === status);

  return (
    <div className="space-y-5">
      <header className="workspace-page-heading">
        <p className="uppercase">Contrôle interne</p>
        <h1>Suivi fiscal</h1>
        <p className="mt-2 text-sm text-slate-600">Préparez le contrôle des factures, des identifiants et des justificatifs par période.</p>
      </header>

      {!databaseConnected && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{databaseError || "Chargement des données du cabinet…"}</p>}

      <section aria-label="Préparation fiscale" className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Identification du cabinet</h2>
          <p className="mt-2 text-sm text-slate-600">NIF · {profile?.nif?.trim() || "À vérifier dans la fiche du cabinet"}</p>
          <Link href="/settings" className="mt-3 inline-block text-sm font-semibold text-blue-700">Ouvrir les paramètres</Link>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Factures à examiner</h2>
          <p className="mt-2 text-2xl font-bold">
            {databaseConnected || periodInvoices.length
              ? periodInvoices.filter(({ fiscalStatus }) => fiscalStatus === "PENDING_FISCALIZATION" || fiscalStatus === "REJECTED").length
              : "—"}
          </p>
          <p className="mt-2 text-sm text-slate-600">Factures en attente ou rejetées pour la période affichée.</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Justificatifs</h2>
          <p className="mt-2 text-sm text-slate-600">Classez les déclarations et les preuves de dépôt dans les archives du cabinet.</p>
          <Link href="/documents" className="mt-3 inline-block text-sm font-semibold text-blue-700">Ouvrir les archives</Link>
        </article>
      </section>

      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        Ce registre sert à la préparation interne. La transmission à la DGI et le calendrier des obligations nécessitent un suivi distinct.
      </p>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="fiscal-register">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-5">
          <h2 id="fiscal-register" className="font-semibold">Registre fiscal des factures</h2>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-sm">Mois d’émission
              <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="border px-3" />
            </label>
            <label className="grid gap-1 text-sm">Statut fiscal
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="border px-3">
                <option value="">Tous les statuts</option>
                {Object.entries(fiscalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="bg-slate-50"><tr>
                {["Facture", "Client", "Émission", "Montant", "Statut fiscal"].map((label) => <th scope="col" key={label} className="px-5 py-3">{label}</th>)}
              </tr></thead>
              <tbody>{rows.map((invoice) => {
                const client = clientById.get(invoice.clientId);
                return <tr key={invoice.databaseId ?? invoice.id}>
                  <td className="px-5 py-3 font-semibold">{invoice.id}</td>
                  <td className="px-5 py-3">{invoice.client}
                    {client && <small className="block text-slate-600">NIF · {client.nif?.trim() || "Non renseigné"}</small>}
                  </td>
                  <td className="px-5 py-3">{formatDate(invoice.date)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{formatMoney(invoice.amount, invoice.currency)}</td>
                  <td className="px-5 py-3">{fiscalLabels[invoice.fiscalStatus ?? ""] ?? "Indisponible"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-slate-600">{databaseConnected ? "Aucune facture pour ces filtres." : "Aucune facture chargée."}</p>}
      </section>
    </div>
  );
}
