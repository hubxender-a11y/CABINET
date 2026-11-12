"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Check, CircleAlert, RefreshCw, Wallet } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { apiRequest } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/formatting";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

type Currency = "CDF" | "USD";
type CashAccount = {
  id: string;
  name: string;
  currency: Currency;
  balance: string;
  paymentOrderAvailable: string;
};
type CashMovement = {
  id: string;
  date: string;
  direction: "IN" | "OUT";
  amount: string;
  description: string;
  reference?: string | null;
  sourceType: string;
  cashAccount: { name: string; currency: Currency };
};
type Treasury = { accounts: CashAccount[]; movements: CashMovement[] };

export default function FundingPage() {
  const { databaseConnected } = useWorkspaceStore();
  const today = useKinshasaDate() ?? "";
  const [treasury, setTreasury] = useState<Treasury>({ accounts: [], movements: [] });
  const [userRole, setUserRole] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const date = dateOverride ?? today;
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async () => {
    const data = await apiRequest<Treasury>("/cash-vouchers/treasury");
    setTreasury(data);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<Treasury>("/cash-vouchers/treasury"),
      apiRequest<{ role: string }>("/auth/me"),
    ])
      .then(([data, user]) => {
        if (!active) return;
        setTreasury(data);
        setUserRole(user.role);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const canRecord = [
    "COMPANY_ADMIN",
    "FINANCE_MANAGER",
    "ACCOUNTANT",
    "CASHIER",
  ].includes(userRole);
  const fundingMovements = useMemo(
    () => treasury.movements.filter((movement) => movement.sourceType === "CASH_FUNDING"),
    [treasury.movements],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Saisissez un montant supérieur à zéro.");
      return;
    }
    if (currency === "CDF" && !Number.isInteger(Number(amount))) {
      setError("Le montant en CDF doit être un nombre entier.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ paymentOrderAvailable: string }>("/cash-vouchers/funding", {
        method: "POST",
        body: JSON.stringify({
          date,
          amount,
          currency,
          source: "ASSOCIE_GERANT",
          reference: reference.trim() || undefined,
        }),
      });
      await refresh();
      setSuccess(`Enregistré · Fonds OP disponibles : ${formatMoney(Number(result.paymentOrderAvailable), currency)}.`);
      setAmount("");
      setReference("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="workspace-page-heading flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Trésorerie · Associé-Gérant</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Approvisionnements</h1>
          <p className="mt-1 text-sm text-slate-500">Fonds remis pour les ordres de paiement.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Actualisation impossible."))}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Actualiser
        </button>
      </header>

      <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${databaseConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {databaseConnected ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        {databaseConnected ? "Caisse connectée" : "Serveur indisponible"}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {(["USD", "CDF"] as const).map((code) => {
          const account = treasury.accounts.find((item) => item.currency === code);
          return (
            <article key={code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Fonds OP · {code}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(Number(account?.paymentOrderAvailable ?? 0), code)}</p>
                </div>
                <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Wallet className="h-5 w-5" /></span>
              </div>
              <p className="px-5 py-3 text-xs text-slate-500">Caisse physique au livre · {formatMoney(Number(account?.balance ?? 0), code)}</p>
            </article>
          );
        })}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        {canRecord && (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Banknote className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-slate-900">Enregistrer les fonds reçus</h2>
                <p className="text-xs text-slate-500">Les fonds sont réservés aux OP.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Date de réception
                <input required type="date" value={date} onChange={(event) => setDateOverride(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Devise
                <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                  <option value="USD">USD · Dollar américain</option>
                  <option value="CDF">CDF · Franc congolais</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Montant reçu
              <input required type="number" min="0.01" max="999999999999.99" step={currency === "CDF" ? "1" : "0.01"} value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Référence <span className="font-normal text-slate-400">· facultatif</span>
              <input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Reçu ou bordereau" className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}
            <button type="submit" disabled={saving || !databaseConnected} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
              <Banknote className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Historique des remises</h2>
              <p className="mt-1 text-xs text-slate-500">{loading ? "Chargement…" : `${fundingMovements.length} mouvement(s)`}</p>
            </div>
          </div>
          {fundingMovements.length ? (
            <ul className="divide-y divide-slate-100">
              {fundingMovements.map((movement) => (
                <li key={movement.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{movement.description}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(movement.date)} · {movement.cashAccount.name}{movement.reference ? ` · ${movement.reference}` : ""}</p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-bold text-emerald-700">+ {formatMoney(Number(movement.amount), movement.cashAccount.currency)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {loading ? "Chargement des mouvements…" : "Aucun approvisionnement enregistré."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
