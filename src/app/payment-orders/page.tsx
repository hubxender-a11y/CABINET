"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  CircleDollarSign,
  FileText,
  Printer,
  Search,
  Send,
  ShieldCheck,
  X,
  Wallet,
  Paperclip,
  Pin,
  ExternalLink,
  Settings2,
} from "lucide-react";
import {
  DocumentFooter,
  DocumentLetterhead,
} from "@/components/document-letterhead";
import { useWorkspaceStore } from "@/components/workspace-store";
import { apiRequest } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/formatting";

type Currency = "CDF" | "USD";
type Status =
  "SUBMITTED" | "FINANCE_APPROVED" | "APPROVED" | "PAID" | "REJECTED";
type PaymentOrder = {
  id: string;
  orderNumber: string;
  date: string;
  requestingService: string;
  amount: string;
  amountInWords: string;
  currency: Currency;
  reason: string;
  beneficiary: string;
  expenseCategory?: string | null;
  accountingAllocation: string;
  budgetAccount: string;
  initialForecast: string;
  availableBefore: string;
  outstanding: string;
  availableAfter: string;
  status: Status;
  financeVisaName?: string | null;
  financeVisaAt?: string | null;
  managerVisaName?: string | null;
  managerVisaAt?: string | null;
  rejectionReason?: string | null;
  rejectedBy?: string | null;
  createdBy: string;
  paidAt?: string | null;
  attachment?: {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
  } | null;
  cashVoucher?: {
    id: string;
    voucherNumber: string;
    date: string;
    status: string;
  } | null;
};
type BudgetLine = {
  id: string;
  year: number;
  currency: Currency;
  budgetAccount: string;
  initialForecast: string;
};
type AccountingRule = {
  id: string;
  category: string;
  accountCode: string;
  accountName: string;
  budgetAccount?: string | null;
};
type CashAccountSummary = {
  currency: Currency;
  balance: string;
  paymentOrderAvailable: string;
  name: string;
};
type CurrentUser = { id: string; role: string; name: string };

const financeRoles = ["COMPANY_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"];
const requestRoles = [...financeRoles, "CASHIER"];
const statusLabel: Record<Status, string> = {
  SUBMITTED: "En attente des Finances",
  FINANCE_APPROVED: "Visa Finances obtenu",
  APPROVED: "OP validée · règlement à établir",
  PAID: "Payée · bon de sortie approuvé",
  REJECTED: "Rejetée",
};

function kinshasaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function wordsUnder100(n: number): string {
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
  if (n < 10) return units[n];
  if (n < 17)
    return ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"][
      n - 10
    ];
  if (n < 20) return `dix-${units[n - 10]}`;
  if (n < 70) {
    const tens = [
      "",
      "",
      "vingt",
      "trente",
      "quarante",
      "cinquante",
      "soixante",
    ][Math.floor(n / 10)];
    const rest = n % 10;
    return rest === 0
      ? tens
      : rest === 1
        ? `${tens} et un`
        : `${tens}-${units[rest]}`;
  }
  if (n < 80)
    return n === 71 ? "septante et un" : `septante ${wordsUnder100(n - 70)}`;
  if (n < 90)
    return n === 80
      ? "quatre-vingts"
      : `quatre-vingt${n === 81 ? "-un" : `-${wordsUnder100(n - 80)}`}`;
  return n === 90 ? "nonante" : `nonante ${wordsUnder100(n - 90)}`;
}

function wordsUnder1000(n: number): string {
  if (n < 100) return wordsUnder100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix =
    hundreds === 1
      ? "cent"
      : `${wordsUnder100(hundreds)} cent${rest ? "" : "s"}`;
  return rest ? `${prefix} ${wordsUnder100(rest)}` : prefix;
}

function numberWords(n: number): string {
  const groups = ["", "mille", "million", "milliard"];
  const parts: string[] = [];
  let remaining = Math.floor(n);
  let scale = 0;
  while (remaining > 0 && scale < groups.length) {
    const group = remaining % 1000;
    if (group) {
      const words = wordsUnder1000(group);
      parts.unshift(
        scale === 1
          ? group === 1
            ? "mille"
            : `${words} mille`
          : scale > 1
            ? `${words} ${groups[scale]}${group > 1 ? "s" : ""}`
            : words,
      );
    }
    remaining = Math.floor(remaining / 1000);
    scale++;
  }
  return parts.join(" ") || "zéro";
}

function amountToWords(value: string, currency: Currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1_000_000_000_000)
    return "";
  const unit = currency === "USD" ? "dollar américain" : "franc congolais";
  const minor = Math.round((amount - Math.floor(amount)) * 100);
  return `${numberWords(amount)} ${unit}${Math.floor(amount) > 1 ? "s" : ""}${minor ? ` et ${numberWords(minor)} centime${minor > 1 ? "s" : ""}` : ""}`.toLocaleUpperCase(
    "fr-CD",
  );
}

function printableOrderNumber(value: string) {
  if (/\/BROUILLON$/i.test(value)) return "BROUILLON";
  const match = /^OP\/(\d{4})\/(\d+)$/.exec(value);
  return match ? `${match[2]}/${match[1]}` : value.replace(/^OP\//, "");
}

function printableOrderDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDate(value);
}

function printableMoney(value: string, currency: Currency) {
  const maximumFractionDigits = currency === "USD" ? 2 : 0;
  return `${currency} ${new Intl.NumberFormat("fr-CD", {
    maximumFractionDigits,
  }).format(Number(value))}`;
}

function printableAmountInWords(value: string, currency: Currency) {
  const words = value
    .replace(/\s+(?:DOLLARS?\s+AMÉRICAINS?|FRANCS?\s+CONGOLAIS)(?=\s|$)/i, "")
    .trim();
  return words ? `${currency} ${words}` : "À compléter";
}

