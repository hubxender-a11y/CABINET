"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Check, CircleAlert, RefreshCw, Wallet } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { useCompanyProfile } from "@/components/company-profile";
import { apiRequest } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/formatting";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

type Currency = "CDF" | "USD";
type CashAccount = {
  id: string;
  name: string;
  currency: Currency;
  accountType: string;
  balance: string;
  paymentOrderAvailable: string;
};
type CashMovement = {
  id: string;
  date: string;
  direction: "IN" | "OUT";
  amount: string;
  sourceAmount?: string | null;
  sourceCurrency?: Currency | null;
  exchangeRate?: string | null;
  description: string;
  reference?: string | null;
  sourceType: string;
  cashAccount: { name: string; currency: Currency };
};
type Treasury = { accounts: CashAccount[]; movements: CashMovement[] };

export default function FundingPage() {
  const { databaseConnected } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const today = useKinshasaDate() ?? "";
  const [treasury, setTreasury] = useState<Treasury>({
    accounts: [],
    movements: [],
  });
  const [userRole, setUserRole] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const date = dateOverride ?? today;
  const [currency, setCurrency] = useState<Currency>("USD");
  const [receivedCurrency, setReceivedCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [transferAmountUsd, setTransferAmountUsd] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");

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
        if (active)
          setError(
            caught instanceof Error ? caught.message : "Chargement impossible.",
          );
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
    () => treasury.movements.filter((movement) => movement.direction === "IN"),
    [treasury.movements],
  );
  const exchangeRate = Number(profile?.exchangeRateCdfPerUsd ?? 0);
  const usdCash = treasury.accounts.find(
    (item) => item.currency === "USD" && item.accountType === "CASH",
  );
  const usdAccounts = treasury.accounts.filter(
    (item) => item.currency === "USD",
  );
  const transferAccount =
    usdAccounts.find((item) => item.id === transferAccountId) ?? usdCash;
  const convertedAccount = treasury.accounts.find(
    (item) =>
      item.currency === "CDF" &&
      item.accountType === transferAccount?.accountType,
  );
  const requiresConversion = receivedCurrency !== currency;
  const canConvert =
    !requiresConversion ||
    (receivedCurrency === "USD" && currency === "CDF" && exchangeRate > 0);
  const creditedPreview =
    requiresConversion && receivedCurrency === "USD" && currency === "CDF"
      ? Math.round(Number(amount || 0) * exchangeRate)
      : Number(amount || 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Saisissez un montant supérieur à zéro.");
      return;
    }
    if (receivedCurrency === "CDF" && !Number.isInteger(Number(amount))) {
      setError("Un montant reçu en CDF doit être un nombre entier.");
      return;
    }
    if (!canConvert) {
      setError(
        receivedCurrency === "CDF" && currency === "USD"
          ? "La conversion CDF vers USD n’est pas configurée. Choisissez une caisse CDF."
          : "Configurez le taux USD/CDF dans les paramètres.",
      );
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{
        paymentOrderAvailable: string;
        movement: { amount: string };
      }>("/cash-vouchers/funding", {
        method: "POST",
        body: JSON.stringify({
          date,
          amount,
          currency,
          receivedCurrency,
          source: "ASSOCIE_GERANT",
          reference: reference.trim() || undefined,
        }),
      });
      await refresh();
      setSuccess(
        `Crédité : ${formatMoney(Number(result.movement.amount), currency)} · disponible OP : ${formatMoney(Number(result.paymentOrderAvailable), currency)}.`,
      );
      setAmount("");
      setReference("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferError("");
    setTransferSuccess("");
    if (
      !Number.isFinite(Number(transferAmountUsd)) ||
      Number(transferAmountUsd) <= 0
    ) {
      setTransferError("Saisissez un montant USD supérieur à zéro.");
      return;
    }
    if (!exchangeRate) {
      setTransferError("Configurez le taux USD/CDF dans les paramètres.");
      return;
    }
    setTransferSaving(true);
    try {
      const result = await apiRequest<{
        reference: string;
        amountUsd: string;
        amountCdf: string;
        exchangeRate: string;
      }>("/cash-vouchers/funding/convert", {
        method: "POST",
        body: JSON.stringify({
          date,
          amountUsd: transferAmountUsd,
          sourceAccountId: transferAccount?.id,
          reference: transferReference.trim() || undefined,
        }),
      });
      await refresh();
      setTransferSuccess(
        `${formatMoney(Number(result.amountUsd), "USD")} convertis en ${formatMoney(Number(result.amountCdf), "CDF")} · taux ${result.exchangeRate} CDF/USD · ${result.reference}`,
      );
      setTransferAmountUsd("");
      setTransferReference("");
    } catch (caught) {
      setTransferError(
        caught instanceof Error ? caught.message : "Conversion impossible.",
      );
    } finally {
      setTransferSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="workspace-page-heading flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Trésorerie · Encaissements
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Approvisionnements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Tous les fonds reçus et leur solde disponible pour les OP.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            void refresh().catch((caught: unknown) =>
              setError(
                caught instanceof Error
                  ? caught.message
                  : "Actualisation impossible.",
              ),
            )
          }
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Actualiser
        </button>
      </header>

      <div
        className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${databaseConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        {databaseConnected ? (
          <Check className="h-4 w-4" />
        ) : (
          <CircleAlert className="h-4 w-4" />
        )}
        {databaseConnected ? "Caisse connectée" : "Serveur indisponible"}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {(["USD", "CDF"] as const).map((code) => {
          const account = treasury.accounts.find(
            (item) => item.currency === code && item.accountType === "CASH",
          );
          return (
            <article
              key={code}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Disponible OP · {code}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatMoney(
                      Number(account?.paymentOrderAvailable ?? 0),
                      code,
                    )}
                  </p>
                </div>
                <span className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  <Wallet className="h-5 w-5" />
                </span>
              </div>
              <p className="px-5 py-3 text-xs text-slate-500">
                Solde de caisse ·{" "}
                {formatMoney(Number(account?.balance ?? 0), code)}
              </p>
            </article>
          );
        })}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        {canRecord && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                <Banknote className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">
                  Enregistrer les fonds reçus
                </h2>
                <p className="text-xs text-slate-500">
                  Les remises du Gérant sont enregistrées dans la devise de la
                  caisse.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Date de réception
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDateOverride(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Devise reçue
                <select
                  value={receivedCurrency}
                  onChange={(event) => {
                    const next = event.target.value as Currency;
                    setReceivedCurrency(next);
                    if (next === "CDF") setCurrency("CDF");
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="USD">USD · Dollar américain</option>
                  <option value="CDF">CDF · Franc congolais</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Créditer la caisse
                <select
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value as Currency)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="USD" disabled={receivedCurrency === "CDF"}>
                    USD · Caisse dollar
                  </option>
                  <option value="CDF">CDF · Caisse franc</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Montant reçu
              <input
                required
                type="number"
                min="0.01"
                max="999999999999.99"
                step={receivedCurrency === "CDF" ? "1" : "0.01"}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            {requiresConversion &&
              receivedCurrency === "USD" &&
              currency === "CDF" && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${exchangeRate > 0 ? "border-blue-100 bg-blue-50 text-blue-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                >
                  {exchangeRate > 0 ? (
                    <>
                      1 USD = {formatMoney(exchangeRate, "CDF")} · crédit estimé
                      : <strong>{formatMoney(creditedPreview, "CDF")}</strong>.
                      Le taux sera enregistré avec le mouvement.
                    </>
                  ) : (
                    <>
                      Configurez le taux USD/CDF dans les paramètres pour
                      créditer la caisse en CDF.
                    </>
                  )}
                </div>
              )}
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Référence{" "}
              <span className="font-normal text-slate-400">· facultatif</span>
              <input
                maxLength={120}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Reçu ou bordereau"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            {success && (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              >
                {success}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !databaseConnected}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Banknote className="h-4 w-4" />{" "}
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Livre des entrées
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {loading
                  ? "Chargement…"
                  : `${fundingMovements.length} mouvement(s)`}
              </p>
            </div>
          </div>
          {fundingMovements.length ? (
            <ul className="divide-y divide-slate-100">
              {fundingMovements.map((movement) => (
                <li
                  key={movement.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {movement.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(movement.date)} · {movement.cashAccount.name}
                      {movement.reference ? ` · ${movement.reference}` : ""}
                    </p>
                    {movement.sourceAmount &&
                      movement.sourceCurrency &&
                      movement.sourceCurrency !==
                        movement.cashAccount.currency && (
                        <p className="mt-1 text-xs text-slate-600">
                          Reçu{" "}
                          {formatMoney(
                            Number(movement.sourceAmount),
                            movement.sourceCurrency,
                          )}
                          {movement.exchangeRate
                            ? ` · taux ${movement.exchangeRate} CDF/USD`
                            : ""}
                        </p>
                      )}
                  </div>
                  <p className="whitespace-nowrap text-sm font-bold text-emerald-700">
                    +{" "}
                    {formatMoney(
                      Number(movement.amount),
                      movement.cashAccount.currency,
                    )}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {loading
                ? "Chargement des mouvements…"
                : "Aucune entrée enregistrée."}
            </div>
          )}
        </section>
      </div>

      {canRecord && (
        <form
          onSubmit={submitTransfer}
          className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_minmax(160px,0.7fr)_auto] md:items-end"
        >
          <div>
            <h2 className="font-semibold text-slate-900">
              Transférer un solde USD vers CDF
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Solde source :{" "}
              {formatMoney(Number(transferAccount?.balance ?? 0), "USD")} ·
              destination :{" "}
              {convertedAccount?.name ?? "compte CDF créé au transfert"} · 1 USD
              ={" "}
              {exchangeRate
                ? formatMoney(exchangeRate, "CDF")
                : "taux à configurer"}
            </p>
          </div>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Compte USD source
            <select
              required
              value={transferAccount?.id ?? ""}
              onChange={(event) => setTransferAccountId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            >
              {usdAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatMoney(Number(account.balance), "USD")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Montant à convertir · USD
            <input
              required
              type="number"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              value={transferAmountUsd}
              onChange={(event) => setTransferAmountUsd(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Référence · facultative
            <input
              maxLength={120}
              value={transferReference}
              onChange={(event) => setTransferReference(event.target.value)}
              placeholder="Échange de devises"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            />
          </label>
          <button
            type="submit"
            disabled={
              transferSaving ||
              !databaseConnected ||
              !exchangeRate ||
              !transferAccount?.id ||
              Number(transferAmountUsd) > Number(transferAccount?.balance ?? 0)
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {transferSaving ? "Conversion…" : "Convertir"}
          </button>
          {(transferError || transferSuccess) && (
            <p
              role={transferError ? "alert" : "status"}
              className={`rounded-lg px-3 py-2 text-sm md:col-span-full ${transferError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {transferError || transferSuccess}
            </p>
          )}
          {transferAmountUsd && exchangeRate > 0 && (
            <p className="text-xs text-slate-600 md:col-span-full">
              Crédit estimé en caisse CDF :{" "}
              <strong>
                {formatMoney(
                  Math.round(Number(transferAmountUsd) * exchangeRate),
                  "CDF",
                )}
              </strong>
              . Le livre enregistrera une sortie USD et une entrée CDF.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
