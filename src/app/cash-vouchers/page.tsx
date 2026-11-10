"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  FileText,
  Printer,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { useCompanyProfile } from "@/components/company-profile";
import { useWorkspaceStore } from "@/components/workspace-store";
import {
  DocumentFooter,
  DocumentLetterhead,
} from "@/components/document-letterhead";
import { apiRequest } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/formatting";

type Currency = "CDF" | "USD";
type CashMethod = "CASH_CDF" | "CASH_USD";
type CashVoucher = {
  id: string;
  voucherNumber: string;
  date: string;
  beneficiary: string;
  category: string;
  reason: string;
  amount: string;
  currency: Currency;
  method: CashMethod;
  cashAccountId: string;
  accountCode?: string | null;
  reference?: string | null;
  status: "ISSUED" | "CANCELLED";
  cancellationReason?: string | null;
};
type CashAccount = {
  id: string;
  code: string;
  name: string;
  currency: Currency;
  isActive: boolean;
  balance: string;
  paymentOrderAvailable: string;
};
type CashMovement = {
  id: string;
  cashAccountId: string;
  date: string;
  direction: "IN" | "OUT";
  amount: string;
  description: string;
  reference?: string | null;
  sourceType: string;
  cashAccount: { code: string; name: string; currency: Currency };
};
type Treasury = { accounts: CashAccount[]; movements: CashMovement[] };

function amountInWords(value: string, currency: Currency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const units = [
    "zéro",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
  ];
  const underHundred = (n: number): string => {
    if (n < 10) return units[n];
    if (n < 17)
      return ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"][
        n - 10
      ];
    if (n < 20) return `dix-${units[n - 10]}`;
    if (n < 70) {
      const tens = Math.floor(n / 10);
      const rest = n % 10;
      const name = [
        "",
        "",
        "vingt",
        "trente",
        "quarante",
        "cinquante",
        "soixante",
      ][tens];
      return rest === 0
        ? name
        : rest === 1
          ? `${name} et un`
          : `${name}-${units[rest]}`;
    }
    if (n < 80)
      return n === 71 ? "soixante et onze" : `soixante-${underHundred(n - 60)}`;
    return n === 80
      ? "quatre-vingts"
      : `quatre-vingt${n === 81 ? "-un" : `-${underHundred(n - 80)}`}`;
  };
  const underThousand = (n: number): string => {
    if (n < 100) return underHundred(n);
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const prefix =
      hundreds === 1
        ? "cent"
        : `${units[hundreds]} cent${rest === 0 ? "s" : ""}`;
    return rest ? `${prefix} ${underHundred(rest)}` : prefix;
  };
  const integerWords = (n: number): string => {
    if (n < 1000) return underThousand(n);
    const scales = ["", "mille", "million", "milliard"];
    const parts: string[] = [];
    let remaining = n;
    let scale = 0;
    while (remaining > 0) {
      const group = remaining % 1000;
      if (group) {
        const words = underThousand(group);
        if (scale === 1) {
          parts.unshift(group === 1 ? "mille" : `${words} mille`);
        } else if (scale > 1) {
          parts.unshift(`${words} ${scales[scale]}${group > 1 ? "s" : ""}`);
        } else {
          parts.unshift(words);
        }
      }
      remaining = Math.floor(remaining / 1000);
      scale += 1;
    }
    return parts.join(" ") || "zéro";
  };
  const minor = Math.round((number - Math.floor(number)) * 100);
  const unit = currency === "USD" ? "dollar américain" : "franc congolais";
  const minorUnit = currency === "USD" ? "centime" : "centime";
  return `${integerWords(Math.floor(number))} ${unit}${number >= 2 ? "s" : ""}${minor ? ` et ${integerWords(minor)} ${minorUnit}${minor > 1 ? "s" : ""}` : ""}`;
}

function kinshasaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function CashVouchersPage() {
  const { databaseConnected } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const [vouchers, setVouchers] = useState<CashVoucher[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<CashVoucher | null>(
    null,
  );
  const [date, setDate] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [reference, setReference] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fundCurrency, setFundCurrency] = useState<Currency>("USD");
  const [fundDate, setFundDate] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [fundReference, setFundReference] = useState("");
  const [fundSaving, setFundSaving] = useState(false);

  useEffect(() => {
    const today = kinshasaDate();
    setDate(today);
    setFundDate(today);
  }, []);

  useEffect(() => {
    void apiRequest<{ role: string }>("/auth/me")
      .then((user) => setUserRole(user.role))
      .catch(() => setUserRole(""));
  }, []);

  const refreshTreasury = useCallback(async () => {
    const data = await apiRequest<Treasury>("/cash-vouchers/treasury");
    setAccounts(data.accounts);
    setMovements(data.movements);
  }, []);

  useEffect(() => {
    let active = true;
    if (!databaseConnected) {
      setVouchers([]);
      setLoading(false);
      return;
    }
    void Promise.all([
      apiRequest<CashVoucher[]>("/cash-vouchers"),
      apiRequest<Treasury>("/cash-vouchers/treasury"),
    ])
      .then(([rows, treasury]) => {
        if (active) {
          setVouchers(rows);
          setAccounts(treasury.accounts);
          setMovements(treasury.movements);
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Chargement des bons impossible.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [databaseConnected]);

  const cashAccount = accounts.find((account) => account.currency === currency);
  const movementBalances = useMemo(() => {
    const remainingByAccount = new Map(
      accounts.map((account) => [account.id, Number(account.balance)]),
    );
    return movements.map((movement) => {
      const balanceAfter = remainingByAccount.get(movement.cashAccountId) ?? 0;
      const amount = Number(movement.amount);
      remainingByAccount.set(
        movement.cashAccountId,
        balanceAfter + (movement.direction === "IN" ? -amount : amount),
      );
      return { ...movement, balanceAfter };
    });
  }, [accounts, movements]);
  const visibleVouchers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("fr");
    if (!term) return vouchers;
    return vouchers.filter((voucher) =>
      [
        voucher.voucherNumber,
        voucher.beneficiary,
        voucher.category,
        voucher.reason,
      ].some((value) => value.toLocaleLowerCase("fr").includes(term)),
    );
  }, [query, vouchers]);

  async function submitVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!databaseConnected) {
      setError("Le serveur est indisponible : le bon n’a pas été enregistré.");
      return;
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Saisissez un montant supérieur à zéro.");
      return;
    }
    const categoryValue = category.trim();
    if (!categoryValue || categoryValue.length > 100) {
      setError("Saisissez une rubrique (100 caractères maximum).");
      return;
    }
    setSaving(true);
    try {
      const created = await apiRequest<CashVoucher>("/cash-vouchers", {
        method: "POST",
        body: JSON.stringify({
          date,
          beneficiary: beneficiary.trim(),
          category: categoryValue,
          reason: reason.trim(),
          amount,
          currency,
          method: currency === "USD" ? "CASH_USD" : "CASH_CDF",
          reference: reference.trim() || undefined,
        }),
      });
      setVouchers((current) => [created, ...current]);
      setSelectedVoucher(created);
      setBeneficiary("");
      setReason("");
      setAmount("");
      setReference("");
      void refreshTreasury().catch(() => undefined);
      setSuccess(
        `Bon ${created.voucherNumber} enregistré. Il est prêt à être imprimé.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer le bon.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!databaseConnected) {
      setError("Le serveur est indisponible : l’approvisionnement n’a pas été enregistré.");
      return;
    }
    if (!Number.isFinite(Number(fundAmount)) || Number(fundAmount) <= 0) {
      setError("Saisissez un montant positif pour l’entrée en caisse.");
      return;
    }
    setFundSaving(true);
    try {
      const result = await apiRequest<{ paymentOrderAvailable: string }>("/cash-vouchers/funding", {
        method: "POST",
        body: JSON.stringify({
          date: fundDate,
          amount: fundAmount,
          currency: fundCurrency,
          source: "ASSOCIE_GERANT",
          reference: fundReference.trim() || undefined,
        }),
      });
      await refreshTreasury();
      setSuccess(
        `Approvisionnement enregistré. Fonds disponibles pour les OP : ${formatMoney(Number(result.paymentOrderAvailable), fundCurrency)}.`,
      );
      setFundAmount("");
      setFundReference("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer cet approvisionnement.",
      );
    } finally {
      setFundSaving(false);
    }
  }

  function printVoucher(voucher: CashVoucher) {
    setSelectedVoucher(voucher);
    const printAfterRender = () => {
      document.body.classList.add("print-cash-voucher-mode");
      window.addEventListener(
        "afterprint",
        () => document.body.classList.remove("print-cash-voucher-mode"),
        { once: true },
      );
      window.print();
    };
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(printAfterRender),
    );
  }

  async function cancelVoucher(voucher: CashVoucher) {
    if (
      !window.confirm(
        `Annuler le bon ${voucher.voucherNumber} et enregistrer le retour du montant dans la caisse ? Confirmez uniquement si les fonds sont effectivement revenus.`,
      )
    )
      return;
    const reasonForCancellation = window.prompt(
      `Motif d’annulation du bon ${voucher.voucherNumber} :`,
    );
    if (!reasonForCancellation?.trim()) return;
    setError("");
    try {
      const updated = await apiRequest<CashVoucher>(
        `/cash-vouchers/${voucher.id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({ reason: reasonForCancellation.trim() }),
        },
      );
      setVouchers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      void refreshTreasury().catch(() => undefined);
      if (selectedVoucher?.id === updated.id) setSelectedVoucher(updated);
      setSuccess(
        `Bon ${updated.voucherNumber} annulé sans supprimer sa trace d’audit.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’annuler ce bon.",
      );
    }
  }

  async function reconcileAccount(account: CashAccount) {
    const rawCount = window.prompt(
      `Comptage physique de ${account.name} (${account.currency}) :`,
      Number(account.balance).toFixed(2),
    );
    if (rawCount === null) return;
    const countedBalance = rawCount.trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(countedBalance)) {
      setError("Saisissez un solde positif avec au plus deux décimales.");
      return;
    }
    const reason = window.prompt("Motif du rapprochement (obligatoire) :");
    if (!reason?.trim()) return;
    setError("");
    try {
      const result = await apiRequest<{ balance: string; difference: string }>(
        `/cash-vouchers/accounts/${account.id}/reconcile`,
        {
          method: "POST",
          body: JSON.stringify({ countedBalance, reason: reason.trim() }),
        },
      );
      await refreshTreasury();
      const delta = Number(result.difference);
      setSuccess(
        delta === 0
          ? `La caisse ${account.currency} est rapprochée : aucun écart.`
          : `Rapprochement enregistré. Écart ${formatMoney(Math.abs(delta), account.currency)} (${delta > 0 ? "entrée" : "sortie"} d’ajustement).`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Rapprochement impossible.",
      );
    }
  }

  return (
    <div className="cash-vouchers-page space-y-6">
      <header className="workspace-page-heading border-b border-slate-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          Trésorerie du cabinet
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Gestion de la caisse
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Suivez les fonds disponibles, enregistrez les entrées et les sorties,
          puis contrôlez chaque mouvement dans le livre de caisse.
        </p>
      </header>

      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${databaseConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        {databaseConnected ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>
          {databaseConnected
            ? "Le livre suit tous les mouvements physiques. Pour payer une OP, seul le fonds alimenté par l’Associé-Gérant est retenu; les paiements clients restent exclus de ce disponible. Aucun journal comptable n’est généré automatiquement par l’OP."
            : "Base indisponible : les bons ne peuvent pas être enregistrés."}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {(["CDF", "USD"] as const).map((code) => (
          <article
            key={code}
            className="cash-voucher-stat flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-slate-500">
                Solde disponible · {code}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMoney(
                  Number(
                    accounts.find((account) => account.currency === code)
                      ?.balance ?? 0,
                  ),
                  code,
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {accounts.find((account) => account.currency === code)?.name ??
                  "Caisse"}
              </p>
              <p className="mt-2 text-xs font-semibold text-blue-800">
                Disponible pour les OP : {formatMoney(Number(accounts.find((account) => account.currency === code)?.paymentOrderAvailable ?? 0), code)}
              </p>
            </div>
            {accounts.find((account) => account.currency === code) &&
              ["COMPANY_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"].includes(
                userRole,
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    void reconcileAccount(
                      accounts.find((account) => account.currency === code)!,
                    )
                  }
                  className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Rapprocher
                </button>
              )}
          </article>
        ))}
      </section>

      {[
        "COMPANY_ADMIN",
        "FINANCE_MANAGER",
        "ACCOUNTANT",
        "CASHIER",
      ].includes(userRole) && (
        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <form
            onSubmit={submitFunding}
            className="cash-voucher-form space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                Approvisionnement · Associé-Gérant
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                {Number(accounts.find((account) => account.currency === fundCurrency)?.paymentOrderAvailable ?? 0) === 0
                  ? "Enregistrer le fonds de départ des OP"
                  : "Réapprovisionner les fonds des OP"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Enregistrez uniquement les fonds réellement remis par l’Associé-Gérant. Ils sont suivis séparément des règlements clients et n’engendrent pas d’écriture comptable automatique.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Date de réception
                <input
                  required
                  type="date"
                  value={fundDate}
                  onChange={(event) => setFundDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Devise
                <select
                  value={fundCurrency}
                  onChange={(event) => setFundCurrency(event.target.value as Currency)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="USD">USD · Dollar américain</option>
                  <option value="CDF">CDF · Franc congolais</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Montant réellement reçu
                <input
                  required
                  type="number"
                  min="0.01"
                  max="999999999999.99"
                  step={fundCurrency === "CDF" ? "1" : "0.01"}
                  value={fundAmount}
                  onChange={(event) => setFundAmount(event.target.value)}
                  placeholder={fundCurrency === "USD" ? "200.00" : "200000"}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                />
              </label>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-slate-700">
                <span className="block text-xs font-semibold uppercase tracking-wide text-blue-800">Origine affectée</span>
                <span className="mt-1 block">Approvisionnement remis par l’Associé-Gérant</span>
              </div>
            </div>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Référence (facultative)
              <input
                maxLength={120}
                value={fundReference}
                onChange={(event) => setFundReference(event.target.value)}
                placeholder="Reçu, bordereau ou référence interne"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <button
              type="submit"
              disabled={fundSaving || !databaseConnected}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              {fundSaving ? "Enregistrement…" : "Enregistrer l’approvisionnement"}
            </button>
          </form>

          <aside className="cash-treasury-guide rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
              Fonctionnement des fonds
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Le solde suit les mouvements réels
            </h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li><strong>1. Départ :</strong> saisissez les espèces réellement remises, par exemple 200 USD, avec leur origine.</li>
              <li><strong>2. Paiement :</strong> une OP payée ou un bon de sortie validé diminue automatiquement la caisse.</li>
              <li><strong>3. Réapprovisionnement :</strong> lorsque de nouveaux fonds arrivent, enregistrez une nouvelle entrée ici; le solde augmente et la trace reste au livre.</li>
              <li><strong>4. Caisse épuisée :</strong> le paiement est bloqué si le solde ne suffit pas. Enregistrez d’abord l’argent réellement reçu.</li>
            </ol>
            <p className="mt-4 rounded-xl border border-amber-200 bg-white/80 p-3 text-xs leading-5 text-amber-950">
              Exemple : 200 USD de départ − une OP de 75 USD = 125 USD en caisse. Ce calcul de trésorerie est distinct du budget annuel de l’OP.
            </p>
          </aside>
        </section>
      )}

      {!loading &&
        accounts.length > 0 &&
        movements.length === 0 &&
        Number(accounts[0]?.balance ?? 0) === 0 && (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Première mise en service : comptez l’argent réellement présent,
            puis enregistrez-le comme entrée initiale avec son origine. Utilisez
            « Rapprocher » uniquement pour comparer le livre avec le comptage
            physique et tracer un éventuel écart.
          </p>
        )}

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <form
          onSubmit={submitVoucher}
          className="cash-voucher-form space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Émettre un bon
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Le numéro définitif est attribué après l’enregistrement.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Date de sortie
              <input
                required
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Rubrique
              <input
                required
                maxLength={100}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                placeholder="Ex. Fournitures, transport, honoraires…"
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Bénéficiaire
            <input
              required
              maxLength={160}
              value={beneficiary}
              onChange={(event) => setBeneficiary(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="Nom de la personne ou du fournisseur"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Motif détaillé
            <textarea
              required
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="Ex. Achat de fournitures pour le bureau du cabinet"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Montant
              <input
                required
                type="number"
                min="0.01"
                max="999999999999.99"
                step={currency === "CDF" ? "1" : "0.01"}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              Devise de caisse
              <select
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as Currency)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="CDF">Franc congolais · CDF</option>
                <option value="USD">Dollar américain · USD</option>
              </select>
            </label>
          </div>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {cashAccount
              ? `${cashAccount.name} · ${formatMoney(Number(cashAccount.balance), currency)} au livre. La disponibilité à la date du bon sera vérifiée avant l’enregistrement.`
              : "La caisse correspondant à cette devise sera créée automatiquement."}
          </p>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Référence du justificatif (facultatif)
            <input
              maxLength={120}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="Numéro de reçu ou référence interne"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
            >
              {success}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !databaseConnected}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {saving ? "Enregistrement…" : "Enregistrer et préparer le bon"}
          </button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Registre de caisse
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {loading ? "Chargement…" : `${visibleVouchers.length} bon(s)`}
              </p>
            </div>
            <label className="relative min-w-44 flex-1 sm:max-w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Rechercher un bon"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
                placeholder="N°, bénéficiaire…"
              />
            </label>
          </div>
          {visibleVouchers.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Bon / date</th>
                    <th className="px-4 py-3 font-medium">Bénéficiaire</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Montant
                    </th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleVouchers.map((voucher) => (
                    <tr
                      key={voucher.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {voucher.voucherNumber}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(voucher.date)}
                        </p>
                      </td>
                      <td className="min-w-36 px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {voucher.beneficiary}
                        </p>
                        <p className="max-w-56 truncate text-xs text-slate-500">
                          {voucher.reason}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                        {formatMoney(Number(voucher.amount), voucher.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${voucher.status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {voucher.status === "CANCELLED" ? "Annulé" : "Émis"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => printVoucher(voucher)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Imprimer
                        </button>
                        {voucher.status === "ISSUED" &&
                          [
                            "COMPANY_ADMIN",
                            "FINANCE_MANAGER",
                            "ACCOUNTANT",
                          ].includes(userRole) && (
                            <button
                              type="button"
                              onClick={() => void cancelVoucher(voucher)}
                              className="ml-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Annuler
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              {loading
                ? "Chargement des données…"
                : query
                  ? "Aucun bon ne correspond à cette recherche."
                  : "Aucun bon de sortie. Enregistrez le premier décaissement."}
            </p>
          )}
        </section>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Livre de caisse</h2>
          <p className="mt-1 text-sm text-slate-500">
            Encaissements sur factures, dépenses, bons de sortie et écarts de
            comptage.
          </p>
        </div>
        {movements.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Libellé / pièce</th>
                  <th className="px-4 py-3 font-medium">Caisse</th>
                  <th className="px-4 py-3 text-right font-medium">Entrée</th>
                  <th className="px-4 py-3 text-right font-medium">Sortie</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Solde après
                  </th>
                </tr>
              </thead>
              <tbody>
                {movementBalances.map((movement) => (
                  <tr key={movement.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(movement.date)}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="font-medium text-slate-800">
                        {movement.description}
                      </p>
                      {movement.reference && (
                        <p className="text-xs text-slate-500">
                          {movement.reference}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {movement.cashAccount.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">
                      {movement.direction === "IN"
                        ? formatMoney(
                            Number(movement.amount),
                            movement.cashAccount.currency,
                          )
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-rose-700">
                      {movement.direction === "OUT"
                        ? formatMoney(
                            Number(movement.amount),
                            movement.cashAccount.currency,
                          )
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-800">
                      {formatMoney(
                        movement.balanceAfter,
                        movement.cashAccount.currency,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Aucun mouvement de caisse enregistré.
          </p>
        )}
      </section>

      {selectedVoucher && (
        <article
          className="cash-voucher-print hidden"
          aria-label="Bon de sortie de caisse à imprimer"
        >
          <DocumentLetterhead />
          <div className="cash-voucher-document-body">
            <div className="cash-voucher-title-row">
              <div>
                <p className="cash-voucher-overline">
                  Trésorerie · Pièce justificative
                </p>
                <h2>BON DE SORTIE DE CAISSE</h2>
              </div>
              <div className="cash-voucher-number">
                <span>NUMÉRO</span>
                <strong>{selectedVoucher.voucherNumber}</strong>
              </div>
            </div>
            {selectedVoucher.status === "CANCELLED" && (
              <div className="cash-voucher-cancelled">
                BON ANNULÉ · {selectedVoucher.cancellationReason}
              </div>
            )}
            <div className="cash-voucher-meta">
              <div>
                <span>Date de sortie</span>
                <strong>{formatDate(selectedVoucher.date)}</strong>
              </div>
              <div>
                <span>Rubrique</span>
                <strong>{selectedVoucher.category}</strong>
              </div>
            </div>
            <section className="cash-voucher-amount-box">
              <span>Montant décaissé</span>
              <strong>
                {formatMoney(
                  Number(selectedVoucher.amount),
                  selectedVoucher.currency,
                )}
              </strong>
            </section>
            <section className="cash-voucher-words">
              <span>Arrêté en toutes lettres à :</span>
              <p>
                {amountInWords(
                  selectedVoucher.amount,
                  selectedVoucher.currency,
                )}
              </p>
            </section>
            <dl className="cash-voucher-details">
              <div>
                <dt>Payé à / bénéficiaire</dt>
                <dd>{selectedVoucher.beneficiary}</dd>
              </div>
              <div>
                <dt>Motif du décaissement</dt>
                <dd>{selectedVoucher.reason}</dd>
              </div>
              <div>
                <dt>Moyen de sortie</dt>
                <dd>
                  {selectedVoucher.currency === "USD"
                    ? "Espèces en dollars américains"
                    : "Espèces en francs congolais"}
                </dd>
              </div>
              {selectedVoucher.accountCode && (
                <div>
                  <dt>Caisse / compte</dt>
                  <dd>
                    {accounts.find(
                      (account) => account.id === selectedVoucher.cashAccountId,
                    )?.name ?? selectedVoucher.accountCode}
                    {` · ${selectedVoucher.accountCode}`}
                  </dd>
                </div>
              )}
              {selectedVoucher.reference && (
                <div>
                  <dt>Justificatif lié</dt>
                  <dd>{selectedVoucher.reference}</dd>
                </div>
              )}
            </dl>
            <p className="cash-voucher-acknowledgement">
              Je reconnais avoir reçu le montant indiqué ci-dessus et m’engage à
              remettre les pièces justificatives correspondantes.
            </p>
            <section className="cash-voucher-signatures">
              <div>
                <strong>Établi par</strong>
                <span>
                  {profile?.signatureName?.trim() || "Nom et signature"}
                </span>
                <i />
              </div>
              <div>
                <strong>Approuvé par</strong>
                <span>
                  {profile?.signatureTitle?.trim() || "Responsable habilité"}
                </span>
                <i />
              </div>
              <div>
                <strong>Reçu par</strong>
                <span>{selectedVoucher.beneficiary}</span>
                <i />
              </div>
            </section>
            <p className="cash-voucher-copy-note">
              Original : caisse · Copie : bénéficiaire · Joindre les pièces
              justificatives à ce bon.
            </p>
          </div>
          <DocumentFooter />
        </article>
      )}
    </div>
  );
}
