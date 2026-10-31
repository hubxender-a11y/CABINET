"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { apiRequest } from "@/lib/api";
import {
  companyDisplayName,
  companyLocation,
  useCompanyProfile,
} from "@/components/company-profile";
import { formatDate, formatMoney } from "@/lib/formatting";

type CurrencyReport = {
  currency: string;
  revenueToday: string;
  revenueMonth: string;
  receivables: string;
  cashCollectedMonth: string;
  expensesMonth: string;
};

type DashboardReport = {
  period: { start: string; end: string; timezone: string };
  summary: {
    customerCount: number;
    invoicesIssued: number;
    certifiedInvoices: number;
    pendingCertification: number;
    rejectedInvoices: number;
    followUpCount: number;
  };
  moneyByCurrency: CurrencyReport[];
};

type LocalExpense = {
  date: string;
  amount: string | number;
  currency: "CDF" | "USD";
};

function isLocalExpense(value: unknown): value is LocalExpense {
  if (!value || typeof value !== "object") return false;
  const expense = value as Record<string, unknown>;
  return (
    typeof expense.date === "string" &&
    (typeof expense.amount === "string" || typeof expense.amount === "number") &&
    (expense.currency === "CDF" || expense.currency === "USD")
  );
}

export default function ReportsPage() {
  const { clients, invoices, payments, databaseConnected } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const primaryCurrency = profile?.currencyCode ?? "CDF";
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState("");
  const loading = databaseConnected && !report && !error;
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [localExpenses, setLocalExpenses] = useState<LocalExpense[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentDate(new Date());
      if (databaseConnected) {
        setLocalExpenses([]);
        setError("");
        return;
      }

      try {
        const stored = JSON.parse(
          window.localStorage.getItem("factura-expenses") ?? "[]",
        ) as unknown;
        if (!Array.isArray(stored) || !stored.every(isLocalExpense)) {
          throw new Error("Le format des charges locales est invalide.");
        }
        setLocalExpenses(stored);
      } catch (caught) {
        console.error("Chargement des charges locales du rapport impossible.", caught);
        setError(
          caught instanceof Error
            ? caught.message
            : "Impossible de charger les charges locales du rapport.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [databaseConnected]);

  useEffect(() => {
    if (!databaseConnected) return;

    const controller = new AbortController();
    apiRequest<DashboardReport>("/dashboard/overview", {
      signal: controller.signal,
    })
      .then((data) => {
        setError("");
        setReport(data);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        console.error("Chargement du rapport du cabinet impossible.", caught);
        setError(
          caught instanceof Error
            ? caught.message
            : "Impossible de charger le rapport.",
        );
      });

    return () => controller.abort();
  }, [databaseConnected]);

  const localReport = useMemo(() => {
    if (!currentDate) return [];
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const currentInvoices = invoices.filter((invoice) => {
      const date = new Date(`${invoice.date}T12:00:00`);
      return (
        date >= monthStart &&
        invoice.status !== "Brouillon" &&
        invoice.status !== "Rejetée"
      );
    });
    const currentPayments = payments.filter(
      (payment) => new Date(payment.createdAt) >= monthStart,
    );
    const currentExpenses = localExpenses.filter((expense) => {
      const date = new Date(`${expense.date.slice(0, 10)}T12:00:00`);
      return date >= monthStart && date <= currentDate;
    });
    const currencies = new Set([
      ...currentInvoices.map((invoice) => invoice.currency),
      ...currentPayments.map((payment) => payment.currency),
      ...currentExpenses.map((expense) => expense.currency),
    ]);

    return [...currencies]
      .sort((left, right) => {
        if (left === primaryCurrency) return -1;
        if (right === primaryCurrency) return 1;
        return left.localeCompare(right);
      })
      .map((currency) => {
      const matchingInvoices = currentInvoices.filter(
        (invoice) => invoice.currency === currency,
      );
      const matchingPayments = currentPayments.filter(
        (payment) => payment.currency === currency,
      );
      const matchingExpenses = currentExpenses.filter(
        (expense) => expense.currency === currency,
      );
      return {
        currency,
        revenueMonth: matchingInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
        cashCollectedMonth: matchingPayments.reduce(
          (sum, payment) => sum + Number(payment.amount),
          0,
        ),
        receivables: matchingInvoices.reduce(
          (sum, invoice) =>
            sum + Math.max(invoice.amount - (invoice.paidAmount ?? 0), 0),
          0,
        ),
        expensesMonth: matchingExpenses.reduce(
          (sum, expense) => sum + Number(expense.amount),
          0,
        ),
      };
    });
  }, [currentDate, invoices, localExpenses, payments, primaryCurrency]);

  const currentMonth = currentDate
    ? new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
        timeZone: "Africa/Kinshasa",
      }).format(currentDate)
    : "";
  const invoiceCount = report?.summary.invoicesIssued ??
    invoices.filter((invoice) => invoice.status !== "Brouillon" && invoice.status !== "Rejetée").length;
  const certificationCount = report?.summary.certifiedInvoices ??
    invoices.filter((invoice) => invoice.status === "Certifiée").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
            Pilotage comptable
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Rapport — {companyDisplayName(profile)}
          </h1>
          <p className="mt-2 text-sm capitalize text-slate-500">
            {currentMonth ? `${currentMonth} · ${companyLocation(profile)} · heure de Kinshasa` : "Période en cours…"}
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-medium ${
          databaseConnected
            ? "bg-emerald-100 text-emerald-800"
            : "bg-amber-100 text-amber-900"
        }`}>
          {databaseConnected ? "Données PostgreSQL" : "Données locales de démonstration"}
        </span>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Dossiers clients", value: report?.summary.customerCount ?? clients.length },
          { label: "Factures suivies", value: invoiceCount },
          { label: "Certifiées", value: certificationCount },
          { label: "À relancer", value: report?.summary.followUpCount ?? clients.filter((client) => client.status !== "À jour").length },
        ].map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Synthèse financière par devise</h2>
          <p className="mt-1 text-sm text-slate-500">
            Les montants CDF et USD restent séparés, sans conversion implicite.
          </p>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Chargement du rapport…</p>
        ) : (report?.moneyByCurrency.length ?? localReport.length) ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Devise</th>
                  <th className="px-5 py-3 text-right font-medium">Honoraires du mois</th>
                  <th className="px-5 py-3 text-right font-medium">Règlements reçus</th>
                  <th className="px-5 py-3 text-right font-medium">Créances restantes</th>
                  <th className="px-5 py-3 text-right font-medium">Charges du mois</th>
                </tr>
              </thead>
              <tbody>
                {(report?.moneyByCurrency ?? localReport).map((row) => (
                  <tr key={row.currency} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-semibold text-slate-900">{row.currency}</td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {formatMoney(row.revenueMonth, row.currency)}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {formatMoney(row.cashCollectedMonth, row.currency)}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {formatMoney(row.receivables, row.currency)}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {formatMoney(row.expensesMonth, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Aucune facture ni aucun règlement sur cette période.
          </p>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500">
        {databaseConnected
          ? "Synthèse calculée à partir des données du cabinet dans PostgreSQL."
          : "Le rapport local utilise uniquement les données enregistrées dans ce navigateur; les montants ne sont pas partagés entre appareils."}
        {databaseConnected && report
          ? ` Période API : ${formatDate(report.period.start)} – ${formatDate(report.period.end)}.`
          : ""}
      </p>
    </div>
  );
}
