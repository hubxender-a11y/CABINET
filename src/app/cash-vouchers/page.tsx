"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
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
  status: "PENDING_APPROVAL" | "ISSUED" | "REJECTED" | "CANCELLED";
  cancellationReason?: string | null;
  rejectionReason?: string | null;
  managerApprovalName?: string | null;
  managerApprovedAt?: string | null;
};
type CashAccount = {
  id: string;
  code: string;
  name: string;
  currency: Currency;
  accountType: string;
  isActive: boolean;
  balance: string;
  paymentOrderAvailable: string;
};
type PeriodCashAccount = CashAccount & {
  openingBalance: string;
  closingBalance: string;
  openingPaymentOrderAvailable: string;
  closingPaymentOrderAvailable: string;
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
  sourceAmount?: string | null;
  sourceCurrency?: Currency | null;
  exchangeRate?: string | null;
  cashAccount: {
    code: string;
    name: string;
    currency: Currency;
    accountType: string;
  };
};
type Treasury = { accounts: CashAccount[]; movements: CashMovement[] };
type TreasuryPeriod = {
  from: string;
  to: string;
  accounts: PeriodCashAccount[];
  movements: CashMovement[];
};

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

function subscribeToClient() {
  return () => {};
}

export default function CashVouchersPage() {
  const { databaseConnected } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const clientToday = useSyncExternalStore(
    subscribeToClient,
    kinshasaDate,
    () => "",
  );
  const [vouchers, setVouchers] = useState<CashVoucher[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<CashVoucher | null>(
    null,
  );
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodData, setPeriodData] = useState<TreasuryPeriod | null>(null);
  const [periodCompletedKey, setPeriodCompletedKey] = useState("");
  const [printData, setPrintData] = useState<
    (TreasuryPeriod & { printedAt: string }) | null
  >(null);
  const [printDocument, setPrintDocument] = useState<
    "ledger" | "treasury" | null
  >(null);
  const [printSaving, setPrintSaving] = useState(false);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const date = dateOverride ?? clientToday;
  const [beneficiary, setBeneficiary] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [reference, setReference] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const isLoading = databaseConnected && loading;
  const [userRole, setUserRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cashVoucherTab, setCashVoucherTab] = useState<"issue" | "register">(
    "issue",
  );

  const printReady = Boolean(clientToday);

  useEffect(() => {
    const printModes = [
      "print-cash-ledger-mode",
      "print-cash-treasury-mode",
      "print-cash-voucher-mode",
    ];
    const cleanPrintMode = () => {
      document.body.classList.remove(...printModes);
      setPrintDocument(null);
      setPrintData(null);
      setPrintSaving(false);
    };
    window.addEventListener("afterprint", cleanPrintMode);
    return () => {
      window.removeEventListener("afterprint", cleanPrintMode);
      document.body.classList.remove(...printModes);
    };
  }, []);

  useEffect(() => {
    void apiRequest<{ role: string }>("/auth/me")
      .then((user) => setUserRole(user.role))
      .catch(() => setUserRole(""));
  }, []);

  const refreshTreasury = useCallback(async () => {
    const data = await apiRequest<Treasury>("/cash-vouchers/treasury");
    setAccounts(data.accounts);
  }, []);

  useEffect(() => {
    let active = true;
    if (!databaseConnected) return;
    void Promise.all([
      apiRequest<CashVoucher[]>("/cash-vouchers"),
      apiRequest<Treasury>("/cash-vouchers/treasury"),
    ])
      .then(([rows, treasury]) => {
        if (active) {
          setVouchers(rows);
          setAccounts(treasury.accounts);
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

  useEffect(() => {
    if (
      !databaseConnected ||
      !periodStart ||
      !periodEnd ||
      periodStart > periodEnd
    )
      return;
    const selectionKey = `${periodStart}:${periodEnd}`;
    const controller = new AbortController();
    void apiRequest<TreasuryPeriod>(
      `/cash-vouchers/treasury/period?from=${encodeURIComponent(periodStart)}&to=${encodeURIComponent(periodEnd)}`,
      { signal: controller.signal },
    )
      .then((data) => setPeriodData(data))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPeriodData(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Impossible de charger cette période.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeriodCompletedKey(selectionKey);
      });
    return () => controller.abort();
  }, [databaseConnected, periodStart, periodEnd]);

  const canIssueVoucher = [
    "COMPANY_ADMIN",
    "FINANCE_MANAGER",
    "ACCOUNTANT",
    "CASHIER",
  ].includes(userRole);
  const showIssueView = canIssueVoucher && cashVoucherTab === "issue";
  const visibleVouchers = useMemo(() => {
    const availableVouchers = databaseConnected ? vouchers : [];
    const term = query.trim().toLocaleLowerCase("fr");
    if (!term) return availableVouchers;
    return availableVouchers.filter((voucher) =>
      [
        voucher.voucherNumber,
        voucher.beneficiary,
        voucher.category,
        voucher.reason,
      ].some((value) => value.toLocaleLowerCase("fr").includes(term)),
    );
  }, [databaseConnected, query, vouchers]);
  const pendingVouchers = useMemo(
    () =>
      (databaseConnected ? vouchers : []).filter(
        (voucher) => voucher.status === "PENDING_APPROVAL",
      ),
    [databaseConnected, vouchers],
  );
  const selectedPeriodValid = Boolean(
    periodStart && periodEnd && periodStart <= periodEnd,
  );
  const periodSelectionKey =
    databaseConnected && selectedPeriodValid
      ? `${periodStart}:${periodEnd}`
      : "";
  const periodLoading = Boolean(
    periodSelectionKey && periodCompletedKey !== periodSelectionKey,
  );
  const periodLoadedForSelection = Boolean(
    periodSelectionKey &&
    periodCompletedKey === periodSelectionKey &&
    periodData?.from === periodStart &&
    periodData?.to === periodEnd,
  );
  const selectedPeriodData = periodLoadedForSelection ? periodData : null;
  const selectedPeriodLoading =
    databaseConnected && selectedPeriodValid && periodLoading;
  const periodMovementBalances = useMemo(() => {
    if (!selectedPeriodData) return [];
    const remainingByAccount = new Map(
      selectedPeriodData.accounts.map((account) => [
        account.id,
        Number(account.openingBalance),
      ]),
    );
    return selectedPeriodData.movements.map((movement) => {
      const balanceBefore = remainingByAccount.get(movement.cashAccountId) ?? 0;
      const amount = Number(movement.amount);
      const balanceAfter =
        balanceBefore + (movement.direction === "IN" ? amount : -amount);
      remainingByAccount.set(movement.cashAccountId, balanceAfter);
      return { ...movement, balanceAfter };
    });
  }, [selectedPeriodData]);
  const periodTotals = useMemo(() => {
    const totals: Record<string, { entries: number; exits: number }> = {};
    for (const movement of selectedPeriodData?.movements ?? []) {
      const total = totals[movement.cashAccountId] ?? { entries: 0, exits: 0 };
      total[movement.direction === "IN" ? "entries" : "exits"] += Number(
        movement.amount,
      );
      totals[movement.cashAccountId] = total;
    }
    return totals;
  }, [selectedPeriodData]);
  const displayedMovements = selectedPeriodData ? periodMovementBalances : [];

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
      setSelectedVoucher(null);
      setBeneficiary("");
      setReason("");
      setAmount("");
      setReference("");
      setCashVoucherTab("register");
      void refreshTreasury().catch(() => undefined);
      setSuccess(`Bon ${created.voucherNumber} · en attente du visa.`);
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

  function printVoucher(voucher: CashVoucher) {
    if (
      voucher.status === "PENDING_APPROVAL" ||
      voucher.status === "REJECTED"
    ) {
      setError("Seul un bon approuvé peut être imprimé.");
      return;
    }
    flushSync(() => setSelectedVoucher(voucher));
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const printable = document.querySelector(".cash-voucher-print");
        if (!printable) {
          setError(
            "Le modèle du bon n’a pas pu être préparé pour l’impression. Réessayez.",
          );
          return;
        }
        document.body.classList.add("print-cash-voucher-mode");
        window.addEventListener(
          "afterprint",
          () => document.body.classList.remove("print-cash-voucher-mode"),
          { once: true },
        );
        window.print();
      }),
    );
  }

  function printTreasuryDocument(kind: "ledger" | "treasury") {
    if (
      !periodLoadedForSelection ||
      !selectedPeriodData ||
      selectedPeriodLoading ||
      printSaving
    ) {
      setError(
        "Choisissez une période valide et attendez le chargement avant l’impression.",
      );
      return;
    }
    setError("");
    setPrintSaving(true);
    flushSync(() => {
      setPrintData({
        ...selectedPeriodData,
        printedAt: new Date().toISOString(),
      });
      setPrintDocument(kind);
    });
    const mode =
      kind === "ledger" ? "print-cash-ledger-mode" : "print-cash-treasury-mode";
    document.body.classList.remove(
      "print-cash-ledger-mode",
      "print-cash-treasury-mode",
    );
    document.body.classList.add(mode);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const printable = document.querySelector(
          kind === "ledger" ? ".cash-ledger-print" : ".cash-treasury-print",
        );
        if (!printable) {
          document.body.classList.remove(mode);
          setPrintSaving(false);
          setError(
            "Le document n’a pas pu être préparé pour l’impression. Réessayez.",
          );
          return;
        }
        setPrintSaving(false);
        window.print();
      }),
    );
  }

  async function approveVoucher(voucher: CashVoucher) {
    const hasLinkedOrder = Boolean(
      voucher.reference && /^OP\/\d{4}\/\d+$/.test(voucher.reference),
    );
    if (
      !window.confirm(
        hasLinkedOrder
          ? `Confirmez-vous avoir examiné le bon ${voucher.voucherNumber}, l’OP ${voucher.reference} et son état de besoin, et autoriser le décaissement ?`
          : `Confirmez-vous avoir examiné le bon ${voucher.voucherNumber} et autoriser le décaissement ?`,
      )
    )
      return;
    setError("");
    setSuccess("");
    try {
      const approved = await apiRequest<CashVoucher>(
        `/cash-vouchers/${voucher.id}/approve`,
        { method: "POST" },
      );
      setVouchers((current) =>
        current.map((item) => (item.id === approved.id ? approved : item)),
      );
      await refreshTreasury();
      setSelectedVoucher(approved);
      setSuccess(`Bon ${approved.voucherNumber} approuvé · fonds débités.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’approuver ce bon.",
      );
    }
  }

  async function rejectVoucher(voucher: CashVoucher) {
    const rejectionReason = window.prompt(
      `Motif du rejet du bon ${voucher.voucherNumber} :`,
    );
    if (!rejectionReason?.trim()) return;
    setError("");
    setSuccess("");
    try {
      const rejected = await apiRequest<CashVoucher>(
        `/cash-vouchers/${voucher.id}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason: rejectionReason.trim() }),
        },
      );
      setVouchers((current) =>
        current.map((item) => (item.id === rejected.id ? rejected : item)),
      );
      setSuccess(
        `Bon ${rejected.voucherNumber} rejeté. Aucun fonds n’a été retiré.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de rejeter ce bon.",
      );
    }
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
      <header className="workspace-page-heading flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Bons de sortie de caisse
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/funding"
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100"
          >
            Approvisionnements
          </Link>
          <button
            type="button"
            onClick={() => printTreasuryDocument("ledger")}
            disabled={
              !printReady ||
              isLoading ||
              selectedPeriodLoading ||
              !periodLoadedForSelection ||
              printSaving
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Imprimer le livre de caisse
          </button>
          <button
            type="button"
            onClick={() => printTreasuryDocument("treasury")}
            disabled={
              !printReady ||
              isLoading ||
              selectedPeriodLoading ||
              !periodLoadedForSelection ||
              printSaving
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Imprimer la trésorerie
          </button>
        </div>
      </header>

      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${databaseConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        {databaseConnected ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>{databaseConnected ? "Caisse connectée" : "Serveur indisponible"}</p>
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
              <p className="text-sm text-slate-500">Solde caisse · {code}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMoney(
                  Number(
                    accounts.find(
                      (account) =>
                        account.currency === code &&
                        account.accountType === "CASH",
                    )?.balance ?? 0,
                  ),
                  code,
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {accounts.find(
                  (account) =>
                    account.currency === code && account.accountType === "CASH",
                )?.name ?? "Caisse"}
              </p>
            </div>
            {accounts.find(
              (account) =>
                account.currency === code && account.accountType === "CASH",
            ) &&
              ["COMPANY_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"].includes(
                userRole,
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    void reconcileAccount(
                      accounts.find(
                        (account) =>
                          account.currency === code &&
                          account.accountType === "CASH",
                      )!,
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

      <section
        aria-labelledby="cash-vouchers-section-title"
        className="space-y-4"
      >
        <div>
          <h2
            id="cash-vouchers-section-title"
            className="text-xl font-semibold text-slate-900"
          >
            Bon de sortie de caisse
          </h2>
        </div>
        <div
          role="tablist"
          aria-label="Gestion des bons de sortie"
          className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
        >
          {canIssueVoucher && (
            <button
              type="button"
              role="tab"
              aria-selected={showIssueView}
              onClick={() => setCashVoucherTab("issue")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${showIssueView ? "bg-white text-blue-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              Émettre un bon
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={!showIssueView}
            onClick={() => setCashVoucherTab("register")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${!showIssueView ? "bg-white text-blue-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Registre{" "}
            <span className="ml-1 text-xs text-slate-400">
              {vouchers.length}
            </span>
          </button>
        </div>
        {showIssueView && (
          <div>
            <form
              onSubmit={submitVoucher}
              className="cash-voucher-form space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                  Date de sortie
                  <input
                    required
                    type="date"
                    value={date}
                    onChange={(event) => setDateOverride(event.target.value)}
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
                Motif
                <textarea
                  required
                  maxLength={500}
                  rows={2}
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
                {saving ? "Enregistrement…" : "Enregistrer le bon"}
              </button>
            </form>
          </div>
        )}
        {!showIssueView && (
          <div>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Registre des bons
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isLoading
                      ? "Chargement…"
                      : `${visibleVouchers.length} bon(s)`}
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
                            {voucher.reference &&
                            /^OP\/\d{4}\/\d+$/.test(voucher.reference) ? (
                              <Link
                                href={`/payment-orders?order=${encodeURIComponent(voucher.reference)}`}
                                className="mt-1 inline-block text-xs font-semibold text-blue-700 underline"
                              >
                                Examiner l’OP et son état de besoin ·{" "}
                                {voucher.reference}
                              </Link>
                            ) : voucher.reference ? (
                              <span className="mt-1 block text-xs text-slate-500">
                                Référence : {voucher.reference}
                              </span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                            {formatMoney(
                              Number(voucher.amount),
                              voucher.currency,
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${voucher.status === "PENDING_APPROVAL" ? "bg-amber-50 text-amber-800" : voucher.status === "REJECTED" || voucher.status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                            >
                              {voucher.status === "PENDING_APPROVAL"
                                ? "En attente du visa"
                                : voucher.status === "REJECTED"
                                  ? "Rejeté"
                                  : voucher.status === "CANCELLED"
                                    ? "Annulé"
                                    : "Approuvé · sortie autorisée"}
                            </span>
                            {voucher.managerApprovalName &&
                              voucher.status !== "PENDING_APPROVAL" && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Visa : {voucher.managerApprovalName}
                                </p>
                              )}
                            {voucher.rejectionReason && (
                              <p className="mt-1 max-w-48 text-xs text-rose-700">
                                Motif : {voucher.rejectionReason}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {voucher.status === "PENDING_APPROVAL" &&
                              ["COMPANY_ADMIN", "MANAGING_PARTNER"].includes(
                                userRole,
                              ) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void approveVoucher(voucher)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Approuver
                                    et signer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void rejectVoucher(voucher)}
                                    className="ml-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                  >
                                    <X className="h-3.5 w-3.5" /> Rejeter
                                  </button>
                                </>
                              )}
                            {(voucher.status === "ISSUED" ||
                              voucher.status === "CANCELLED") && (
                              <button
                                type="button"
                                onClick={() => printVoucher(voucher)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Imprimer
                              </button>
                            )}
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
                  {isLoading
                    ? "Chargement des données…"
                    : query
                      ? "Aucun bon ne correspond à cette recherche."
                      : "Aucun bon de sortie. Enregistrez le premier décaissement."}
                </p>
              )}
            </section>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Livre de caisse</h2>
            <p className="mt-1 text-sm text-slate-500">
              Journal des entrées, sorties et soldes après chaque mouvement.
            </p>
          </div>
          <button
            type="button"
            onClick={() => printTreasuryDocument("ledger")}
            disabled={
              !printReady ||
              isLoading ||
              selectedPeriodLoading ||
              !periodLoadedForSelection ||
              printSaving
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Imprimer le livre
          </button>
        </div>
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm font-medium text-slate-700">
            Période · du
            <input
              type="date"
              value={periodStart}
              max={periodEnd || undefined}
              onChange={(event) => setPeriodStart(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Au
            <input
              type="date"
              value={periodEnd}
              min={periodStart || undefined}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="pb-2 text-sm text-slate-500" aria-live="polite">
            {!periodStart || !periodEnd
              ? "Sélectionnez les deux dates pour consulter ou imprimer."
              : periodStart > periodEnd
                ? "La date de début doit précéder la date de fin."
                : selectedPeriodLoading
                  ? "Chargement de la période…"
                  : selectedPeriodData
                    ? `${selectedPeriodData.movements.length} mouvement${selectedPeriodData.movements.length > 1 ? "s" : ""} sur la période`
                    : "Aucune donnée de période disponible."}
          </div>
        </div>
        {periodLoadedForSelection && selectedPeriodData?.movements.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Libellé / pièce</th>
                  <th className="px-4 py-3 font-medium">Compte</th>
                  <th className="px-4 py-3 text-right font-medium">Entrée</th>
                  <th className="px-4 py-3 text-right font-medium">Sortie</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Solde après
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedMovements.map((movement) => (
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
                      {movement.sourceAmount &&
                        movement.sourceCurrency &&
                        movement.sourceCurrency !==
                          movement.cashAccount.currency && (
                          <p className="text-xs text-slate-500">
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
            {selectedPeriodLoading
              ? "Chargement des mouvements…"
              : selectedPeriodValid
                ? "Aucun mouvement de caisse sur cette période."
                : "Sélectionnez une période pour afficher le livre de caisse."}
          </p>
        )}
      </section>

      {printReady &&
        printData &&
        printDocument === "ledger" &&
        createPortal(
          <article
            className="cash-ledger-print"
            aria-label="Livre de caisse à imprimer"
          >
            <DocumentLetterhead />
            <div className="cash-period-print-body">
              <div className="cash-period-print-title">
                <div>
                  <p>Trésorerie · Journal des mouvements</p>
                  <h1>LIVRE DE CAISSE</h1>
                </div>
                <strong>
                  {formatDate(printData.from)} — {formatDate(printData.to)}
                </strong>
              </div>
              <p className="cash-period-print-note">
                Tous les comptes et modes d’encaissement · du{" "}
                {formatDate(printData.from)} au {formatDate(printData.to)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Libellé / pièce</th>
                    <th>Caisse</th>
                    <th>Entrée</th>
                    <th>Sortie</th>
                    <th>Solde après</th>
                  </tr>
                </thead>
                <tbody>
                  {periodMovementBalances.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.date)}</td>
                      <td>
                        {movement.description}
                        {movement.reference && (
                          <small>{movement.reference}</small>
                        )}
                        {movement.sourceAmount &&
                          movement.sourceCurrency &&
                          movement.sourceCurrency !==
                            movement.cashAccount.currency && (
                            <small>
                              Reçu{" "}
                              {formatMoney(
                                Number(movement.sourceAmount),
                                movement.sourceCurrency,
                              )}{" "}
                              · taux {movement.exchangeRate ?? "—"} CDF/USD
                            </small>
                          )}
                      </td>
                      <td>{movement.cashAccount.name}</td>
                      <td className="cash-print-number">
                        {movement.direction === "IN"
                          ? formatMoney(
                              Number(movement.amount),
                              movement.cashAccount.currency,
                            )
                          : "—"}
                      </td>
                      <td className="cash-print-number">
                        {movement.direction === "OUT"
                          ? formatMoney(
                              Number(movement.amount),
                              movement.cashAccount.currency,
                            )
                          : "—"}
                      </td>
                      <td className="cash-print-number">
                        {formatMoney(
                          movement.balanceAfter,
                          movement.cashAccount.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!printData.movements.length && (
                <p className="cash-period-empty">
                  Aucun mouvement de caisse sur cette période.
                </p>
              )}
              <section className="cash-period-balances">
                <h2>Soldes par compte</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Compte</th>
                      <th>Devise</th>
                      <th>Solde d’ouverture</th>
                      <th>Solde de clôture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printData.accounts.map((account) => (
                      <tr key={account.id}>
                        <td>
                          {account.name} · {account.code}
                        </td>
                        <td>{account.currency}</td>
                        <td>
                          {formatMoney(
                            Number(account.openingBalance),
                            account.currency,
                          )}
                        </td>
                        <td>
                          {formatMoney(
                            Number(account.closingBalance),
                            account.currency,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <p className="cash-period-print-generated">
                Édité le {formatDate(printData.printedAt)}
              </p>
            </div>
            <DocumentFooter />
          </article>,
          document.body,
        )}

      {printReady &&
        printData &&
        printDocument === "treasury" &&
        createPortal(
          <article
            className="cash-treasury-print"
            aria-label="Situation de trésorerie à imprimer"
          >
            <DocumentLetterhead />
            <div className="cash-period-print-body">
              <div className="cash-period-print-title">
                <div>
                  <p>Gestion financière · Synthèse de période</p>
                  <h1>SITUATION DE TRÉSORERIE</h1>
                </div>
                <strong>
                  {formatDate(printData.from)} — {formatDate(printData.to)}
                </strong>
              </div>
              <p className="cash-period-print-note">
                Les soldes physiques et les fonds d’approvisionnement OP sont
                présentés séparément.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Compte</th>
                    <th>Devise</th>
                    <th>Solde initial</th>
                    <th>Entrées</th>
                    <th>Sorties</th>
                    <th>Solde final</th>
                    <th>Fonds OP ouverture</th>
                    <th>Fonds OP clôture</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.accounts.map((account) => {
                    const totals = periodTotals[account.id] ?? {
                      entries: 0,
                      exits: 0,
                    };
                    return (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{account.currency}</td>
                        <td>
                          {formatMoney(
                            Number(account.openingBalance),
                            account.currency,
                          )}
                        </td>
                        <td>{formatMoney(totals.entries, account.currency)}</td>
                        <td>{formatMoney(totals.exits, account.currency)}</td>
                        <td>
                          <strong>
                            {formatMoney(
                              Number(account.closingBalance),
                              account.currency,
                            )}
                          </strong>
                        </td>
                        <td>
                          {formatMoney(
                            Number(account.openingPaymentOrderAvailable),
                            account.currency,
                          )}
                        </td>
                        <td>
                          {formatMoney(
                            Number(account.closingPaymentOrderAvailable),
                            account.currency,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <section className="cash-period-balances">
                <h2>Bons de sortie encore en attente</h2>
                <p className="cash-period-print-note">
                  Ils ne sont pas déduits du solde physique. État actuel au
                  moment de l’édition.
                </p>
                {pendingVouchers.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>N° bon</th>
                        <th>Date</th>
                        <th>Bénéficiaire</th>
                        <th>Motif</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingVouchers.map((voucher) => (
                        <tr key={voucher.id}>
                          <td>{voucher.voucherNumber}</td>
                          <td>{formatDate(voucher.date)}</td>
                          <td>{voucher.beneficiary}</td>
                          <td>{voucher.reason}</td>
                          <td className="cash-print-number">
                            {formatMoney(
                              Number(voucher.amount),
                              voucher.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Aucun bon en attente.</p>
                )}
              </section>
              <p className="cash-period-print-generated">
                Édité le {formatDate(printData.printedAt)}
              </p>
            </div>
            <DocumentFooter />
          </article>,
          document.body,
        )}

      {selectedVoucher &&
        (selectedVoucher.status === "ISSUED" ||
          selectedVoucher.status === "CANCELLED") &&
        createPortal(
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
                        (account) =>
                          account.id === selectedVoucher.cashAccountId,
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
                Je reconnais avoir reçu le montant indiqué ci-dessus et m’engage
                à remettre les pièces justificatives correspondantes.
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
                    {selectedVoucher.managerApprovalName ||
                      profile?.signatureTitle?.trim() ||
                      "Associé-Gérant"}
                  </span>
                  {selectedVoucher.managerApprovedAt && (
                    <span className="cash-voucher-approval-date">
                      Le {formatDate(selectedVoucher.managerApprovedAt)}
                    </span>
                  )}
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
          </article>,
          document.body,
        )}
    </div>
  );
}
