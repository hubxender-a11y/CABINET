"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useWorkspaceStore, type WorkspaceInvoice } from "@/components/workspace-store";
import { apiRequest } from "@/lib/api";
import {
  companyDisplayName,
  companyLocation,
  useCompanyProfile,
} from "@/components/company-profile";
import { formatDate, formatMoney } from "@/lib/formatting";

type ReportExpense = {
  id?: string;
  category?: string;
  date: string;
  amount: string | number;
  currency: "CDF" | "USD";
  description?: string | null;
};

type MonthlyReportResponse = {
  period: string;
  invoices: {
    id: string;
    invoiceNumber: string;
    customer: { id: string; name: string };
    totalAmount: string;
    paidAmount: string;
    currency: "CDF" | "USD";
    fiscalStatus: string;
    issueDate: string;
  }[];
  payments: {
    id: string;
    amount: string;
    currency: "CDF" | "USD";
    createdAt: string;
    invoice: { id: string; invoiceNumber: string } | null;
    customer: { name: string } | null;
  }[];
  expenses: ReportExpense[];
};

type MonthlyReportData = {
  period: string;
  invoices: WorkspaceInvoice[];
  payments: ReturnType<typeof mapMonthlyPayment>[];
  expenses: ReportExpense[];
};

function isReportExpense(value: unknown): value is ReportExpense {
  if (!value || typeof value !== "object") return false;
  const expense = value as Record<string, unknown>;
  return (
    typeof expense.date === "string" &&
    Number.isFinite(Date.parse(expense.date)) &&
    (typeof expense.amount === "string" || typeof expense.amount === "number") &&
    Number.isFinite(Number(expense.amount)) &&
    (expense.currency === "CDF" || expense.currency === "USD") &&
    (expense.id === undefined || typeof expense.id === "string") &&
    (expense.category === undefined || typeof expense.category === "string") &&
    (expense.description === undefined ||
      expense.description === null ||
      typeof expense.description === "string")
  );
}

function isMonthlyInvoice(value: unknown): value is MonthlyReportResponse["invoices"][number] {
  if (!value || typeof value !== "object") return false;
  const invoice = value as Record<string, unknown>;
  const customer = invoice.customer;
  return (
    typeof invoice.id === "string" &&
    typeof invoice.invoiceNumber === "string" &&
    typeof invoice.totalAmount === "string" &&
    Number.isFinite(Number(invoice.totalAmount)) &&
    typeof invoice.paidAmount === "string" &&
    Number.isFinite(Number(invoice.paidAmount)) &&
    (invoice.currency === "CDF" || invoice.currency === "USD") &&
    typeof invoice.fiscalStatus === "string" &&
    typeof invoice.issueDate === "string" &&
    Number.isFinite(Date.parse(invoice.issueDate)) &&
    Boolean(customer) &&
    typeof customer === "object" &&
    typeof (customer as Record<string, unknown>).id === "string" &&
    typeof (customer as Record<string, unknown>).name === "string"
  );
}

function isMonthlyPayment(value: unknown): value is MonthlyReportResponse["payments"][number] {
  if (!value || typeof value !== "object") return false;
  const payment = value as Record<string, unknown>;
  const invoice = payment.invoice;
  const customer = payment.customer;
  return (
    typeof payment.id === "string" &&
    typeof payment.amount === "string" &&
    Number.isFinite(Number(payment.amount)) &&
    (payment.currency === "CDF" || payment.currency === "USD") &&
    typeof payment.createdAt === "string" &&
    Number.isFinite(Date.parse(payment.createdAt)) &&
    (invoice === null ||
      (typeof invoice === "object" &&
        typeof (invoice as Record<string, unknown>).id === "string" &&
        typeof (invoice as Record<string, unknown>).invoiceNumber === "string")) &&
    (customer === null ||
      (typeof customer === "object" &&
        typeof (customer as Record<string, unknown>).name === "string"))
  );
}

function kinshasaDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthForKinshasa(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function amountPaid(invoice: WorkspaceInvoice) {
  return invoice.paidAmount ?? (invoice.status === "Payée" ? invoice.amount : 0);
}

function monthLabel(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return "";
  return new Intl.DateTimeFormat("fr-CD", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Kinshasa",
  }).format(new Date(`${value}-15T12:00:00`));
}

