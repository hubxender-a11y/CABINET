"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Check,
  CircleAlert,
  FileText,
  Printer,
  Search,
  Send,
  X,
  Wallet,
  Paperclip,
  Pin,
  ExternalLink,
} from "lucide-react";
import {
  DocumentFooter,
  DocumentLetterhead,
} from "@/components/document-letterhead";
import { apiRequest } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/formatting";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

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
  emailNotification?: "sent" | "not_configured" | "failed";
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
type AttachmentPreview = {
  orderId: string;
  fileName: string;
  mimeType: string;
  src: string;
};
type FundsAccount = {
  currency: Currency;
  paymentOrderAvailable: string;
  paymentOrderProvisioned: string;
};

const financeRoles = ["COMPANY_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"];
const requestRoles = [...financeRoles, "CASHIER", "SECRETARY"];
const statusLabel: Record<Status, string> = {
  SUBMITTED: "À examiner par l’Associé-Gérant",
  FINANCE_APPROVED: "À examiner par l’Associé-Gérant",
  APPROVED: "Approuvée et signée par l’Associé-Gérant",
  PAID: "Payée · bon de caisse émis",
  REJECTED: "Rejetée",
};

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

export default function PaymentOrdersPage() {
  const today = useKinshasaDate();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [fundsAccounts, setFundsAccounts] = useState<FundsAccount[]>([]);
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
  const [attachmentPreview, setAttachmentPreview] =
    useState<AttachmentPreview | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] =
    useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [requestingService, setRequestingService] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [reason, setReason] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const effectiveDate = date || today || "";
  const isLoading = loading;
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<PaymentOrder[]>("/payment-orders"),
      apiRequest<CurrentUser>("/auth/me"),
      apiRequest<{ accounts: FundsAccount[] }>("/cash-vouchers/treasury"),
    ])
      .then(([rows, currentUser, treasury]) => {
        if (active) {
          setOrders(rows);
          setUser(currentUser);
          setFundsAccounts(treasury.accounts);
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
  }, []);

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
          ].some((value) => value.toLocaleLowerCase("fr").includes(term));
        return matchesStatus && matchesSearch;
      }),
    [filter, orders, search],
  );

  const fundsAccount = fundsAccounts.find((item) => item.currency === currency);
  const provisionedTotal = Number(fundsAccount?.paymentOrderProvisioned ?? 0);
  const availableBefore = Number(fundsAccount?.paymentOrderAvailable ?? 0);
  const outstandingBudget = orders
    .filter((item) =>
      item.currency === currency &&
      ["SUBMITTED", "FINANCE_APPROVED", "APPROVED"].includes(item.status),
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);
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
    if (!attachmentFile) {
      setError("Joignez l’état de besoin avant de transmettre l’ordre de paiement.");
      return;
    }
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
      const attachmentBase64 = await fileAsBase64(attachmentFile);
      const order = await apiRequest<PaymentOrder>("/payment-orders", {
        method: "POST",
        body: JSON.stringify({
          date: effectiveDate,
          requestingService,
          amount,
          currency,
          reason,
          beneficiary,
          attachmentName: attachmentFile.name,
          attachmentMimeType: attachmentFile.type,
          attachmentBase64,
        }),
      });
      setOrders((current) => [order, ...current]);
      setSuccess(
        order.emailNotification === "sent"
          ? `L’ordre ${order.orderNumber} est transmis à l’Associé-Gérant. L’e-mail avec l’OP PDF et l’état de besoin a été envoyé.`
          : order.emailNotification === "failed"
            ? `L’ordre ${order.orderNumber} est enregistré et reste en attente d’examen, mais l’e-mail n’a pas pu être envoyé. Prévenez l’administrateur.`
            : `L’ordre ${order.orderNumber} est enregistré et reste en attente d’examen. L’envoi e-mail doit encore être configuré par l’administrateur.`,
      );
      setRequestingService("");
      setAmount("");
      setReason("");
      setBeneficiary("");
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
    action: "manager-visa" | "reject" | "pay",
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
        action === "manager-visa"
          ? `Approuver et signer ${order.orderNumber} au visa de l’Associé-Gérant ?`
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
        current.map((item) =>
          item.id === updated.id
            ? { ...item, ...updated, attachment: updated.attachment ?? item.attachment }
            : item,
        ),
      );
      setSuccess(`${updated.orderNumber} : ${statusLabel[updated.status]}.`);
      if (printOrder?.id === updated.id) setPrintOrder(updated);
      if (detailOrder?.id === updated.id) {
        setDetailOrder({
          ...detailOrder,
          ...updated,
          attachment: updated.attachment ?? detailOrder.attachment,
        });
      }
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

  async function reviewOrder(order: PaymentOrder) {
    setDetailOrder(order);
    setAttachmentPreview(null);
    setAttachmentPreviewLoading(false);
    const mimeType = order.attachment?.mimeType;
    if (!mimeType || !["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
      return;
    }
    setAttachmentPreviewLoading(true);
    try {
      const file = await apiRequest<{
        fileName: string;
        mimeType: string;
        data: string;
      }>(`/payment-orders/${order.id}/attachment`);
      setAttachmentPreview({
        orderId: order.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        src: `data:${file.mimeType};base64,${file.data}`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aperçu de l’état de besoin indisponible.");
    } finally {
      setAttachmentPreviewLoading(false);
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
          Préparé par {user?.name?.trim() || "l’utilisateur connecté"}. L’OP et son état de besoin sont transmis à l’Associé-Gérant pour examen et signature.
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

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          {
            label: "À examiner",
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date de la demande">
                <input
                  required
                  type="date"
                  value={effectiveDate}
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
            <div className="overflow-hidden rounded-xl border border-blue-100 bg-white">
              <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Contrôle automatique des fonds OP · {currency}
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Calculé depuis les approvisionnements enregistrés et les OP non rejetées. Les recettes clients sont exclues.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-3">Source des fonds</th>
                      <th className="px-3 py-3 text-right">Approvisionné</th>
                      <th className="px-3 py-3 text-right">Solde dispo (1)</th>
                      <th className="px-3 py-3 text-right">Encours</th>
                      <th className="px-3 py-3 text-right">Solde dispo (2)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100 font-semibold text-slate-800">
                      <td className="px-3 py-3">Associé-Gérant</td>
                      <td className="px-3 py-3 text-right">{formatMoney(provisionedTotal, currency)}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(Math.max(0, availableBefore), currency)}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(outstandingBudget + Number(amount || 0), currency)}</td>
                      <td className={`px-3 py-3 text-right ${budgetLeft < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {formatMoney(Math.max(0, budgetLeft), currency)}{budgetLeft < 0 ? " · insuffisant" : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {provisionedTotal <= 0 && (
                <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                  Aucun approvisionnement n’est encore enregistré pour cette devise. Saisissez les fonds réellement remis dans le module Caisse.
                </p>
              )}
            </div>
            <Field label="État de besoin à joindre · obligatoire (PDF, JPG, PNG, DOCX ou XLSX · 8 Mo max)">
              <input
                required
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-800`}
              />
              {attachmentFile && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800">
                  <Pin className="h-3.5 w-3.5" />
                  État de besoin joint : {attachmentFile.name} ·{" "}
                  {(attachmentFile.size / 1024 / 1024).toFixed(2)} Mo
                </span>
              )}
            </Field>
            <button
              type="submit"
              disabled={saving || loading || !user || !attachmentFile || budgetLeft < 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b4778] px-4 py-3 text-sm font-semibold text-white hover:bg-[#08385f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {saving
                ? "Enregistrement…"
                : "Enregistrer et transmettre à l’Associé-Gérant"}
            </button>
            <p className="text-xs leading-5 text-slate-500">
              Après signature du Gérant, le bon de sortie apparaît dans le registre de caisse comme approuvé et prêt au paiement. Le solde baisse uniquement au paiement.
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
                  {isLoading
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
                { key: "PENDING", label: `À examiner (${counts.pending})` },
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
                        {order.attachment && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                            <Pin className="h-3 w-3" /> État de besoin joint
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(order.status)}`}
                      >
                        {statusLabel[order.status]}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                      <span>
                        Source :{" "}
                        <strong className="font-medium text-slate-700">
                          Fonds remis par l’Associé-Gérant
                        </strong>
                      </span>
                      <span>
                        Disponible après :{" "}
                        <strong className="font-medium text-slate-700">
                          {formatMoney(order.availableAfter, order.currency)}
                        </strong>
                      </span>
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
                      <button type="button" onClick={() => void reviewOrder(order)} className={actionClass}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Consulter l’OP
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
                          État de besoin
                        </button>
                      )}
                      {user && ["COMPANY_ADMIN", "CASHIER", "SECRETARY"].includes(user.role) &&
                        order.status === "APPROVED" && order.cashVoucher && (
                          <a href="/cash-vouchers" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                            <Wallet className="h-3.5 w-3.5" />
                            Bon {order.cashVoucher.voucherNumber} · prêt au paiement
                          </a>
                        )}
                      {user && ["COMPANY_ADMIN", "CASHIER", "SECRETARY"].includes(user.role) &&
                        order.status === "APPROVED" && !order.cashVoucher && (
                          <button
                            type="button"
                            onClick={() => void act(order, "pay")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4778] px-3 py-2 text-xs font-semibold text-white"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Payer et émettre le bon
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
          className="payment-order-print payment-order-document"
          aria-label="Ordre de paiement à imprimer"
        >
          <p className="payment-order-date">Kinshasa le {printableOrderDate(printOrder.date)}</p>
          <header className="payment-order-heading">
            <h2>ORDONNANCE DE PAYEMENT N° {printableOrderNumber(printOrder.orderNumber)}</h2>
          </header>
          <div className="payment-order-fields">
            <table>
              <tbody>
                <tr>
                  <th>SERVICE DEMANDEUR</th>
                  <td>{printOrder.requestingService}</td>
                </tr>
                <tr>
                  <th>MONTANT SOLLICITE (EN CHIFFRE)</th>
                  <td>{printableMoney(printOrder.amount, printOrder.currency)}</td>
                </tr>
                <tr>
                  <th>MONTANT SOLLICITE (EN LETTRE)</th>
                  <td>{printableAmountInWords(printOrder.amountInWords, printOrder.currency)}</td>
                </tr>
                <tr>
                  <th>MOTIF DE LA DEMANDE</th>
                  <td>{printOrder.reason}</td>
                </tr>
                <tr>
                  <th>BENEFICIAIRE</th>
                  <td>{printOrder.beneficiary}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <section className="payment-order-budget">
            <table>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "19.5%" }} />
                <col style={{ width: "19.5%" }} />
                <col style={{ width: "19.5%" }} />
                <col style={{ width: "19.5%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={5}>CONTRÔLE AUTOMATIQUE DES FONDS OP</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>SOURCE DES FONDS</th>
                  <th>APPROVISIONNÉ</th>
                  <th>SOLDE DISPO (1)</th>
                  <th>ENCOURS</th>
                  <th>SOLDE DISPO (2)</th>
                </tr>
                <tr>
                  <td>Associé-Gérant · {printOrder.currency}</td>
                  <td>{printOrder.initialForecast.trim() ? printableMoney(printOrder.initialForecast, printOrder.currency) : "À définir"}</td>
                  <td>{printOrder.availableBefore.trim() ? printableMoney(printOrder.availableBefore, printOrder.currency) : "À calculer"}</td>
                  <td>{printOrder.outstanding.trim() ? printableMoney(String(Number(printOrder.outstanding) + Number(printOrder.amount)), printOrder.currency) : "À calculer"}</td>
                  <td>{printOrder.availableAfter.trim() ? printableMoney(printOrder.availableAfter, printOrder.currency) : "À calculer"}</td>
                </tr>
              </tbody>
            </table>
          </section>
          {printOrder.attachment && (
            <section className="payment-order-annex">
              <Pin className="h-4 w-4" />
              <span>
                ÉTAT DE BESOIN ANNEXÉ : {printOrder.attachment.fileName}. À joindre à la présente ordonnance.
              </span>
            </section>
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
        </article>
      )}
      {printVoucherOrder?.cashVoucher && (
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
                <strong>{user?.name?.trim() || "Société"}</strong>
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
            if (event.target === event.currentTarget) {
              setDetailOrder(null);
              setAttachmentPreview(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-order-detail-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
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
                  {statusLabel[detailOrder.status]}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => {
                  setDetailOrder(null);
                  setAttachmentPreview(null);
                }}
                className={actionClass}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <BudgetValue
                label="Bénéficiaire"
                value={detailOrder.beneficiary}
              />
              <BudgetValue
                label="Service demandeur"
                value={detailOrder.requestingService}
              />
              <BudgetValue label="Date de demande" value={formatDate(detailOrder.date)} />
              <BudgetValue
                label="Montant sollicité"
                value={formatMoney(detailOrder.amount, detailOrder.currency)}
              />
            </div>
            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Aperçu de l’OP</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <BudgetValue label="Bénéficiaire" value={detailOrder.beneficiary} />
                <BudgetValue label="Montant en lettres" value={detailOrder.amountInWords} />
                <div className="sm:col-span-2">
                  <BudgetValue label="Motif" value={detailOrder.reason} />
                </div>
              </div>
              {detailOrder.managerVisaName && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  Visa signé par {detailOrder.managerVisaName}
                  {detailOrder.managerVisaAt ? ` · ${formatDate(detailOrder.managerVisaAt)}` : ""}
                </p>
              )}
            </section>
            <div className="mt-4 overflow-x-auto rounded-xl border border-blue-100">
              <h3 className="bg-blue-50 px-4 py-3 text-sm font-semibold text-slate-900">
                Contrôle automatique des fonds OP · {detailOrder.currency}
              </h3>
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Source des fonds</th>
                    <th className="px-3 py-3 text-right">Approvisionné</th>
                    <th className="px-3 py-3 text-right">Solde dispo (1)</th>
                    <th className="px-3 py-3 text-right">Encours</th>
                    <th className="px-3 py-3 text-right">Solde dispo (2)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100 font-semibold text-slate-800">
                    <td className="px-3 py-3">Associé-Gérant</td>
                    <td className="px-3 py-3 text-right">{formatMoney(detailOrder.initialForecast, detailOrder.currency)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(detailOrder.availableBefore, detailOrder.currency)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(Number(detailOrder.outstanding) + Number(detailOrder.amount), detailOrder.currency)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(detailOrder.availableAfter, detailOrder.currency)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
                Calculé à partir des versements de l’Associé-Gérant et des OP actives. Les règlements clients ne sont pas inclus.
              </p>
            </div>
            {detailOrder.attachment && (
              <section className="mt-4 overflow-hidden rounded-xl border border-blue-200">
                <div className="flex items-center justify-between gap-3 bg-blue-50 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-blue-900">
                    <Pin className="h-4 w-4 shrink-0" />
                    <span className="truncate">État de besoin · {detailOrder.attachment.fileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openAttachment(detailOrder)}
                    className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-800 shadow-sm"
                  >
                    Télécharger
                  </button>
                </div>
                {attachmentPreviewLoading && (
                  <p role="status" className="p-4 text-sm text-slate-500">Chargement de la pièce jointe…</p>
                )}
                {attachmentPreview?.orderId === detailOrder.id && (
                  attachmentPreview.mimeType === "application/pdf" ? (
                    <iframe
                      title={`État de besoin ${attachmentPreview.fileName}`}
                      src={attachmentPreview.src}
                      className="h-[min(65vh,680px)] w-full bg-slate-100"
                    />
                  ) : (
                    <div className="relative mx-auto h-[min(65vh,680px)] w-full max-w-3xl">
                      <Image
                        src={attachmentPreview.src}
                        alt={`État de besoin ${attachmentPreview.fileName}`}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    </div>
                  )
                )}
                {!attachmentPreviewLoading && attachmentPreview?.orderId !== detailOrder.id && (
                  <p className="px-4 py-3 text-xs text-slate-500">
                    Téléchargez le fichier pour examiner cette pièce.
                  </p>
                )}
              </section>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => print(detailOrder)} className={actionClass}>
                <Printer className="h-3.5 w-3.5" />
                Imprimer l’OP
              </button>
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
              {user &&
                ["COMPANY_ADMIN", "MANAGING_PARTNER"].includes(user.role) &&
                ["SUBMITTED", "FINANCE_APPROVED"].includes(detailOrder.status) &&
                user.id !== detailOrder.createdBy && (
                  <>
                  <button
                    type="button"
                    onClick={() => void act(detailOrder, "manager-visa")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approuver et signer
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(detailOrder, "reject")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Rejeter
                  </button>
                  </>
                )}
              {user && ["COMPANY_ADMIN", "CASHIER", "SECRETARY"].includes(user.role) &&
                detailOrder.status === "APPROVED" && detailOrder.cashVoucher && (
                  <a href="/cash-vouchers" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    <Wallet className="h-3.5 w-3.5" />
                    Bon {detailOrder.cashVoucher.voucherNumber} · prêt au paiement
                  </a>
                )}
              {user && ["COMPANY_ADMIN", "CASHIER", "SECRETARY"].includes(user.role) &&
                detailOrder.status === "APPROVED" && !detailOrder.cashVoucher && (
                  <button
                    type="button"
                    onClick={() => void act(detailOrder, "pay")}
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
