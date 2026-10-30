"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { apiRequest } from "@/lib/api";

type ExpenseMethod =
  | "CASH_USD"
  | "CASH_CDF"
  | "BANK_TRANSFER"
  | "CARD"
  | "MOBILE_MONEY"
  | "OTHER";

type Expense = {
  id: string;
  category: string;
  date: string;
  amount: string;
  currency: "CDF" | "USD";
  method: ExpenseMethod;
  description?: string | null;
};

const categories = [
  "Loyer",
  "Télécommunications",
  "Transport",
  "Fournitures",
  "Impôts et taxes",
  "Maintenance",
  "Salaires",
  "Autre",
];
const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL);
const methodLabels: Record<ExpenseMethod, string> = {
  CASH_USD: "Espèces (USD)",
  CASH_CDF: "Espèces (CDF)",
  BANK_TRANSFER: "Virement bancaire",
  CARD: "Carte bancaire",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Autre",
};
const formatMoney = (amount: number, currency: string) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;

export default function ExpensesPage() {
  const { databaseConnected } = useWorkspaceStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState(categories[0]);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Expense["currency"]>("CDF");
  const [method, setMethod] = useState<ExpenseMethod>("BANK_TRANSFER");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!databaseConnected) {
        if (apiConfigured) {
          setExpenses([]);
          setError("API indisponible : les charges réelles ne peuvent pas être chargées.");
          setHydrated(true);
          return;
        }
        try {
          setExpenses(
            JSON.parse(
              window.localStorage.getItem("factura-expenses") ?? "[]",
            ) as Expense[],
          );
        } catch (caught) {
          console.error("Lecture des charges locales impossible.", caught);
          setExpenses([]);
        }
        setHydrated(true);
        return;
      }

      setLoading(true);
      void apiRequest<Expense[]>("/expenses")
        .then((rows) => {
          if (active) {
            setExpenses(rows);
            setError("");
            setHydrated(true);
          }
        })
        .catch((caught: unknown) => {
          console.error("Chargement des charges du cabinet impossible.", caught);
          if (active) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Impossible de charger les charges enregistrées.",
            );
            setHydrated(true);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [databaseConnected]);

  useEffect(() => {
    if (!hydrated || databaseConnected) return;
    window.localStorage.setItem("factura-expenses", JSON.stringify(expenses));
  }, [databaseConnected, expenses, hydrated]);

  const totals = useMemo(
    () =>
      expenses.reduce(
        (sum, expense) => ({
          ...sum,
          [expense.currency]: sum[expense.currency] + Number(expense.amount),
        }),
        { CDF: 0, USD: 0 },
      ),
    [expenses],
  );
  const availableMethods = Object.entries(methodLabels).filter(
    ([value]) =>
      (value !== "CASH_CDF" || currency === "CDF") &&
      (value !== "CASH_USD" || currency === "USD"),
  );

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Saisissez un montant valide supérieur à zéro.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category,
        date,
        amount,
        currency,
        method,
        description: description.trim() || undefined,
      };

      if (databaseConnected) {
        const created = await apiRequest<Expense>("/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setExpenses((current) => [created, ...current]);
      } else {
        setExpenses((current) => [
          { ...payload, id: crypto.randomUUID() },
          ...current,
        ]);
      }

      setAmount("");
      setDescription("");
      setSuccess("Charge enregistrée.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer la charge.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          Comptabilité interne
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Charges opérationnelles
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Saisissez les dépenses du cabinet et consultez leur historique par devise.
        </p>
      </header>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          databaseConnected
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {databaseConnected
          ? "Les charges sont enregistrées dans PostgreSQL et journalisées."
          : "Mode démonstration : les charges restent dans ce navigateur et ne sont pas partagées."}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {(["CDF", "USD"] as const).map((code) => (
          <article key={code} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Charges enregistrées</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatMoney(totals[code], code)}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <form
          onSubmit={submitExpense}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nouvelle charge</h2>
            <p className="mt-1 text-sm text-slate-500">
              La correction d’une écriture se fait par une nouvelle écriture d’ajustement.
            </p>
          </div>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Rubrique
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            >
              {categories.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Date
            <input
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Montant
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Devise
              <select
                value={currency}
                onChange={(event) => {
                  const nextCurrency = event.target.value as Expense["currency"];
                  setCurrency(nextCurrency);
                  if (
                    (method === "CASH_CDF" && nextCurrency !== "CDF") ||
                    (method === "CASH_USD" && nextCurrency !== "USD")
                  ) setMethod("BANK_TRANSFER");
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="CDF">CDF</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Moyen de paiement
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as ExpenseMethod)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            >
              {availableMethods.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Note ou justificatif (facultatif)
            <textarea
              maxLength={500}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="Ex. Référence du reçu, période concernée…"
            />
          </label>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer la charge"}
          </button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Historique des charges</h2>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? "Chargement…" : `${expenses.length} écriture(s)`}
            </p>
          </div>
          {expenses.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date / rubrique</th>
                    <th className="px-4 py-3 font-medium">Paiement</th>
                    <th className="px-4 py-3 text-right font-medium">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{expense.category}</p>
                        <p className="text-xs text-slate-500">
                          {expense.date.slice(0, 10)}
                          {expense.description ? ` · ${expense.description}` : ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {methodLabels[expense.method]}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                        {formatMoney(Number(expense.amount), expense.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              {loading ? "Chargement des données…" : "Aucune charge enregistrée."}
            </p>
          )}
        </section>
      </section>
    </div>
  );
}