function mapMonthlyPayment(payment: MonthlyReportResponse["payments"][number]) {
  return {
    id: payment.id,
    invoiceId: payment.invoice?.id ?? "",
    invoiceNumber: payment.invoice?.invoiceNumber ?? "Paiement non affecté",
    customer: payment.customer?.name ?? "Client non renseigné",
    amount: payment.amount,
    currency: payment.currency,
    method: "OTHER" as const,
    createdAt: payment.createdAt,
  };
}

function mapMonthlyInvoice(invoice: MonthlyReportResponse["invoices"][number]): WorkspaceInvoice {
  const status: WorkspaceInvoice["status"] =
    invoice.fiscalStatus === "REJECTED" || invoice.fiscalStatus === "CANCELLED"
      ? "Rejetée"
      : Number(invoice.paidAmount) >= Number(invoice.totalAmount) && Number(invoice.totalAmount) > 0
        ? "Payée"
        : invoice.fiscalStatus === "CERTIFIED"
          ? "Certifiée"
          : invoice.fiscalStatus === "PENDING_FISCALIZATION"
            ? "En attente"
            : "Brouillon";
  return {
    id: invoice.invoiceNumber,
    databaseId: invoice.id,
    clientId: invoice.customer.id,
    client: invoice.customer.name,
    amount: Number(invoice.totalAmount),
    paidAmount: Number(invoice.paidAmount),
    currency: invoice.currency,
    status,
    date: invoice.issueDate.slice(0, 10),
  };
}

