"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChevronRight,
  FilePlus2,
  FileText,
  Landmark,
  Receipt,
  ScrollText,
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
import { apiRequest } from "@/lib/api";
import { getReceivables, receivableLabels } from "@/lib/receivables";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

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

type DashboardOrder = {
  id: string;
  orderNumber: string;
  beneficiary: string;
  amount: string;
  currency: "CDF" | "USD";
  status: "SUBMITTED" | "FINANCE_APPROVED" | "APPROVED" | "PAID" | "REJECTED";
};

type DashboardCashVoucher = {
  id: string;
  voucherNumber: string;
  beneficiary: string;
  amount: string;
  currency: "CDF" | "USD";
  status: "PENDING_APPROVAL" | "ISSUED" | "REJECTED" | "CANCELLED";
};

const moduleLinks = [
  {
    href: "/clients",
    label: "Dossiers clients",
    icon: BriefcaseBusiness,
    tone: "is-blue",
    metric: "Entreprises accompagnées",
  },
  {
    href: "/invoices",
    label: "Factures clients",
    icon: Receipt,
    tone: "is-violet",
    metric: "Facturation des entreprises",
  },
  {
    href: "/payments",
    label: "Règlements",
    icon: Wallet,
    tone: "is-teal",
    metric: "Suivi des encaissements",
  },
  {
    href: "/payment-orders",
    label: "Ordres de paiement",
    icon: ScrollText,
    tone: "is-amber",
    metric: "Demandes et visas de paiement",
  },
  {
    href: "/expenses",
    label: "Dépenses",
    icon: FileText,
    tone: "is-rose",
    metric: "Charges des entreprises",
  },
  {
    href: "/fiscal",
    label: "Suivi fiscal",
    icon: Landmark,
    tone: "is-amber",
    metric: "Contrôle des factures et justificatifs",
  },
  {
    href: "/patrimoine",
    label: "Patrimoine",
    icon: Building2,
    tone: "is-green",
    metric: "Matériel & immobilisations",
  },
  {
    href: "/documents",
    label: "Archivage",
    icon: Archive,
    tone: "is-orange",
    metric: "Documents des dossiers",
  },
  {
    href: "/reports",
    label: "Rapports",
    icon: BarChart3,
    tone: "is-slate",
    metric: "Vue d’ensemble de l’activité",
  },
] as const;

