"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  FilePlus2,
  FileText,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";
import {
  companyDisplayName,
  companyLocation,
  useCompanyProfile,
} from "@/components/company-profile";
import { formatMoney } from "@/lib/formatting";

const moneyByCurrency = (
  totals: Record<"CDF" | "USD", number>,
  primaryCurrency: "CDF" | "USD",
) =>
  ([primaryCurrency, primaryCurrency === "CDF" ? "USD" : "CDF"] as const)
    .filter((currency) => totals[currency] > 0)
    .map((currency) => formatMoney(totals[currency], currency))
    .join(" · ") || formatMoney(0, primaryCurrency);

const statusClass: Record<string, string> = {
  Certifiée: "is-certified",
  Payée: "is-paid",
  Rejetée: "is-rejected",
  "En attente": "is-pending",
  Brouillon: "is-draft",
};

const moduleLinks = [
  {
    href: "/invoices",
    label: "Facturation",
    icon: Receipt,
    tone: "is-billing",
    metric: "clients & factures",
  },
  {
    href: "/stocks",
    label: "Stock & patrimoine",
    icon: Boxes,
    tone: "is-inventory",
    metric: "articles & matériel",
  },
  {
    href: "/documents",
    label: "Archivage",
    icon: Archive,
    tone: "is-archive",
    metric: "classeurs & documents",
  },
] as const;