function statusClass(status: Status) {
  if (status === "APPROVED" || status === "PAID")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "REJECTED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "FINANCE_APPROVED")
    return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function normalizeCategory(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ");
}

export default function PaymentOrdersPage() {
  const { databaseConnected } = useWorkspaceStore();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [activeSection, setActiveSection] = useState<"new" | "register">("new");
  const [printOrder, setPrintOrder] = useState<PaymentOrder | null>(null);
  const [printDraft, setPrintDraft] = useState(false);
  const [printAttachment, setPrintAttachment] = useState<{
    fileName: string;
    mimeType: string;
    data: string;
  } | null>(null);
  const [printVoucherOrder, setPrintVoucherOrder] =
    useState<PaymentOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<PaymentOrder | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{
    orderId: string;
    fileName: string;
    mimeType: string;
    data: string;
  } | null>(null);
  const [attachmentLoadingId, setAttachmentLoadingId] = useState<string | null>(
    null,
  );
  const [attachmentPreviewError, setAttachmentPreviewError] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [accountingRules, setAccountingRules] = useState<AccountingRule[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccountSummary[]>([]);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [setupBudgetAccount, setSetupBudgetAccount] = useState("");
  const [setupForecast, setSetupForecast] = useState("");
  const [setupCategory, setSetupCategory] = useState("");
  const [setupAccountCode, setSetupAccountCode] = useState("");
  const [setupAccountName, setSetupAccountName] = useState("");
  const [setupDefaultBudget, setSetupDefaultBudget] = useState("");
  const [date, setDate] = useState("");
  const [requestingService, setRequestingService] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [reason, setReason] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [accountingCode, setAccountingCode] = useState("");
  const [accountingName, setAccountingName] = useState("");
  const [budgetAccount, setBudgetAccount] = useState("");

  useEffect(() => {
    setDate(kinshasaToday());
  }, []);
  useEffect(() => {
    const orderNumber = new URLSearchParams(window.location.search).get("order");
    if (orderNumber) {
      setSearch(orderNumber);
      setFilter("ALL");
    }
  }, []);
  useEffect(() => {
    const order = detailOrder;
    if (!order?.attachment) {
      setAttachmentPreview(null);
      setAttachmentLoadingId(null);
      setAttachmentPreviewError("");
      return;
    }
    if (attachmentPreview?.orderId === order.id) return;

    let active = true;
    setAttachmentLoadingId(order.id);
    setAttachmentPreviewError("");
    void apiRequest<{
      fileName: string;
      mimeType: string;
      data: string;
    }>(`/payment-orders/${order.id}/attachment`)
      .then((file) => {
        if (active)
          setAttachmentPreview({ orderId: order.id, ...file });
      })
      .catch((caught: unknown) => {
        if (active)
          setAttachmentPreviewError(
            caught instanceof Error
              ? caught.message
              : "Aperçu de la pièce justificative impossible.",
          );
      })
      .finally(() => {
        if (active) setAttachmentLoadingId(null);
      });
    return () => {
      active = false;
    };
  }, [attachmentPreview?.orderId, detailOrder]);
  useEffect(() => {
    if (!databaseConnected) {
      setLoading(false);
      return;
    }
    let active = true;
    void Promise.all([
      apiRequest<PaymentOrder[]>("/payment-orders"),
      apiRequest<CurrentUser>("/auth/me"),
    ])
      .then(([rows, currentUser]) => {
        if (active) {
          setOrders(rows);
          setUser(currentUser);
        }
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Chargement des OP impossible.",
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [databaseConnected]);

  useEffect(() => {
    if (!databaseConnected || !date) return;
    let active = true;
    setConfigurationLoading(true);
    const query = new URLSearchParams({
      year: date.slice(0, 4),
      currency,
    });
    void Promise.all([
      apiRequest<{ budgets: BudgetLine[]; accountingRules: AccountingRule[] }>(
        `/payment-orders/configuration?${query.toString()}`,
      ),
      apiRequest<{ accounts: CashAccountSummary[] }>("/cash-vouchers/treasury"),
    ])
      .then(([configuration, treasury]) => {
        if (!active) return;
        setBudgetLines(configuration.budgets);
        setAccountingRules(configuration.accountingRules);
        setBudgetAccount((current) =>
          configuration.budgets.some((line) => line.budgetAccount === current)
            ? current
            : configuration.budgets[0]?.budgetAccount ?? "",
        );
        setCashAccounts(treasury.accounts);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Chargement du budget ou de la caisse impossible.",
          );
      })
      .finally(() => {
        if (active) setConfigurationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currency, databaseConnected, date]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus =
          filter === "ALL" ||
          (filter === "PENDING"
            ? ["SUBMITTED", "FINANCE_APPROVED"].includes(order.status)
            : order.status === filter);
        const term = search.trim().toLocaleLowerCase("fr");
        const matchesSearch =
          !term ||
          [
            order.orderNumber,
            order.beneficiary,
            order.reason,
            order.requestingService,
            order.budgetAccount,
          ].some((value) => value.toLocaleLowerCase("fr").includes(term));
        return matchesStatus && matchesSearch;
      }),
    [filter, orders, search],
  );

  const targetYear = Number(date.slice(0, 4));
  const accountingAllocation = [accountingCode.trim(), accountingName.trim()]
    .filter(Boolean)
    .join(" · ");
  const budgetOrders = useMemo(
    () =>
      orders.filter(
        (item) =>
          item.budgetAccount.trim().toLocaleLowerCase("fr") ===
            budgetAccount.trim().toLocaleLowerCase("fr") &&
          item.currency === currency &&
          new Date(item.date).getUTCFullYear() === targetYear &&
          item.status !== "REJECTED",
      ),
    [budgetAccount, currency, orders, targetYear],
  );
  const selectedBudget = budgetLines.find(
    (line) => line.budgetAccount === budgetAccount,
  );
  const initialForecast = Number(
    selectedBudget?.initialForecast ?? budgetOrders[0]?.initialForecast ?? 0,
  );
  const paidBudget = budgetOrders
    .filter((item) => item.status === "PAID")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const outstandingBudget = budgetOrders
    .filter((item) =>
      ["SUBMITTED", "FINANCE_APPROVED", "APPROVED"].includes(item.status),
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const availableBefore = initialForecast - paidBudget;
  const budgetLeft = availableBefore - outstandingBudget - Number(amount || 0);
  const paymentOrderFunding = Number(
    cashAccounts.find((account) => account.currency === currency)?.paymentOrderAvailable ?? 0,
  );
  const selectedRule = accountingRules.find(
    (rule) => normalizeCategory(rule.category) === normalizeCategory(expenseCategory),
  );
  const budgetConfigured = Boolean(selectedBudget);
  const counts = useMemo(
    () => ({
      pending: orders.filter((item) =>
        ["SUBMITTED", "FINANCE_APPROVED"].includes(item.status),
      ).length,
      approved: orders.filter((item) => item.status === "APPROVED").length,
      rejected: orders.filter((item) => item.status === "REJECTED").length,
      paid: orders.filter((item) => item.status === "PAID").length,
    }),
    [orders],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!user || !requestRoles.includes(user.role)) {
      setError("Votre rôle ne permet pas de créer une OP.");
      return;
    }
    if (!budgetConfigured) {
      setError("Configurez d’abord la prévision approuvée de cette ligne budgétaire.");
      return;
    }
    if (!requestingService.trim() || !beneficiary.trim() || !reason.trim()) {
      setError("Complétez le service, le bénéficiaire et le motif de la demande.");
      return;
    }
    if (!accountingAllocation.trim()) {
      setError("Renseignez le code et l’intitulé du compte comptable.");
      return;
    }
    if (!attachmentFile) {
      setError("Joignez l’état de besoin à cette demande d’OP.");
      return;
    }
    if (budgetLeft < 0) {
      setError(
        "Le solde disponible après la demande ne peut pas être négatif.",
      );
      return;
    }
    setSaving(true);
    try {
      const attachmentBase64 = await fileAsBase64(attachmentFile);
      const order = await apiRequest<PaymentOrder>("/payment-orders", {
        method: "POST",
        body: JSON.stringify({
          date,
          requestingService,
          amount,
          currency,
          reason,
          beneficiary,
          expenseCategory,
          accountingAllocation,
          budgetAccount,
          attachmentName: attachmentFile.name,
          attachmentMimeType: attachmentFile.type,
          attachmentBase64,
        }),
      });
      setOrders((current) => [order, ...current]);
      setSuccess(
        `L’ordre ${order.orderNumber} a été enregistré et transmis au visa des Finances.`,
      );
      setRequestingService("");
      setAmount("");
      setReason("");
      setBeneficiary("");
      setExpenseCategory("");
      setAccountingCode("");
      setAccountingName("");
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      setAttachmentFile(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer l’OP.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveBudgetConfiguration() {
    setError("");
    if (!setupBudgetAccount.trim() || !setupForecast.trim()) {
      setError("Renseignez la ligne budgétaire et sa prévision initiale.");
      return;
    }
    setConfigurationSaving(true);
    try {
      const budget = await apiRequest<BudgetLine>("/payment-orders/budgets", {
        method: "POST",
        body: JSON.stringify({
          year: targetYear,
          currency,
          budgetAccount: setupBudgetAccount.trim(),
          initialForecast: setupForecast,
        }),
      });
      setBudgetLines((current) => [
        ...current.filter((line) => line.budgetAccount !== budget.budgetAccount),
        budget,
      ].sort((left, right) => left.budgetAccount.localeCompare(right.budgetAccount, "fr")));
      setBudgetAccount(budget.budgetAccount);
      setSetupBudgetAccount("");
      setSetupForecast("");
      setSuccess(`Budget approuvé enregistré pour ${budget.budgetAccount} · ${currency} · ${targetYear}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement du budget impossible.");
    } finally {
      setConfigurationSaving(false);
    }
  }

  async function saveAccountingConfiguration() {
    setError("");
    if (
      !setupCategory.trim() ||
      !setupAccountCode.trim() ||
      !setupAccountName.trim()
    ) {
      setError("Renseignez la nature de dépense, le code et l’intitulé du compte.");
      return;
    }
    setConfigurationSaving(true);
    try {
      const rule = await apiRequest<AccountingRule>("/payment-orders/accounting-rules", {
        method: "POST",
        body: JSON.stringify({
          category: setupCategory.trim(),
          accountCode: setupAccountCode.trim(),
          accountName: setupAccountName.trim(),
          budgetAccount: setupDefaultBudget || undefined,
        }),
      });
      setAccountingRules((current) => [
        ...current.filter((item) => normalizeCategory(item.category) !== normalizeCategory(rule.category)),
        rule,
      ].sort((left, right) => left.category.localeCompare(right.category, "fr")));
      setSetupCategory("");
      setSetupAccountCode("");
      setSetupAccountName("");
      setSetupDefaultBudget("");
      setSuccess(`Imputation proposée enregistrée pour « ${rule.category} ».`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement de l’imputation impossible.");
    } finally {
      setConfigurationSaving(false);
    }
  }

  function updateExpenseCategory(value: string) {
    setExpenseCategory(value);
    const rule = accountingRules.find(
      (item) => normalizeCategory(item.category) === normalizeCategory(value),
    );
    setAccountingCode(rule?.accountCode ?? "");
    setAccountingName(rule?.accountName ?? "");
    if (rule?.budgetAccount)
      setBudgetAccount(rule.budgetAccount);
  }

  async function act(
    order: PaymentOrder,
    action: "finance-visa" | "manager-visa" | "reject" | "pay",
  ) {
    setError("");
    setSuccess("");
    let body: string | undefined;
    if (action === "reject") {
      const rejectionReason = window.prompt(
        `Motif du rejet de ${order.orderNumber} :`,
      );
      if (!rejectionReason?.trim()) return;
      body = JSON.stringify({ reason: rejectionReason.trim() });
    } else if (
      !window.confirm(
        action === "finance-visa"
          ? `Enregistrer votre visa des Finances sur ${order.orderNumber} ?`
          : action === "manager-visa"
            ? `Valider définitivement ${order.orderNumber} au visa de l’Associé-Gérant ?`
            : `Émettre un bon de sortie caisse pour ${order.orderNumber} ? Le bon restera en attente du contrôle et du visa de l’Associé-Gérant. Aucun argent ne sera débité avant ce second visa.`,
      )
    )
      return;
    try {
      const updated = await apiRequest<PaymentOrder>(
        `/payment-orders/${order.id}/${action}`,
        { method: "POST", ...(body ? { body } : {}) },
      );
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess(action === "manager-visa" && updated.cashVoucher
        ? `${updated.orderNumber} approuvée. Le bon ${updated.cashVoucher.voucherNumber} est ajouté à la caisse en attente du visa final; aucun montant n’a été débité.`
        : action === "pay" && updated.cashVoucher
          ? `${updated.orderNumber} : bon ${updated.cashVoucher.voucherNumber} transmis à la caisse pour approbation. Aucun décaissement n’a encore été enregistré.`
          : `${updated.orderNumber} : ${statusLabel[updated.status]}.`);
      if (printOrder?.id === updated.id) setPrintOrder(updated);
      if (detailOrder?.id === updated.id) setDetailOrder(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.");
    }
  }

  async function openAttachment(order: PaymentOrder) {
    try {
      const file = await apiRequest<{
        fileName: string;
        mimeType: string;
        data: string;
      }>(`/payment-orders/${order.id}/attachment`);
      const link = document.createElement("a");
      link.href = `data:${file.mimeType};base64,${file.data}`;
      link.download = file.fileName;
      link.click();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ouverture de la pièce jointe impossible.",
      );
    }
  }

  async function print(order: PaymentOrder, draft = false) {
    setError("");
    let annex: { fileName: string; mimeType: string; data: string } | null = null;
    if (order.attachment) {
      try {
        annex = draft && attachmentFile
          ? {
              fileName: attachmentFile.name,
              mimeType: attachmentFile.type,
              data: await fileAsBase64(attachmentFile),
            }
          : await apiRequest<{
              fileName: string;
              mimeType: string;
              data: string;
            }>(`/payment-orders/${order.id}/attachment`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Impossible de charger l’état de besoin pour l’impression.");
        return;
      }
    }
    flushSync(() => {
      setPrintOrder(order);
      setPrintDraft(draft);
      setPrintAttachment(annex);
      setPrintVoucherOrder(null);
    });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!document.querySelector(".payment-order-document")) {
          setError("Le modèle de l’OP n’a pas pu être préparé pour l’impression. Réessayez.");
          return;
        }
        document.body.classList.add("print-payment-order-mode");
        const annexFrame = document.querySelector<HTMLIFrameElement>(".payment-order-attachment-pdf");
        const annexImage = document.querySelector<HTMLImageElement>(".payment-order-attachment-image");
        const annexReady = annexFrame
          ? new Promise<void>((resolve) => {
              annexFrame.addEventListener("load", () => resolve(), { once: true });
              window.setTimeout(resolve, 2500);
            })
          : annexImage && !annexImage.complete
            ? new Promise<void>((resolve) => {
                annexImage.addEventListener("load", () => resolve(), { once: true });
                annexImage.addEventListener("error", () => resolve(), { once: true });
              })
            : Promise.resolve();
        window.addEventListener(
          "afterprint",
          () => {
            document.body.classList.remove("print-payment-order-mode");
            setPrintAttachment(null);
          },
          { once: true },
        );
        void annexReady.then(() => window.print());
      }));
  }

  function printVoucher(order: PaymentOrder) {
    if (order.cashVoucher?.status !== "ISSUED") {
      setError("Le bon est encore en attente du contrôle et du visa de l’Associé-Gérant. Il ne peut pas encore être imprimé comme paiement effectué.");
      return;
    }
    flushSync(() => {
      setPrintVoucherOrder(order);
      setPrintOrder(null);
      setPrintDraft(false);
      setPrintAttachment(null);
    });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!document.querySelector(".cash-voucher-print")) {
          setError("Le modèle du bon de sortie n’a pas pu être préparé pour l’impression. Réessayez.");
          return;
        }
        document.body.classList.add("print-payment-order-mode");
        window.addEventListener(
          "afterprint",
          () => document.body.classList.remove("print-payment-order-mode"),
          { once: true },
        );
        window.print();
      }));
  }

  function previewDraft() {
    const preview: PaymentOrder = {
      id: "preview",
      orderNumber: `OP/${targetYear}/BROUILLON`,
      date,
      requestingService,
      amount,
      amountInWords: amountToWords(amount, currency),
      currency,
      reason,
      beneficiary,
      expenseCategory,
      accountingAllocation: accountingAllocation || "À confirmer par le comptable",
      budgetAccount: budgetAccount || "À définir par les Finances",
      initialForecast: selectedBudget ? String(initialForecast) : "",
      availableBefore: selectedBudget ? String(availableBefore) : "",
      outstanding: selectedBudget ? String(outstandingBudget) : "",
      availableAfter: selectedBudget ? String(budgetLeft) : "",
      status: "SUBMITTED",
      createdBy: user?.id ?? "preview",
      attachment: attachmentFile
        ? {
            id: "preview-attachment",
            fileName: attachmentFile.name,
            mimeType: attachmentFile.type,
            size: attachmentFile.size,
          }
        : null,
    };
    print(preview, true);
  }

  return (
    <div className="space-y-6">
      <header className="workspace-page-heading border-b border-slate-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          Gestion financière · Autorisations
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Ordres de paiement
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Préparez une demande, contrôlez son imputation budgétaire et
          recueillez les deux visas avant tout règlement.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <CircleAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <Check className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}
      {!databaseConnected && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La base est indisponible : les OP ne peuvent pas être enregistrées.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          {
            label: "À viser",
            value: counts.pending,
            tone: "text-amber-700 bg-amber-50",
          },
          {
            label: "Validées",
            value: counts.approved,
            tone: "text-emerald-700 bg-emerald-50",
          },
          {
            label: "Rejetées",
            value: counts.rejected,
            tone: "text-rose-700 bg-rose-50",
          },
          {
            label: "Payées",
            value: counts.paid,
            tone: "text-blue-700 bg-blue-50",
          },
        ].map(({ label, value, tone }) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <strong
              className={`mt-2 inline-flex rounded-lg px-3 py-1 text-2xl ${tone}`}
            >
              {value}
            </strong>
          </article>
        ))}
      </section>

      <div
        className="flex flex-wrap gap-2 border-b border-slate-200"
        role="tablist"
        aria-label="Sections des ordres de paiement"
      >
        <button
          id="payment-order-new-tab"
          type="button"
          role="tab"
          aria-selected={activeSection === "new"}
          aria-controls="payment-order-new-panel"
          onClick={() => setActiveSection("new")}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeSection === "new" ? "border-[#0b4778] text-[#0b4778]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          Nouveau dossier · OP {targetYear || "—"}
        </button>
        <button
          id="payment-order-register-tab"
          type="button"
          role="tab"
          aria-selected={activeSection === "register"}
          aria-controls="payment-order-register-panel"
          onClick={() => setActiveSection("register")}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeSection === "register" ? "border-[#0b4778] text-[#0b4778]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          Registre des OP
        </button>
      </div>

      <div
        id="payment-order-new-panel"
        role="tabpanel"
        aria-labelledby="payment-order-new-tab"
        hidden={activeSection !== "new"}
      >
        {user && requestRoles.includes(user.role) && (
          <form
            onSubmit={submit}
            className="payment-order-wizard space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                Nouveau dossier · OP {targetYear || "—"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Préparer un ordre de paiement
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Formulaire structuré selon le modèle du cabinet. L’état de besoin est annexé à l’OP ; les visas restent des validations humaines.
              </p>
            </div>

              <section className="space-y-3" aria-label="Demande de paiement">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#0b4778]">Demande de paiement</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-300">
                  <table className="payment-order-entry-table min-w-[560px] w-full border-collapse text-sm">
                    <tbody>
                      <tr><th scope="row">Date de la demande</th><td><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></td></tr>
                      <tr><th scope="row">Service demandeur</th><td><input required maxLength={100} value={requestingService} onChange={(event) => setRequestingService(event.target.value)} placeholder="Ex. Secrétariat" className={inputClass} /></td></tr>
                      <tr><th scope="row">Bénéficiaire</th><td><input required maxLength={160} value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} placeholder="Nom de la personne ou du fournisseur" className={inputClass} /></td></tr>
                      <tr><th scope="row">Devise de la demande</th><td><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} className={inputClass}><option value="CDF">CDF · Franc congolais</option><option value="USD">USD · Dollar américain</option></select></td></tr>
                      <tr><th scope="row">Montant sollicité</th><td><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" value={amount} onChange={(event) => setAmount(event.target.value.replace(",", "."))} placeholder={currency === "CDF" ? "16000" : "75.00"} className={inputClass} /><span className="flex items-center px-2 font-semibold text-slate-700">{currency}</span></div></td></tr>
                      <tr><th scope="row">Montant en lettres</th><td><output aria-live="polite" className="block min-h-10 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{amountToWords(amount, currency) || "Généré automatiquement depuis le montant."}</output></td></tr>
                      <tr><th scope="row">Motif détaillé de la demande</th><td><textarea required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex. Achat de 5 revues EC pour le cabinet" className={inputClass} /></td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="payment-order-controls" className="scroll-mt-6 space-y-4 border-t border-slate-200 pt-5" aria-label="Imputation et contrôle budgétaire">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#0b4778]">Imputation comptable et contrôle budgétaire · {targetYear || "—"}</h3>
                  {user && financeRoles.includes(user.role) && (
                    <button type="button" onClick={() => setConfigurationOpen((open) => !open)} className={actionClass}>
                      <Settings2 className="h-4 w-4" /> {configurationOpen ? "Fermer la configuration" : "Configurer budget et comptes"}
                    </button>
                  )}
                </div>
                <Field label="Nature de la dépense">
                  <input list="payment-order-categories" maxLength={100} value={expenseCategory} onChange={(event) => updateExpenseCategory(event.target.value)} placeholder="Choisir ou saisir une catégorie" className={inputClass} />
                  <datalist id="payment-order-categories">
                    {accountingRules.map((rule) => <option key={rule.id} value={rule.category} />)}
                  </datalist>
                  {selectedRule && <small className="text-emerald-700">Compte proposé : {selectedRule.accountCode} · {selectedRule.accountName}</small>}
                </Field>
                <div className="overflow-x-auto rounded-xl border border-slate-300">
                  <table className="payment-order-budget-entry-table min-w-[900px] w-full border-collapse text-xs">
                    <thead>
                      <tr><th colSpan={2}>Imputation comptable · à confirmer par le comptable</th><th colSpan={5}>Contrôle budgétaire</th></tr>
                      <tr><th>Compte · code</th><th>Intitulé du compte</th><th>Ligne budgétaire</th><th>Prévision initiale</th><th>Solde dispo (1)</th><th>Encours</th><th>Solde dispo (2)</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><input required maxLength={40} value={accountingCode} onChange={(event) => setAccountingCode(event.target.value)} placeholder="Ex. 6041" className={inputClass} /></td>
                        <td><input required maxLength={80} value={accountingName} onChange={(event) => setAccountingName(event.target.value)} placeholder="Ex. Fournitures et documentation" className={inputClass} /></td>
                        <td><select required value={budgetAccount} onChange={(event) => setBudgetAccount(event.target.value)} className={inputClass}><option value="">{configurationLoading ? "Chargement…" : "Sélectionner"}</option>{budgetLines.map((line) => <option key={line.id} value={line.budgetAccount}>{line.budgetAccount}</option>)}</select></td>
                        <td>{selectedBudget ? formatMoney(initialForecast, currency) : "—"}</td>
                        <td>{selectedBudget ? formatMoney(availableBefore, currency) : "—"}</td>
                        <td>{selectedBudget ? formatMoney(outstandingBudget + Number(amount || 0), currency) : "—"}</td>
                        <td className={budgetLeft < 0 ? "text-rose-700" : "text-emerald-700"}>{selectedBudget ? formatMoney(budgetLeft, currency) : "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {selectedBudget ? (
                  <p className="text-xs text-slate-500">Déjà payé : {formatMoney(paidBudget, currency)} · Solde dispo (1) = prévision − paiements · Encours = autres OP non rejetées + cette OP · Solde dispo (2) = solde (1) − encours.</p>
                ) : (
                  <p className="text-sm text-amber-900">{configurationLoading ? "Chargement du budget approuvé…" : "Aucune prévision n’est chargée pour cette ligne. Les Finances doivent configurer le budget approuvé avant la demande."}</p>
                )}
                {selectedBudget && budgetLeft < 0 && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Dépassement de {formatMoney(Math.abs(budgetLeft), currency)}. L’OP ne peut pas être transmise.</p>}
                {configurationOpen && user && financeRoles.includes(user.role) && (
                    <div className="grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        <div><h4 className="font-semibold text-slate-900">Budget approuvé</h4><p className="text-xs text-slate-500">Saisir chaque ligne et sa prévision annuelle validée par les Finances.</p></div>
                        <Field label="Ligne budgétaire"><input maxLength={120} value={setupBudgetAccount} onChange={(event) => setSetupBudgetAccount(event.target.value)} placeholder="Ex. Fournitures et documentation" className={inputClass} /></Field>
                        <Field label={`Prévision initiale · ${currency}`}><input min="0" step={currency === "CDF" ? "1" : "0.01"} type="number" value={setupForecast} onChange={(event) => setSetupForecast(event.target.value)} placeholder={currency === "USD" ? "200.00" : "200000"} className={inputClass} /></Field>
                        <button type="button" onClick={() => void saveBudgetConfiguration()} disabled={configurationSaving} className={actionClass}><Check className="h-4 w-4" /> Enregistrer la prévision</button>
                      </div>
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        <div><h4 className="font-semibold text-slate-900">Règle d’imputation</h4><p className="text-xs text-slate-500">Le logiciel propose le compte; le comptable le confirme ou le corrige.</p></div>
                        <Field label="Nature de dépense"><input maxLength={100} value={setupCategory} onChange={(event) => setSetupCategory(event.target.value)} placeholder="Ex. Revues et documentation" className={inputClass} /></Field>
                        <div className="grid gap-3 sm:grid-cols-2"><Field label="Code du compte"><input maxLength={40} value={setupAccountCode} onChange={(event) => setSetupAccountCode(event.target.value)} placeholder="6041" className={inputClass} /></Field><Field label="Intitulé du compte"><input maxLength={100} value={setupAccountName} onChange={(event) => setSetupAccountName(event.target.value)} placeholder="Fournitures de bureau" className={inputClass} /></Field></div>
                        <Field label="Ligne budgétaire proposée (facultatif)"><select value={setupDefaultBudget} onChange={(event) => setSetupDefaultBudget(event.target.value)} className={inputClass}><option value="">Aucune</option>{budgetLines.map((line) => <option key={line.id} value={line.budgetAccount}>{line.budgetAccount}</option>)}</select></Field>
                        <button type="button" onClick={() => void saveAccountingConfiguration()} disabled={configurationSaving} className={actionClass}><Check className="h-4 w-4" /> Enregistrer la règle</button>
                      </div>
                      {accountingRules.length > 0 && <div className="lg:col-span-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Règles configurées</p><ul className="grid gap-2 sm:grid-cols-2">{accountingRules.map((rule) => <li key={rule.id} className="rounded-lg bg-slate-100 px-3 py-2 text-sm"><strong>{rule.category}</strong><span className="block text-xs text-slate-600">{rule.accountCode} · {rule.accountName}{rule.budgetAccount ? ` · ${rule.budgetAccount}` : ""}</span></li>)}</ul></div>}
                    </div>
                  )}
                <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm text-slate-900">Approvisionnement disponible pour les OP · {currency}</strong>
                    <p className="mt-1 text-sm text-slate-700">{formatMoney(paymentOrderFunding, currency)} provenant des versements de l’Associé-Gérant. Les règlements des factures clients ne sont pas inclus dans ce fonds.</p>
                    {Number(amount) > paymentOrderFunding && <p className="mt-2 text-xs font-semibold text-amber-800">Approvisionnement insuffisant pour ce paiement. L’OP peut suivre son circuit de visa, mais l’Associé-Gérant devra réapprovisionner la caisse avant le règlement.</p>}
                  </div>
                  <Link href="/cash-vouchers" className="shrink-0 text-xs font-bold text-blue-800 underline">Gérer la caisse</Link>
                </div>
              </section>

              <section className="space-y-4 border-t border-slate-200 pt-5" aria-label="État de besoin et transmission">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#0b4778]">État de besoin</h3>
                  <p className="mt-1 text-sm text-slate-600">Joignez le document qui accompagnera l’OP et sera examiné avec les visas.</p>
                </div>
                <div>
                  <span className="mb-2 block text-sm font-medium text-slate-700">Document à annexer · PDF, JPG, PNG, DOCX ou XLSX · 8 Mo maximum</span>
                  <input ref={attachmentInputRef} id="payment-order-need-file" required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    if (selected && selected.size > 8 * 1024 * 1024) {
                      setAttachmentFile(null);
                      event.currentTarget.value = "";
                      setError("L’état de besoin ne peut pas dépasser 8 Mo.");
                      return;
                    }
                    setError("");
                    setAttachmentFile(selected);
                  }} className="sr-only" />
                  <label htmlFor="payment-order-need-file" className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                    <Paperclip className="h-4 w-4" /> Parcourir
                  </label>
                  {attachmentFile && <span className="mt-2 flex items-center gap-2 text-sm font-semibold text-blue-800"><Pin className="h-4 w-4 shrink-0" />{attachmentFile.name} · {(attachmentFile.size / 1024 / 1024).toFixed(2)} Mo</span>}
                </div>
                <button type="button" onClick={previewDraft} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100">
                  <Printer className="h-4 w-4" /> Prévisualiser l’OP
                </button>
                <button type="submit" disabled={saving || !databaseConnected || !budgetConfigured || !accountingCode.trim() || !accountingName.trim() || !attachmentFile || budgetLeft < 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                  <Send className="h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer et transmettre"}
                </button>
                <p className="text-xs leading-5 text-slate-500">Après les visas des Finances et de l’Associé-Gérant, le bon de sortie est créé automatiquement dans la caisse. Le décaissement attend l’approbation de ce bon.</p>
              </section>
          </form>
        )}
      </div>

      <div
        id="payment-order-register-panel"
        role="tabpanel"
        aria-labelledby="payment-order-register-tab"
        hidden={activeSection !== "register"}
      >
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Registre des OP
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {loading
                    ? "Chargement…"
                    : `${filteredOrders.length} ordre(s)`}
                </p>
              </div>
              <FileText className="h-5 w-5 text-blue-700" />
            </div>
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="tablist"
              aria-label="Listes des ordres de paiement"
            >
              {[
                { key: "PENDING", label: `En attente (${counts.pending})` },
                { key: "APPROVED", label: `Approuvées (${counts.approved})` },
                { key: "PAID", label: `Payées (${counts.paid})` },
                { key: "REJECTED", label: `Rejetées (${counts.rejected})` },
                { key: "ALL", label: "Toutes" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === tab.key ? "border-[#0b4778] bg-[#0b4778] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <label className="relative mt-3 block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Rechercher une OP"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Numéro, bénéficiaire, motif…"
                className={`${inputClass} pl-9`}
              />
            </label>
          </div>
          {filteredOrders.length ? (
            <div className="max-h-[75vh] divide-y divide-slate-100 overflow-auto">
              {filteredOrders.map((order) => {
                const canFinance = Boolean(
                  user &&
                  financeRoles.includes(user.role) &&
                  order.status === "SUBMITTED" &&
                  user.id !== order.createdBy,
                );
                const canManager = Boolean(
                  user?.role === "COMPANY_ADMIN" &&
                  order.status === "FINANCE_APPROVED" &&
                  user.id !== order.createdBy &&
                  user.name !== order.financeVisaName,
                );
                const canReject = Boolean(
                  user &&
                  financeRoles.includes(user.role) &&
                  ["SUBMITTED", "FINANCE_APPROVED"].includes(order.status) &&
                  user.id !== order.createdBy,
                );
                return (
                  <article key={order.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {order.orderNumber}{" "}
                          <span className="font-normal text-slate-500">
                            · {formatDate(order.date)}
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {order.beneficiary} ·{" "}
                          {formatMoney(order.amount, order.currency)}
                        </p>
                        <p className="mt-1 max-w-xl text-xs text-slate-500">
                          {order.requestingService} · {order.reason}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(order.status)}`}
                      >
                        {order.status === "APPROVED" && order.cashVoucher?.status === "PENDING_APPROVAL" ? "Bon en attente du visa" : statusLabel[order.status]}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                      {order.financeVisaName && (
                        <span>Visa Finances : {order.financeVisaName}</span>
                      )}
                      {order.managerVisaName && (
                        <span>Associé-Gérant : {order.managerVisaName}</span>
                      )}
                      {order.cashVoucher && (
                        <span>
                          Bon de sortie · {order.cashVoucher.status === "PENDING_APPROVAL" ? "en attente du visa" : order.cashVoucher.status === "ISSUED" ? "approuvé et payé" : order.cashVoucher.status === "REJECTED" ? "rejeté" : "annulé"} :{" "}
                          <strong className="text-slate-700">
                            {order.cashVoucher.voucherNumber}
                          </strong>
                        </span>
                      )}
                      {order.rejectionReason && (
                        <span className="text-rose-700">
                          Motif : {order.rejectionReason}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailOrder(order)}
                        className={actionClass}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Explorer
                      </button>
                      <button
                        type="button"
                        onClick={() => print(order)}
                        className={actionClass}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {order.attachment ? "Imprimer l’OP et l’état de besoin" : "Imprimer l’OP"}
                      </button>
                      {order.cashVoucher?.status === "ISSUED" && (
                        <button
                          type="button"
                          onClick={() => printVoucher(order)}
                          className={actionClass}
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Imprimer le bon {order.cashVoucher.voucherNumber}
                        </button>
                      )}
                      {order.attachment && (
                        <button
                          type="button"
                          onClick={() => void openAttachment(order)}
                          className={actionClass}
                        >
                          <Pin className="h-3.5 w-3.5" />
                          État de besoin
                        </button>
                      )}
                      {canFinance && (
                        <button
                          type="button"
                          onClick={() => void act(order, "finance-visa")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Visa Finances
                        </button>
                      )}
                      {canManager && (
                        <button
                          type="button"
                          onClick={() => void act(order, "manager-visa")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Visa Associé-Gérant
                        </button>
                      )}
                      {user && requestRoles.includes(user.role) &&
                        order.status === "APPROVED" && (
                          <button
                            type="button"
                            onClick={() => setDetailOrder(order)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4778] px-3 py-2 text-xs font-semibold text-white"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            {order.cashVoucher?.status === "PENDING_APPROVAL" ? "Consulter le bon en attente" : order.cashVoucher?.status === "ISSUED" ? "Paiement confirmé" : "Examiner l’OP et établir le bon"}
                          </button>
                        )}
                      {canReject && (
                        <button
                          type="button"
                          onClick={() => void act(order, "reject")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"
                        >
                          <X className="h-3.5 w-3.5" />
                          Rejeter
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">
                Aucun ordre de paiement
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Les demandes créées apparaîtront ici avec leur circuit de visa.
              </p>
            </div>
          )}
        </section>
      </div>

      {printOrder && createPortal(
        <article
          className="payment-order-print payment-order-document"
          aria-label="Ordre de paiement à imprimer"
        >
          <p className="payment-order-date">Kinshasa le {printableOrderDate(printOrder.date)}</p>
          <header className="payment-order-heading">
            <h2>ORDONNANCE DE PAYEMENT N° {printableOrderNumber(printOrder.orderNumber)}</h2>
            {printDraft && <p className="payment-order-draft-mark">BROUILLON · NON ENREGISTRÉ</p>}
          </header>
          <div className="payment-order-fields">
            <table>
              <tbody>
                <tr><th>SERVICE DEMANDEUR</th><td>{printOrder.requestingService}</td></tr>
                <tr><th>MONTANT SOLLICITÉ (EN CHIFFRE)</th><td>{printableMoney(printOrder.amount, printOrder.currency)}</td></tr>
                <tr><th>MONTANT SOLLICITÉ (EN LETTRE)</th><td>{printableAmountInWords(printOrder.amountInWords, printOrder.currency)}</td></tr>
                <tr><th>MOTIF DE LA DEMANDE</th><td>{printOrder.reason}</td></tr>
                <tr><th>BENEFICIAIRE</th><td>{printOrder.beneficiary}</td></tr>
              </tbody>
            </table>
          </div>
          <section className="payment-order-budget">
            <table>
              <colgroup>
                <col style={{ width: "18%" }} /><col style={{ width: "25.4%" }} />
                <col style={{ width: "13.9%" }} /><col style={{ width: "14.3%" }} />
                <col style={{ width: "12.6%" }} /><col style={{ width: "15.8%" }} />
              </colgroup>
              <thead><tr><th colSpan={2}>IMPUTATION COMPTABLE</th><th colSpan={4}>CONTROLE BUDGETAIRE</th></tr></thead>
              <tbody>
                <tr>
                  <th rowSpan={3}>COMPTE</th>
                  <td className="payment-order-account-value" rowSpan={3}>{printOrder.accountingAllocation || "À confirmer par le comptable"}</td>
                  <th>COMPTE</th>
                  <td className="payment-order-budget-account" colSpan={3}>{printOrder.budgetAccount || "À définir par les Finances"}</td>
                </tr>
                <tr><th>PREVISION INITIALE</th><th>SOLDE DISPO (1)</th><th>ENCOURS</th><th>SOLDE DISPO (2)</th></tr>
                <tr>
                  <td>{printOrder.initialForecast.trim() ? printableMoney(printOrder.initialForecast, printOrder.currency) : "À définir"}</td>
                  <td>{printOrder.availableBefore.trim() ? printableMoney(printOrder.availableBefore, printOrder.currency) : "À calculer"}</td>
                  <td>{printOrder.outstanding.trim() ? printableMoney(String(Number(printOrder.outstanding) + Number(printOrder.amount)), printOrder.currency) : "À calculer"}</td>
                  <td>{printOrder.availableAfter.trim() ? printableMoney(printOrder.availableAfter, printOrder.currency) : "À calculer"}</td>
                </tr>
              </tbody>
            </table>
          </section>
          {printOrder.attachment && (
            <p className="payment-order-annex">
              ÉTAT DE BESOIN ANNEXÉ : {printOrder.attachment.fileName}
            </p>
          )}
          <section className="payment-order-visas">
            <div>
              <h3>VISA</h3>
              <div className="payment-order-signature-line">
                {printOrder.financeVisaName ? (
                  <>
                    <strong>{printOrder.financeVisaName}</strong>
                    <span>
                      {printOrder.financeVisaAt
                        ? formatDate(printOrder.financeVisaAt)
                        : "Visa enregistré"}
                    </span>
                  </>
                ) : (
                  <span />
                )}
              </div>
              <p>Visa chargée des Finances</p>
            </div>
            <div>
              <h3>VISA</h3>
              <div className="payment-order-signature-line">
                {printOrder.managerVisaName ? (
                  <>
                    <strong>{printOrder.managerVisaName}</strong>
                    <span>
                      {printOrder.managerVisaAt
                        ? formatDate(printOrder.managerVisaAt)
                        : "Visa enregistré"}
                    </span>
                  </>
                ) : (
                  <span />
                )}
              </div>
              <p>Visa de l’Associé-Gérant</p>
            </div>
          </section>
        </article>,
        document.body,
      )}
      {printOrder && printAttachment && createPortal(
        <article className="payment-order-print payment-order-attachment-print" aria-label="État de besoin annexé à l’ordre de paiement">
          <header className="payment-order-attachment-heading">
            <p>CABINET TRANSPARENCY · DOSSIER DE PAIEMENT</p>
            <h2>ÉTAT DE BESOIN ANNEXÉ</h2>
            <strong>{printOrder.orderNumber} · {printAttachment.fileName}</strong>
          </header>
          {printAttachment.mimeType.startsWith("image/") ? (
            <img className="payment-order-attachment-image" src={`data:${printAttachment.mimeType};base64,${printAttachment.data}`} alt={`État de besoin : ${printAttachment.fileName}`} />
          ) : printAttachment.mimeType === "application/pdf" ? (
            <iframe className="payment-order-attachment-pdf" title={`État de besoin : ${printAttachment.fileName}`} src={`data:application/pdf;base64,${printAttachment.data}`} />
          ) : (
            <div className="payment-order-attachment-office-note">
              <p>Document joint : {printAttachment.fileName}</p>
              <p>Le navigateur ne peut pas incorporer ce format Office dans l’impression. Imprimez ce document séparément et joignez-le à l’OP.</p>
            </div>
          )}
        </article>,
        document.body,
      )}
      {printVoucherOrder?.cashVoucher && createPortal(
        <article
          className="payment-order-print cash-voucher-print"
          aria-label="Bon de sortie de caisse à imprimer"
        >
          <DocumentLetterhead />
          <div className="payment-order-heading">
            <div>
              <p className="payment-order-overline">
                Pièce de trésorerie · Décaissement
              </p>
              <h2>BON DE SORTIE DE CAISSE</h2>
            </div>
            <div className="payment-order-number">
              <span>N° de pièce</span>
              <strong>{printVoucherOrder.cashVoucher.voucherNumber}</strong>
            </div>
          </div>
          <p className="payment-order-date">
            Kinshasa, le{" "}
            {formatDate(printVoucherOrder.cashVoucher.date, {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="payment-order-fields">
            <div>
              <span>Bénéficiaire</span>
              <strong>{printVoucherOrder.beneficiary}</strong>
            </div>
            <div>
              <span>Ordre de paiement</span>
              <strong>{printVoucherOrder.orderNumber}</strong>
            </div>
            <div className="payment-order-wide">
              <span>Motif du décaissement</span>
              <strong>{printVoucherOrder.reason}</strong>
            </div>
            <div>
              <span>Montant payé</span>
              <strong>
                {formatMoney(
                  printVoucherOrder.amount,
                  printVoucherOrder.currency,
                )}
              </strong>
            </div>
            <div className="payment-order-wide">
              <span>Montant en lettres</span>
              <strong>{printVoucherOrder.amountInWords}</strong>
            </div>
            <div>
              <span>Imputation</span>
              <strong>
                {printVoucherOrder.accountingAllocation} ·{" "}
                {printVoucherOrder.budgetAccount}
              </strong>
            </div>
          </div>
          <section className="payment-order-visas">
            <div>
              <h3>Le bénéficiaire</h3>
              <div className="payment-order-signature-line">
                <span>Nom, date et signature</span>
              </div>
            </div>
            <div>
              <h3>La caisse</h3>
              <div className="payment-order-signature-line">
                <strong>{user?.name ?? "Cabinet Transparency"}</strong>
                <span>Décaissement enregistré</span>
              </div>
            </div>
          </section>
          <p className="payment-order-status payment-order-status-paid">
            Paiement enregistré · Référence OP {printVoucherOrder.orderNumber}
          </p>
          <DocumentFooter />
        </article>,
        document.body,
      )}
      {detailOrder && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailOrder(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-order-detail-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">
                  Dossier de paiement
                </p>
                <h2
                  id="payment-order-detail-title"
                  className="mt-1 text-xl font-semibold"
                >
                  {detailOrder.orderNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {detailOrder.beneficiary} ·{" "}
                  {formatMoney(detailOrder.amount, detailOrder.currency)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setDetailOrder(null)}
                className={actionClass}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <BudgetValue
                label="Statut"
                value={detailOrder.status === "APPROVED" && detailOrder.cashVoucher?.status === "PENDING_APPROVAL" ? "Bon de sortie en attente du visa" : statusLabel[detailOrder.status]}
              />
              <BudgetValue
                label="Imputation comptable"
                value={detailOrder.accountingAllocation}
              />
              <BudgetValue
                label="Service demandeur"
                value={detailOrder.requestingService}
              />
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Motif
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {detailOrder.reason}
              </p>
            </div>
            {detailOrder.attachment && (
              <section
                aria-label="Pièce justificative à vérifier avant paiement"
                className="mt-4 rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Pin className="h-4 w-4 text-amber-700" />
                      État de besoin lié à cette OP
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-600">
                      {detailOrder.attachment.fileName}
                    </p>
                  </div>
                  {attachmentPreview?.orderId === detailOrder.id && (
                    <span className="shrink-0 rounded-full bg-amber-200 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                      À vérifier avant paiement
                    </span>
                  )}
                </div>
                {attachmentLoadingId === detailOrder.id ? (
                  <p className="rounded-lg bg-white px-3 py-4 text-sm text-slate-600">
                    Chargement de la pièce justificative…
                  </p>
                ) : attachmentPreview?.orderId === detailOrder.id ? (
                  attachmentPreview.mimeType.startsWith("image/") ? (
                    // The data URL is fetched from the authenticated attachment endpoint.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:${attachmentPreview.mimeType};base64,${attachmentPreview.data}`}
                      alt={`Justificatif ${attachmentPreview.fileName}`}
                      className="max-h-[50vh] w-full rounded-lg border border-amber-200 bg-white object-contain"
                    />
                  ) : attachmentPreview.mimeType === "application/pdf" ? (
                    <iframe
                      title={`Justificatif ${attachmentPreview.fileName}`}
                      src={`data:application/pdf;base64,${attachmentPreview.data}`}
                      className="h-[50vh] w-full rounded-lg border border-amber-200 bg-white"
                    />
                  ) : (
                    <p className="rounded-lg bg-white px-3 py-4 text-sm text-slate-600">
                      Aperçu direct indisponible pour ce format. Téléchargez le
                      document pour le consulter avant paiement.
                    </p>
                  )
                ) : (
                  <p className="rounded-lg bg-white px-3 py-4 text-sm text-rose-700">
                    {attachmentPreviewError ||
                      "La pièce justificative n’a pas pu être chargée."}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openAttachment(detailOrder)}
                    className={actionClass}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Télécharger la pièce
                  </button>
                </div>
              </section>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {detailOrder.cashVoucher?.status === "ISSUED" && (
                <button
                  type="button"
                  onClick={() => printVoucher(detailOrder)}
                  className={actionClass}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimer le bon {detailOrder.cashVoucher.voucherNumber}
                </button>
              )}
              {detailOrder.cashVoucher?.status === "PENDING_APPROVAL" && (
                <p className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Bon {detailOrder.cashVoucher.voucherNumber} en attente d’examen et de visa dans le module Caisse. Aucun fonds n’a été débité.
                  <Link href="/cash-vouchers" className="ml-2 font-semibold underline">Ouvrir la caisse</Link>
                </p>
              )}
              {!detailOrder.attachment && detailOrder.status === "APPROVED" && (
                <p className="w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  Aucun état de besoin n’est annexé à cette ancienne OP. Ajoutez la pièce au dossier avant d’établir un bon de sortie.
                </p>
              )}
              {user && requestRoles.includes(user.role) &&
                detailOrder.status === "APPROVED" &&
                !["PENDING_APPROVAL", "ISSUED"].includes(detailOrder.cashVoucher?.status ?? "") && (
                  <button
                    type="button"
                    onClick={() => void act(detailOrder, "pay")}
                    disabled={!detailOrder.attachment || attachmentLoadingId === detailOrder.id || attachmentPreview?.orderId !== detailOrder.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4778] px-3 py-2 text-xs font-semibold text-white"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Émettre le bon de sortie
                  </button>
                )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const actionClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function BudgetValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5 text-sm font-medium text-slate-700">
      <span className="block">{label}</span>
      <output className="flex min-h-[42px] items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800">
        {value}
      </output>
    </div>
  );
}

function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Lecture de la pièce jointe impossible."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const separator = result.indexOf(",");
      if (separator < 0) reject(new Error("La pièce jointe est invalide."));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}