export default function ReportsPage() {
  const { databaseConnected, databaseError } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const primaryCurrency = profile?.currencyCode ?? "CDF";
  const [period, setPeriod] = useState("");
  const [monthlyData, setMonthlyData] = useState<MonthlyReportData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setPeriod(monthForKinshasa(now));
      setGeneratedAt(now);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const periodBounds = useMemo(() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
    const [year, month] = period.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return { start: `${period}-01`, end: `${period}-${String(lastDay).padStart(2, "0")}` };
  }, [period]);

  useEffect(() => {
    if (!databaseConnected || !periodBounds) return;
    const controller = new AbortController();
    void apiRequest<MonthlyReportResponse>(
      `/dashboard/monthly?period=${encodeURIComponent(period)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (data.period !== period || !Array.isArray(data.invoices) ||
            !Array.isArray(data.payments) || !Array.isArray(data.expenses) ||
            !data.invoices.every(isMonthlyInvoice) ||
            !data.payments.every(isMonthlyPayment) ||
            !data.expenses.every(isReportExpense)) {
          throw new Error("Le rapport mensuel reçu est incomplet ou invalide.");
        }
        setMonthlyData({
          period: data.period,
          invoices: data.invoices.map(mapMonthlyInvoice),
          payments: data.payments.map(mapMonthlyPayment),
          expenses: data.expenses,
        });
        setError("");
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        console.error("Chargement du rapport mensuel impossible.", caught);
        setError(
          caught instanceof Error
            ? caught.message
            : "Impossible de charger le rapport mensuel.",
        );
      });

    return () => controller.abort();
  }, [databaseConnected, period, periodBounds]);

  const monthlyLoading =
    databaseConnected && Boolean(periodBounds) && monthlyData?.period !== period && !error;

  const report = useMemo(() => {
    if (!periodBounds) return null;
    const sourceInvoices =
      databaseConnected && monthlyData?.period === period ? monthlyData.invoices : [];
    const sourcePayments =
      databaseConnected && monthlyData?.period === period ? monthlyData.payments : [];
    const sourceExpenses =
      databaseConnected && monthlyData?.period === period ? monthlyData.expenses : [];
    const periodInvoices = sourceInvoices.filter(
      (invoice) => invoice.date >= periodBounds.start && invoice.date <= periodBounds.end,
    );
    const issuedInvoices = periodInvoices.filter(
      (invoice) => invoice.status !== "Brouillon" && invoice.status !== "Rejetée",
    );
    const periodPayments = sourcePayments.filter((payment) => {
      const date = kinshasaDate(payment.createdAt);
      return date >= periodBounds.start && date <= periodBounds.end;
    });
    const periodExpenses = sourceExpenses.filter((expense) => {
      const date = expense.date.slice(0, 10);
      return date >= periodBounds.start && date <= periodBounds.end;
    });
    const currencies = new Set([
      primaryCurrency,
      ...issuedInvoices.map((invoice) => invoice.currency),
      ...periodPayments.map((payment) => payment.currency),
      ...periodExpenses.map((expense) => expense.currency),
    ]);
    const moneyRows = [...currencies]
      .sort((left, right) => left === primaryCurrency ? -1 : right === primaryCurrency ? 1 : left.localeCompare(right))
      .map((currency) => {
        const currencyInvoices = issuedInvoices.filter((invoice) => invoice.currency === currency);
        const currencyPayments = periodPayments.filter((payment) => payment.currency === currency);
        const currencyExpenses = periodExpenses.filter((expense) => expense.currency === currency);
        const invoiced = currencyInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
        const collected = currencyPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const receivables = currencyInvoices.reduce(
          (sum, invoice) => sum + Math.max(invoice.amount - amountPaid(invoice), 0),
          0,
        );
        const expenseTotal = currencyExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        return {
          currency,
          invoiceCount: currencyInvoices.length,
          invoiced,
          collected,
          receivables,
          expenses: expenseTotal,
          netCash: collected - expenseTotal,
        };
      });

    const invoiceNumbers = periodInvoices.map((invoice) => invoice.id.trim()).filter(Boolean);
    const duplicateCount = invoiceNumbers.length - new Set(invoiceNumbers).size;
    const invalidAmounts = periodInvoices.filter(
      (invoice) =>
        !Number.isFinite(invoice.amount) ||
        invoice.amount <= 0 ||
        !Number.isFinite(amountPaid(invoice)) ||
        amountPaid(invoice) < 0 ||
        amountPaid(invoice) > invoice.amount,
    ).length;
    const unlinkedPayments = periodPayments.filter((payment) => !payment.invoiceId).length;
    const drafts = periodInvoices.filter((invoice) => invoice.status === "Brouillon").length;
    const rejected = periodInvoices.filter((invoice) => invoice.status === "Rejetée").length;
    const uncategorizedExpenses = periodExpenses.filter((expense) => !expense.category?.trim()).length;

    const auditChecks = [
      {
        label: "Références de factures uniques",
        detail: duplicateCount
          ? `${duplicateCount} référence(s) en doublon à corriger.`
          : `${periodInvoices.length} facture(s) contrôlée(s), aucune référence en doublon.`,
        attention: duplicateCount > 0,
      },
      {
        label: "Montants et règlements cohérents",
        detail: invalidAmounts
          ? `${invalidAmounts} facture(s) présentent un montant encaissé incohérent avec le total.`
          : "Les montants encaissés sont compris entre zéro et le total de chaque facture.",
        attention: invalidAmounts > 0,
      },
      {
        label: "Règlements rattachés",
        detail: unlinkedPayments
          ? `${unlinkedPayments} règlement(s) de la période ne sont rattachés à aucune facture.`
          : `${periodPayments.length} règlement(s) de la période avec une référence de facture.`,
        attention: unlinkedPayments > 0,
      },
      {
        label: "Factures à régulariser",
        detail: `${drafts} brouillon(s) et ${rejected} facture(s) rejetée(s) à examiner.`,
        attention: drafts + rejected > 0,
      },
      {
        label: "Charges documentées",
        detail: uncategorizedExpenses
          ? `${uncategorizedExpenses} charge(s) sans catégorie à compléter.`
          : `${periodExpenses.length} charge(s) enregistrée(s) ; rapprocher les justificatifs avant clôture.`,
        attention: uncategorizedExpenses > 0,
      },
    ];

    return {
      invoices: periodInvoices,
      issuedInvoices,
      payments: periodPayments,
      expenses: periodExpenses,
      moneyRows,
      invoiceCount: periodInvoices.length,
      customerCount: new Set(issuedInvoices.map((invoice) => invoice.clientId)).size,
      auditChecks,
      hasAuditAttention: auditChecks.some((check) => check.attention),
    };
  }, [
    databaseConnected,
    monthlyData,
    period,
    periodBounds,
    primaryCurrency,
  ]);

  const title = companyDisplayName(profile);
  const selectedMonthLabel = monthLabel(period);
  const monthlyReady = databaseConnected && monthlyData?.period === period;
  const reportError = error || (!databaseConnected ? databaseError : "");
  const reportAvailable = !reportError && monthlyReady;

  return (
    <div className="report-page space-y-5">
      <header className="report-header">
        <div>
          <p className="report-eyebrow">Pilotage comptable · Clôture mensuelle</p>
          <h1>Rapport — {title}</h1>
          <p className="report-subtitle">
            {selectedMonthLabel
              ? `${selectedMonthLabel} · ${companyLocation(profile)} · heure de Kinshasa`
              : "Sélectionnez une période pour préparer le rapport."}
          </p>
        </div>
        <div className="report-toolbar report-screen-only">
          <label className="report-period-control">
            <span>Période</span>
            <input
              aria-label="Période du rapport"
              type="month"
              value={period}
              onChange={(event) => {
                setError("");
                setPeriod(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="report-print-button"
            onClick={() => window.print()}
            disabled={!report || monthlyLoading || !reportAvailable}
          >
            <Printer className="h-4 w-4" />
            Imprimer le rapport
          </button>
        </div>
      </header>

      {reportError && (
        <p role="alert" className="report-error report-screen-only">{reportError}</p>
      )}

      {report && periodBounds && reportAvailable && (
        <>
          <section className="report-summary-grid" aria-label="Indicateurs de la période">
            {[
              { label: "Factures émises", value: report.issuedInvoices.length, detail: `${report.customerCount} client(s) facturé(s)` },
              { label: "Honoraires facturés", value: report.moneyRows.map((row) => formatMoney(row.invoiced, row.currency)).join(" · "), detail: "Factures hors brouillons et rejets" },
              { label: "Règlements reçus", value: report.moneyRows.map((row) => formatMoney(row.collected, row.currency)).join(" · "), detail: `${report.payments.length} paiement(s) enregistré(s)` },
              { label: "Charges enregistrées", value: report.moneyRows.map((row) => formatMoney(row.expenses, row.currency)).join(" · "), detail: `${report.expenses.length} charge(s) sur la période` },
            ].map((item) => (
              <article key={item.label} className="report-summary-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </section>

          <section className="report-panel">
            <div className="report-section-heading">
              <div>
                <h2>Synthèse financière par devise</h2>
                <p>Les montants CDF et USD sont présentés séparément, sans conversion implicite.</p>
              </div>
              <span className="report-period-stamp">{formatDate(periodBounds.start)} – {formatDate(periodBounds.end)}</span>
            </div>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Devise</th>
                    <th>Factures</th>
                    <th>Honoraires facturés</th>
                    <th>Règlements reçus</th>
                    <th>Créances restantes</th>
                    <th>Charges</th>
                    <th>Flux net*</th>
                  </tr>
                </thead>
                <tbody>
                  {report.moneyRows.map((row) => (
                    <tr key={row.currency}>
                      <td><strong>{row.currency}</strong></td>
                      <td>{row.invoiceCount}</td>
                      <td>{formatMoney(row.invoiced, row.currency)}</td>
                      <td>{formatMoney(row.collected, row.currency)}</td>
                      <td>{formatMoney(row.receivables, row.currency)}</td>
                      <td>{formatMoney(row.expenses, row.currency)}</td>
                      <td><strong>{formatMoney(row.netCash, row.currency)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="report-footnote">* Règlements enregistrés moins charges saisies pour la période ; ce montant n’est pas un rapprochement bancaire.</p>
          </section>

          <section className="report-panel">
            <div className="report-section-heading">
              <div>
                <h2>Registre des factures</h2>
                <p>{report.invoiceCount} facture(s) créée(s) pendant la période sélectionnée.</p>
              </div>
            </div>
            {report.invoices.length ? (
              <div className="report-table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Référence</th>
                      <th>Client</th>
                      <th>Statut</th>
                      <th>Montant</th>
                      <th>Encaissé</th>
                      <th>Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.invoices.map((invoice) => (
                      <tr key={invoice.databaseId ?? invoice.id}>
                        <td>{formatDate(invoice.date)}</td>
                        <td>{invoice.id}</td>
                        <td>{invoice.client}</td>
                        <td><span className={`report-status status-${invoice.status === "Payée" ? "paid" : invoice.status === "Rejetée" ? "rejected" : invoice.status === "Brouillon" ? "draft" : invoice.status === "En attente" ? "pending" : "certified"}`}>{invoice.status}</span></td>
                        <td>{formatMoney(invoice.amount, invoice.currency)}</td>
                        <td>{formatMoney(amountPaid(invoice), invoice.currency)}</td>
                        <td>{formatMoney(Math.max(invoice.amount - amountPaid(invoice), 0), invoice.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="report-empty">Aucune facture sur cette période.</p>
            )}
          </section>

          <div className="report-ledger-grid">
            <section className="report-panel">
              <div className="report-section-heading">
                <div>
                  <h2>Registre des règlements</h2>
                  <p>{report.payments.length} paiement(s) reçu(s) pendant la période.</p>
                </div>
              </div>
              {report.payments.length ? (
                <div className="report-table-scroll">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Facture</th>
                        <th>Client</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{formatDate(kinshasaDate(payment.createdAt))}</td>
                          <td>{payment.invoiceNumber}</td>
                          <td>{payment.customer}</td>
                          <td>{formatMoney(Number(payment.amount), payment.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="report-empty">Aucun règlement sur cette période.</p>
              )}
            </section>

            <section className="report-panel">
              <div className="report-section-heading">
                <div>
                  <h2>Registre des charges</h2>
                  <p>{report.expenses.length} charge(s) enregistrée(s) pendant la période.</p>
                </div>
              </div>
              {report.expenses.length ? (
                <div className="report-table-scroll">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Catégorie</th>
                        <th>Description</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.expenses.map((expense, index) => (
                        <tr key={expense.id ?? `${expense.date}-${index}`}>
                          <td>{formatDate(expense.date.slice(0, 10))}</td>
                          <td>{expense.category?.trim() || "À catégoriser"}</td>
                          <td>{expense.description || "—"}</td>
                          <td>{formatMoney(Number(expense.amount), expense.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="report-empty">Aucune charge sur cette période.</p>
              )}
            </section>
          </div>

          <section className="report-panel report-audit-panel">
            <div className="report-section-heading">
              <div>
                <p className="report-eyebrow">Contrôle de fin de mois</p>
                <h2>Liste de contrôle d’audit</h2>
                <p>Contrôles automatiques préparatoires à la clôture comptable.</p>
              </div>
              <span className={`report-audit-badge ${report.hasAuditAttention ? "needs-review" : "checks-clear"}`}>
                {report.hasAuditAttention ? "Points à vérifier" : "Contrôles sans anomalie"}
              </span>
            </div>
            <ul className="report-audit-list">
              {report.auditChecks.map((check) => (
                <li key={check.label} className={check.attention ? "needs-review" : "checks-clear"}>
                  <span className="report-audit-indicator" aria-hidden="true" />
                  <div><strong>{check.label}</strong><p>{check.detail}</p></div>
                  <span className="report-audit-state">{check.attention ? "À vérifier" : "Contrôlé"}</span>
                </li>
              ))}
            </ul>
            <p className="report-audit-disclaimer">
              Ce rapport aide à préparer la clôture mensuelle. Il ne remplace pas la vérification des pièces justificatives, le rapprochement bancaire ni la validation du responsable comptable.
            </p>
          </section>

          <footer className="report-footer">
            <span>{title} · Rapport de clôture mensuelle</span>
            <span>{generatedAt ? `Édité le ${formatDate(generatedAt, { dateStyle: "long" })} · Kinshasa` : ""}</span>
          </footer>
        </>
      )}

      {(monthlyLoading || (databaseConnected && !monthlyReady)) && (
        <p className="report-loading report-screen-only">Chargement des données du rapport…</p>
      )}
      {!periodBounds && period && <p role="alert" className="report-error">La période sélectionnée est invalide.</p>}
      {!period && <p className="report-loading report-screen-only">Préparation du rapport…</p>}
    </div>
  );
}