export default function HomePage() {
  const { clients, invoices, databaseConnected, databaseError } =
    useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const primaryCurrency = profile?.currencyCode ?? "CDF";
  const cabinetName = companyDisplayName(profile);
  const [selectedClient, setSelectedClient] = useState("all");

  const visibleInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          selectedClient === "all" || invoice.clientId === selectedClient,
      ),
    [invoices, selectedClient],
  );
  const activeInvoices = visibleInvoices.filter(
    (invoice) => invoice.status !== "Brouillon" && invoice.status !== "Rejetée",
  );
  const issuedByCurrency = activeInvoices.reduce(
    (totals, invoice) => ({
      ...totals,
      [invoice.currency]: totals[invoice.currency] + invoice.amount,
    }),
    { CDF: 0, USD: 0 },
  );
  const outstandingByCurrency = activeInvoices.reduce(
    (totals, invoice) => {
      const balance =
        invoice.status === "Payée"
          ? 0
          : Math.max(invoice.amount - (invoice.paidAmount ?? 0), 0);
      return {
        ...totals,
        [invoice.currency]: totals[invoice.currency] + balance,
      };
    },
    { CDF: 0, USD: 0 },
  );
  const attentionCount =
    selectedClient === "all"
      ? clients.filter((client) => client.status !== "À jour").length
      : clients.find((client) => client.id === selectedClient)?.status ===
          "À jour"
        ? 0
        : 1;
  const certified = visibleInvoices.filter(
    (invoice) => invoice.status === "Certifiée",
  ).length;
  const clientsToFollowUp = clients
    .filter(
      (client) =>
        client.status !== "À jour" &&
        (selectedClient === "all" || client.id === selectedClient),
    )
    .slice(0, 3);
  const invoicesToCollect = activeInvoices
    .filter(
      (invoice) =>
        invoice.amount -
          (invoice.paidAmount ??
            (invoice.status === "Payée" ? invoice.amount : 0)) >
        0,
    )
    .slice(0, 3);
  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-icon" aria-hidden="true">
            <Activity className="h-6 w-6" />
          </span>
          <div>
            <p className="dashboard-eyebrow">
              FACTURA RDC <span>·</span> {companyLocation(profile)}
            </p>
            <h1>Bienvenue, {cabinetName}</h1>
            <p className="dashboard-hero-caption">
              Votre cabinet, en un coup d’œil.
            </p>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <Link
            href="/clients"
            className="dashboard-hero-icon-button"
            aria-label="Créer un dossier client"
            title="Nouveau client"
          >
            <Users className="h-5 w-5" />
          </Link>
          <Link href="/invoices" className="dashboard-hero-primary">
            <FilePlus2 className="h-4 w-4" />
            Nouvelle facture
          </Link>
        </div>
      </header>

      <div className="dashboard-toolbar">
        <div
          className={`dashboard-connection ${databaseConnected ? "is-connected" : "is-unavailable"}`}
          title={databaseError || undefined}
        >
          <span className="dashboard-connection-dot" />
          <span>
            {databaseConnected ? "Système connecté" : "Connexion limitée"}
          </span>
        </div>
        <label className="dashboard-client-filter">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Filtrer par client</span>
          <select
            value={selectedClient}
            onChange={(event) => setSelectedClient(event.target.value)}
            aria-label="Filtrer les données par client"
          >
            <option value="all">Tous les clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="dashboard-metrics" aria-label="Indicateurs clés">
        {[
          {
            label: "Clients",
            value: selectedClient === "all" ? clients.length : 1,
            detail: `${attentionCount} à suivre`,
            icon: BriefcaseBusiness,
            tone: "is-blue",
          },
          {
            label: "Factures",
            value: activeInvoices.length,
            detail: `${certified} certifiée${certified === 1 ? "" : "s"}`,
            icon: FileText,
            tone: "is-violet",
          },
          {
            label: "Montant facturé",
            value: moneyByCurrency(issuedByCurrency, primaryCurrency),
            detail: "CDF · USD",
            icon: Wallet,
            tone: "is-pink",
          },
          {
            label: "À encaisser",
            value: moneyByCurrency(outstandingByCurrency, primaryCurrency),
            detail: "Solde restant",
            icon: ArrowDownRight,
            tone: "is-amber",
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="dashboard-metric-card">
              <span className={`dashboard-metric-icon ${metric.tone}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="dashboard-metric-copy">
                <span className="dashboard-metric-label">{metric.label}</span>
                <strong className="dashboard-metric-value">
                  {metric.value}
                </strong>
                <span className="dashboard-metric-detail">{metric.detail}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-module-grid" aria-label="Modules">
        {moduleLinks.map((module) => {
          const Icon = module.icon;
          return (
            <Link
              key={module.href}
              href={module.href}
              className={`dashboard-module-card ${module.tone}`}
            >
              <span className="dashboard-module-icon">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="dashboard-module-copy">
                <span className="dashboard-module-title">{module.label}</span>
                <span className="dashboard-module-detail">{module.metric}</span>
              </span>
              <ChevronRight className="dashboard-module-arrow h-5 w-5" />
            </Link>
          );
        })}
      </section>

      <section className="dashboard-content-grid">
        <div className="dashboard-main-stack">
          <article className="dashboard-panel dashboard-recent-panel">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-panel-eyebrow">Registre</p>
                <h2>Dernières factures</h2>
              </div>
              <Link
                href="/invoices"
                className="dashboard-panel-link"
                aria-label="Voir toutes les factures"
              >
                Tout voir <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-invoice-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Client</th>
                    <th>Montant</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.length ? (
                    visibleInvoices.slice(0, 5).map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="font-semibold text-slate-900">
                          {invoice.id}
                          <span className="dashboard-invoice-date">
                            {invoice.date}
                          </span>
                        </td>
                        <td>{invoice.client}</td>
                        <td className="whitespace-nowrap font-medium text-slate-800">
                          {formatMoney(invoice.amount, invoice.currency)}
                        </td>
                        <td>
                          <span
                            className={`dashboard-status-chip ${statusClass[invoice.status] ?? "is-draft"}`}
                          >
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="dashboard-table-empty">
                        <Receipt className="h-6 w-6" />
                        <span>Aucune facture à afficher</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <aside className="dashboard-side-stack">
          <article className="dashboard-panel dashboard-priority-panel">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-panel-eyebrow">À ne pas oublier</p>
                <h2>À suivre</h2>
              </div>
              <span className="dashboard-panel-icon is-amber">
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <div className="dashboard-priority-list">
              {clientsToFollowUp.slice(0, 2).map((client) => (
                <Link
                  key={client.id}
                  href="/clients"
                  className="dashboard-priority-item"
                >
                  <span className="dashboard-priority-icon is-rose">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong>{client.name}</strong>
                    <small>
                      Dossier {client.status.toLocaleLowerCase("fr")}
                    </small>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              ))}
              {invoicesToCollect.slice(0, 2).map((invoice) => {
                const balance = Math.max(
                  invoice.amount -
                    (invoice.paidAmount ??
                      (invoice.status === "Payée" ? invoice.amount : 0)),
                  0,
                );
                return (
                  <Link
                    key={invoice.id}
                    href="/payments"
                    className="dashboard-priority-item"
                  >
                    <span className="dashboard-priority-icon is-amber">
                      <ArrowDownRight className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{invoice.client}</strong>
                      <small>
                        {formatMoney(balance, invoice.currency)} à recevoir
                      </small>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Link>
                );
              })}
              {!clientsToFollowUp.length && !invoicesToCollect.length && (
                <div className="dashboard-priority-empty">
                  <span className="dashboard-priority-icon is-green">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <span>Tout est à jour</span>
                </div>
              )}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
