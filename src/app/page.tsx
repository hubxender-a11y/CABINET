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
  PieChart,
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
    .filter((client) => client.status !== "À jour")
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
  const invoiceStatusCounts = [
    {
      label: "Payées",
      count: visibleInvoices.filter((invoice) => invoice.status === "Payée")
        .length,
      color: "#43bd91",
    },
    { label: "Certifiées", count: certified, color: "#5268d8" },
    {
      label: "En attente",
      count: visibleInvoices.filter(
        (invoice) => invoice.status === "En attente",
      ).length,
      color: "#f2bd54",
    },
    {
      label: "Autres",
      count: visibleInvoices.filter(
        (invoice) =>
          invoice.status === "Rejetée" || invoice.status === "Brouillon",
      ).length,
      color: "#ef8399",
    },
  ];
  let statusSweep = 0;
  const statusGradient = invoiceStatusCounts
    .filter((status) => status.count > 0)
    .map((status) => {
      const start = statusSweep;
      statusSweep += (status.count / visibleInvoices.length) * 100;
      return `${status.color} ${start}% ${statusSweep}%`;
    })
    .join(", ");
  const monthLabels = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  const latestInvoiceMonth = visibleInvoices
    .map((invoice) => invoice.date.slice(0, 7))
    .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .sort()
    .at(-1);
  const monthlyInvoiceCounts = latestInvoiceMonth
    ? Array.from({ length: 6 }, (_, index) => {
        const [year, month] = latestInvoiceMonth.split("-").map(Number);
        const monthOffset = month - 1 - (5 - index);
        const monthIndex = ((monthOffset % 12) + 12) % 12;
        const monthYear = year + Math.floor(monthOffset / 12);
        const key = `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}`;
        return {
          key,
          label: monthLabels[monthIndex],
          count: visibleInvoices.filter((invoice) =>
            invoice.date.startsWith(key),
          ).length,
        };
      })
    : [];
  const maxMonthlyInvoices = Math.max(
    ...monthlyInvoiceCounts.map((month) => month.count),
    1,
  );
  const monthlyChartPoints = monthlyInvoiceCounts
    .map(
      (month, index) =>
        `${14 + (index * 272) / 5},${82 - (month.count / maxMonthlyInvoices) * 56}`,
    )
    .join(" ");

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
          <article className="dashboard-panel dashboard-activity-panel">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-panel-eyebrow">Activité</p>
                <h2>Factures émises</h2>
              </div>
              <span className="dashboard-panel-icon is-blue">
                <Activity className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            {monthlyInvoiceCounts.length ? (
              <>
                <svg
                  className="dashboard-line-chart"
                  viewBox="0 0 300 110"
                  role="img"
                  aria-label="Nombre de factures émises par mois"
                >
                  {[25, 55, 85].map((y) => (
                    <line key={y} x1="14" x2="286" y1={y} y2={y} />
                  ))}
                  <polyline points={monthlyChartPoints} />
                  {monthlyInvoiceCounts.map((month, index) => {
                    const x = 14 + (index * 272) / 5;
                    const y = 82 - (month.count / maxMonthlyInvoices) * 56;
                    return <circle key={month.key} cx={x} cy={y} r="3" />;
                  })}
                </svg>
                <div className="dashboard-chart-labels">
                  {monthlyInvoiceCounts.map((month) => (
                    <span key={month.key}>{month.label}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="dashboard-empty-chart">
                <Activity className="h-7 w-7" />
                <span>Les tendances apparaîtront avec vos factures.</span>
              </div>
            )}
          </article>

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
          <article className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-panel-eyebrow">En un regard</p>
                <h2>Statut des factures</h2>
              </div>
              <PieChart className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="dashboard-donut-layout">
              <div
                className="dashboard-donut"
                style={{
                  background: visibleInvoices.length
                    ? `conic-gradient(${statusGradient})`
                    : "#edf1f7",
                }}
                role="img"
                aria-label={`${visibleInvoices.length} factures au total`}
              >
                <span>
                  <strong>{visibleInvoices.length}</strong>
                  <small>factures</small>
                </span>
              </div>
              <ul className="dashboard-legend">
                {invoiceStatusCounts.map((status) => (
                  <li key={status.label}>
                    <span
                      className="dashboard-legend-dot"
                      style={{ background: status.color }}
                    />
                    <span>{status.label}</span>
                    <strong>{status.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </article>

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

          <article className="dashboard-panel dashboard-clients-panel">
            <div className="dashboard-panel-heading">
              <div>
                <p className="dashboard-panel-eyebrow">Portefeuille</p>
                <h2>Clients récents</h2>
              </div>
              <Link
                href="/clients"
                className="dashboard-panel-link"
                aria-label="Voir tous les clients"
              >
                <Users className="h-4 w-4" />
                <span className="sr-only">Tous</span>
              </Link>
            </div>
            {clients.length ? (
              <div className="dashboard-client-list">
                {clients.slice(0, 3).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedClient(client.id)}
                    className="dashboard-client-item"
                  >
                    <span className="dashboard-client-avatar">
                      {client.name.slice(0, 1).toLocaleUpperCase("fr")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{client.name}</strong>
                      <small>{client.sector || "Client du cabinet"}</small>
                    </span>
                    <span
                      className={`dashboard-client-status ${client.status === "À jour" ? "is-good" : client.status === "En retard" ? "is-late" : "is-warning"}`}
                      title={client.status}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <Link href="/clients" className="dashboard-client-empty">
                <Users className="h-5 w-5" />
                Ajouter un premier client
              </Link>
            )}
          </article>
        </aside>
      </section>
    </div>
  );
}