export default function HomePage() {
  const { clients, invoices, databaseConnected, databaseError } =
    useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const primaryCurrency = profile?.currencyCode ?? "CDF";
  const cabinetName = companyDisplayName(profile);
  const [selectedClient, setSelectedClient] = useState("all");
  const [paymentOrders, setPaymentOrders] = useState<DashboardOrder[]>([]);
  const [cashVouchers, setCashVouchers] = useState<DashboardCashVoucher[]>([]);

  useEffect(() => {
    if (!databaseConnected) return;
    let active = true;
    const refresh = async () => {
      const [orders, vouchers] = await Promise.allSettled([
        apiRequest<DashboardOrder[]>("/payment-orders"),
        apiRequest<DashboardCashVoucher[]>("/cash-vouchers"),
      ]);
      if (!active) return;
      if (orders.status === "fulfilled") setPaymentOrders(orders.value);
      if (vouchers.status === "fulfilled") setCashVouchers(vouchers.value);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 45_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [databaseConnected]);

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
  const today = useKinshasaDate();
  const receivables = today ? getReceivables(activeInvoices, today) : [];
  const outstandingByCurrency = receivables.reduce(
    (totals, { invoice, balance }) => ({
      ...totals,
      [invoice.currency]: totals[invoice.currency] + balance,
    }),
    { CDF: 0, USD: 0 },
  );
  const visibleClients = clients.filter((client) =>
    selectedClient === "all" || client.id === selectedClient,
  );
  const clientsToFollowUp = visibleClients.filter((client) => client.status !== "À jour");
  const attentionCount = clientsToFollowUp.length;
  const certified = visibleInvoices.filter(
    (invoice) => invoice.fiscalStatus === "CERTIFIED",
  ).length;
  const overdueCount = receivables.filter((item) => item.status === "overdue").length;
  const dueTodayCount = receivables.filter((item) => item.status === "today").length;
  const activeOrders = paymentOrders.filter((order) =>
    ["SUBMITTED", "FINANCE_APPROVED", "APPROVED"].includes(order.status),
  );
  const vouchersToReview = cashVouchers.filter(
    (voucher) => voucher.status === "PENDING_APPROVAL",
  );
  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-icon" aria-hidden="true">
            <Activity className="h-6 w-6" />
          </span>
          <div>
            <p className="dashboard-eyebrow">
              {cabinetName} <span>·</span> {companyLocation(profile)}
            </p>
            <h1>Vue d’ensemble</h1>
            <p className="dashboard-hero-caption">
              Dossiers, facturation et trésorerie du cabinet
            </p>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <Link
            href="/clients"
            className="dashboard-hero-icon-button"
            aria-label="Ouvrir les dossiers clients"
            title="Dossiers clients"
          >
            <Users className="h-5 w-5" />
          </Link>
          <Link href="/invoices" className="dashboard-hero-primary">
            <FilePlus2 className="h-4 w-4" />
            Gérer les factures
          </Link>
        </div>
      </header>

      <div className="dashboard-toolbar">
        <h2>Indicateurs du cabinet</h2>
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
            label: "Entreprises suivies",
            value: visibleClients.length,
            detail: `${attentionCount} dossier${attentionCount === 1 ? "" : "s"} à suivre`,
            icon: BriefcaseBusiness,
            tone: "is-blue",
          },
          {
            label: "Factures clients",
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
            detail: `${overdueCount} facture${overdueCount === 1 ? "" : "s"} en retard`,
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

      <section className="dashboard-attention-grid" aria-label="Éléments nécessitant un suivi">
        {[
          { href: "/payment-orders", label: "OP en cours", detail: "En attente de visa ou de paiement", count: activeOrders.length, Icon: ScrollText, tone: "is-violet" },
          { href: "/recouvrement", label: "Factures non réglées", detail: `${overdueCount} en retard · ${dueTodayCount} à échéance aujourd’hui`, count: receivables.length, Icon: CalendarClock, tone: "is-amber" },
          { href: "/cash-vouchers", label: "Bons à examiner", detail: "Sorties caisse en attente de validation", count: vouchersToReview.length, Icon: Receipt, tone: "is-blue" },
        ].map(({ href, label, detail, count, Icon, tone }) => (
          <Link key={href} href={href} className={`dashboard-attention-card ${tone}`}>
            <span className="dashboard-attention-orbit" aria-hidden="true" />
            <span className="dashboard-attention-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong>{label}</strong>
              <small>{!databaseConnected ? "Données à actualiser" : detail}</small>
            </span>
            <span className="dashboard-attention-count">{count}</span>
            <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <section className="dashboard-modules" aria-labelledby="dashboard-modules-title">
        <h2 id="dashboard-modules-title">Accès rapides</h2>
        <div className="dashboard-module-grid">
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
        </div>
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
              {receivables.slice(0, 2).map(({ invoice, balance, status }) => (
                  <Link
                    key={invoice.id}
                    href={{ pathname: "/payments", query: { facture: invoice.databaseId ?? invoice.id } }}
                    className="dashboard-priority-item"
                  >
                    <span className={`dashboard-priority-icon ${status === "overdue" ? "is-rose" : "is-amber"}`}>
                      <ArrowDownRight className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{invoice.client}</strong>
                      <small>
                        {formatMoney(balance, invoice.currency)} · {receivableLabels[status]}
                      </small>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Link>
              ))}
              {activeOrders.slice(0, 2).map((order) => (
                <Link key={order.id} href="/payment-orders" className="dashboard-priority-item dashboard-activity-alert">
                  <span className="dashboard-priority-icon is-amber"><ScrollText className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <strong>{order.orderNumber} · {order.beneficiary}</strong>
                    <small>OP en cours · {formatMoney(order.amount, order.currency)}</small>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              ))}
              {vouchersToReview.slice(0, 2).map((voucher) => (
                <Link key={voucher.id} href="/cash-vouchers" className="dashboard-priority-item dashboard-activity-alert">
                  <span className="dashboard-priority-icon is-rose"><Receipt className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <strong>{voucher.voucherNumber} · {voucher.beneficiary}</strong>
                    <small>Bon de sortie à examiner · {formatMoney(voucher.amount, voucher.currency)}</small>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              ))}
              {!clientsToFollowUp.length && !receivables.length && !activeOrders.length && !vouchersToReview.length && (
                <div className="dashboard-priority-empty">
                  <span className="dashboard-priority-icon is-green">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <span>{databaseConnected ? "Tout est à jour" : "Données du cabinet indisponibles"}</span>
                </div>
              )}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
