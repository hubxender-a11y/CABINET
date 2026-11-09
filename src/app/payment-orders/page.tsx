"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  CircleAlert,
  FileText,
  Printer,
  Search,
  Send,
  ShieldCheck,
  X,
  Wallet,
  Paperclip,
  ExternalLink,
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
type CurrentUser = { id: string; role: string; name: string };

const financeRoles = ["COMPANY_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"];
const requestRoles = [...financeRoles, "CASHIER"];
const statusLabel: Record<Status, string> = {
  SUBMITTED: "En attente des Finances",
  FINANCE_APPROVED: "Visa Finances obtenu",
  APPROVED: "Validée par l’Associé-Gérant",
  PAID: "Payée · bon de caisse émis",
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

function statusClass(status: Status) {
  if (status === "APPROVED" || status === "PAID")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "REJECTED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "FINANCE_APPROVED")
    return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
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
  const [printOrder, setPrintOrder] = useState<PaymentOrder | null>(null);
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
  const [date, setDate] = useState("");
  const [requestingService, setRequestingService] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [reason, setReason] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [accountingAllocation, setAccountingAllocation] = useState("");
  const [budgetAccount, setBudgetAccount] = useState("");
  const [initialForecast, setInitialForecast] = useState("");

  useEffect(() => {
    setDate(kinshasaToday());
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
  const paidBudget = budgetOrders
    .filter((item) => item.status === "PAID")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const outstandingBudget = budgetOrders
    .filter((item) =>
      ["SUBMITTED", "FINANCE_APPROVED", "APPROVED"].includes(item.status),
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const availableBefore = Number(initialForecast || 0) - paidBudget;
  const budgetLeft = availableBefore - outstandingBudget - Number(amount || 0);
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
    if (budgetLeft < 0) {
      setError(
        "Le solde disponible après la demande ne peut pas être négatif.",
      );
      return;
    }
    setSaving(true);
    try {
      const attachmentBase64 = attachmentFile
        ? await fileAsBase64(attachmentFile)
        : undefined;
      const order = await apiRequest<PaymentOrder>("/payment-orders", {
        method: "POST",
        body: JSON.stringify({
          date,
          requestingService,
          amount,
          currency,
          reason,
          beneficiary,
          accountingAllocation,
          budgetAccount,
          initialForecast,
          ...(attachmentFile
            ? {
                attachmentName: attachmentFile.name,
                attachmentMimeType: attachmentFile.type,
                attachmentBase64,
              }
            : {}),
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
      setAccountingAllocation("");
      setBudgetAccount("");
      setInitialForecast("");
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
            : `Payer ${order.orderNumber} et émettre le bon de sortie ?`,
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
      setSuccess(`${updated.orderNumber} : ${statusLabel[updated.status]}.`);
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

  function print(order: PaymentOrder) {
    setPrintOrder(order);
    setPrintVoucherOrder(null);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        document.body.classList.add("print-payment-order-mode");
        window.addEventListener(
          "afterprint",
          () => document.body.classList.remove("print-payment-order-mode"),
          { once: true },
        );
        window.print();
      }),
    );
  }

  function printVoucher(order: PaymentOrder) {
    setPrintVoucherOrder(order);
    setPrintOrder(null);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        document.body.classList.add("print-payment-order-mode");
        window.addEventListener(
          "afterprint",
          () => document.body.classList.remove("print-payment-order-mode"),
          { once: true },
        );
        window.print();
      }),
    );
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

      <section className="grid items-start gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        {user && requestRoles.includes(user.role) && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Nouvel ordre de paiement
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Le numéro OP est attribué automatiquement à l’enregistrement.
              </p>
            </div>
            <div className="grid gap-3">
              <Field label="Date de la demande">
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Service demandeur">
                <input
                  required
                  maxLength={100}
                  value={requestingService}
                  onChange={(e) => setRequestingService(e.target.value)}
                  placeholder="Ex. Secrétariat"
                  className={inputClass}
                />
              </Field>
              <Field label="Bénéficiaire">
                <input
                  required
                  maxLength={160}
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Devise">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className={inputClass}
                >
                  <option value="CDF">CDF · Franc congolais</option>
                  <option value="USD">USD · Dollar américain</option>
                </select>
              </Field>
              <Field label="Montant sollicité">
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                  placeholder={currency === "CDF" ? "16000" : "75.00"}
                  className={inputClass}
                />
              </Field>
              <Field label="Montant en lettres">
                <div
                  aria-live="polite"
                  className={`${inputClass} min-h-[42px] bg-slate-50 text-xs leading-5`}
                >
                  {amountToWords(amount, currency) ||
                    "Sera généré depuis le montant."}
                </div>
              </Field>
            </div>
            <Field label="Motif de la demande">
              <textarea
                required
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Décrivez l’objet précis du paiement"
                className={inputClass}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Imputation comptable">
                <input
                  required
                  maxLength={120}
                  value={accountingAllocation}
                  onChange={(e) => setAccountingAllocation(e.target.value)}
                  placeholder="Ex. Honoraires d’audit"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
              <Field label="Compte budgétaire">
                <input
                  required
                  maxLength={80}
                  value={budgetAccount}
                  onChange={(e) => setBudgetAccount(e.target.value)}
                  placeholder="Ex. 6041 · Fournitures"
                  className={inputClass}
                />
              </Field>
              <Field label="Enveloppe budgétaire annuelle">
                <input
                  required
                  inputMode="decimal"
                  value={initialForecast}
                  onChange={(e) =>
                    setInitialForecast(e.target.value.replace(",", "."))
                  }
                  placeholder={currency === "CDF" ? "5000000" : "2500"}
                  className={inputClass}
                />
              </Field>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Le plafond et les engagements sont contrôlés automatiquement à
                l’enregistrement, sans encombrer le formulaire ni l’OP
                imprimée avec des soldes à zéro.
              </p>
            </div>
            <Field label="Pièce justificative (PDF, JPG, PNG, DOCX ou XLSX · 8 Mo max)">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-800`}
              />
              {attachmentFile && (
                <span className="block text-xs text-slate-500">
                  {attachmentFile.name} ·{" "}
                  {(attachmentFile.size / 1024 / 1024).toFixed(2)} Mo
                </span>
              )}
            </Field>
            <button
              type="submit"
              disabled={saving || !databaseConnected || budgetLeft < 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b4778] px-4 py-3 text-sm font-semibold text-white hover:bg-[#08385f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {saving
                ? "Enregistrement…"
                : "Enregistrer et transmettre aux Finances"}
            </button>
            <p className="text-xs leading-5 text-slate-500">
              Après les deux visas, l’administrateur peut payer l’OP : le
              système émet alors un bon de sortie numéroté et inscrit le
              décaissement en caisse.
            </p>
          </form>
        )}

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4">
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
                        {statusLabel[order.status]}
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
                          Bon de sortie :{" "}
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
                        Imprimer l’OP
                      </button>
                      {order.cashVoucher && (
                        <button
                          type="button"
                          onClick={() => printVoucher(order)}
                          className={actionClass}
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Voir le bon {order.cashVoucher.voucherNumber}
                        </button>
                      )}
                      {order.attachment && (
                        <button
                          type="button"
                          onClick={() => void openAttachment(order)}
                          className={actionClass}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Pièce jointe
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
                      {user?.role === "COMPANY_ADMIN" &&
                        order.status === "APPROVED" && (
                          <button
                            type="button"
                            onClick={() => setDetailOrder(order)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4778] px-3 py-2 text-xs font-semibold text-white"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Vérifier la pièce et payer
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
      </section>

      {printOrder && (
        <article
          className="payment-order-print"
          aria-label="Ordre de paiement à imprimer"
        >
          <DocumentLetterhead />
          <div className="payment-order-heading">
            <div>
              <p className="payment-order-overline">
                Pièce de trésorerie · Autorisation préalable
              </p>
              <h2>ORDONNANCE DE PAIEMENT</h2>
            </div>
            <div className="payment-order-number">
              <span>N° d’ordre</span>
              <strong>{printOrder.orderNumber.replace(/^OP\//, "")}</strong>
            </div>
          </div>
          <p className="payment-order-date">
            Kinshasa, le{" "}
            {formatDate(printOrder.date, {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="payment-order-fields">
            <div>
              <span>Service demandeur</span>
              <strong>{printOrder.requestingService}</strong>
            </div>
            <div>
              <span>Bénéficiaire</span>
              <strong>{printOrder.beneficiary}</strong>
            </div>
            <div className="payment-order-wide">
              <span>Motif de la demande</span>
              <strong>{printOrder.reason}</strong>
            </div>
            <div>
              <span>Montant sollicité (en chiffres)</span>
              <strong>
                {formatMoney(printOrder.amount, printOrder.currency)}
              </strong>
            </div>
            <div className="payment-order-wide">
              <span>Montant sollicité (en lettres)</span>
              <strong>{printOrder.amountInWords}</strong>
            </div>
            <div>
              <span>Imputation comptable</span>
              <strong>{printOrder.accountingAllocation}</strong>
            </div>
          </div>
          <section className="payment-order-visas">
            <div>
              <h3>Visa de la chargée des Finances</h3>
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
                  <span>Nom, date et signature</span>
                )}
              </div>
            </div>
            <div>
              <h3>Visa de l’Associé-Gérant</h3>
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
                  <span>Nom, date et signature</span>
                )}
              </div>
            </div>
          </section>
          <p
            className={`payment-order-status payment-order-status-${printOrder.status.toLowerCase()}`}
          >
            Statut : {statusLabel[printOrder.status]}
            {printOrder.rejectionReason
              ? ` · Motif : ${printOrder.rejectionReason}`
              : ""}
          </p>
          <DocumentFooter />
        </article>
      )}
      {printVoucherOrder?.cashVoucher && (
        <article
          className="payment-order-print"
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
        </article>
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
                value={statusLabel[detailOrder.status]}
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
                      <Paperclip className="h-4 w-4 text-amber-700" />
                      Justificatif lié à cette OP
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
              {detailOrder.cashVoucher && (
                <button
                  type="button"
                  onClick={() => printVoucher(detailOrder)}
                  className={actionClass}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Voir / imprimer {detailOrder.cashVoucher.voucherNumber}
                </button>
              )}
              {user?.role === "COMPANY_ADMIN" &&
                detailOrder.status === "APPROVED" && (
                  <button
                    type="button"
                    onClick={() => void act(detailOrder, "pay")}
                    disabled={
                      Boolean(detailOrder.attachment) &&
                      (attachmentLoadingId === detailOrder.id ||
                        attachmentPreview?.orderId !== detailOrder.id)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4778] px-3 py-2 text-xs font-semibold text-white"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Payer l’OP
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
