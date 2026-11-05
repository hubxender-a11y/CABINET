"use client";

import { Fragment, FormEvent, useMemo, useState } from "react";
import { ChevronDown, Printer, X } from "lucide-react";
import { useWorkspaceStore, type WorkspacePayment } from "@/components/workspace-store";
import {
  DocumentFooter,
  DocumentLetterhead,
  DocumentSignature,
} from "@/components/document-letterhead";
import { useCompanyProfile } from "@/components/company-profile";
import { useNotifications } from "@/components/notification-provider";
import { formatDate, formatMoney } from "@/lib/formatting";

const methodLabels: Record<WorkspacePayment["method"], string> = {
  CASH_USD: "Espèces (USD)",
  CASH_CDF: "Espèces (CDF)",
  BANK_TRANSFER: "Virement bancaire",
  CARD: "Carte bancaire",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Autre",
};

export default function PaymentsPage() {
  const { invoices, payments, addPayment, databaseConnected } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const { notify } = useNotifications();
  const [selectedReceipt, setSelectedReceipt] = useState<WorkspacePayment | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const payableInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.status !== "Rejetée" &&
          invoice.status !== "Brouillon" &&
          (invoice.paidAmount ?? (invoice.status === "Payée" ? invoice.amount : 0)) <
            invoice.amount,
      ),
    [invoices],
  );
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<WorkspacePayment["method"]>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedInvoice = payableInvoices.find(
    (invoice) => (invoice.databaseId ?? invoice.id) === invoiceId,
  );
  const paid = selectedInvoice?.paidAmount ?? 0;
  const remaining = selectedInvoice
    ? Math.max(selectedInvoice.amount - paid, 0)
    : 0;
  const availableMethods = Object.entries(methodLabels).filter(
    ([value]) =>
      value !== "CASH_CDF" ||
      !selectedInvoice ||
      selectedInvoice.currency === "CDF",
  ).filter(
    ([value]) =>
      value !== "CASH_USD" ||
      !selectedInvoice ||
      selectedInvoice.currency === "USD",
  );

  const receiptInvoice = selectedReceipt
    ? invoices.find(
        (invoice) => invoice.databaseId === selectedReceipt.invoiceId,
      )
    : undefined;
  const receiptInvoiceTotal =
    selectedReceipt?.invoiceTotal ?? receiptInvoice?.amount ?? null;
  const receiptPaidAfter = selectedReceipt?.invoicePaidAmountAfter ?? null;
  const receiptBalanceAfter =
    receiptInvoiceTotal !== null && receiptPaidAfter !== null
      ? Math.max(receiptInvoiceTotal - receiptPaidAfter, 0)
      : null;
  const receiptCurrentBalance =
    receiptInvoice && receiptInvoiceTotal !== null
      ? Math.max(
          receiptInvoiceTotal - (receiptInvoice.paidAmount ?? 0),
          0,
        )
      : null;

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    function rejectPayment(reason: string) {
      setError(reason);
      notify({ type: "error", title: "Règlement non enregistré", message: reason });
    }

    if (!selectedInvoice) {
      rejectPayment("Sélectionnez une facture à régler.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      rejectPayment("Saisissez un montant valide supérieur à zéro.");
      return;
    }
    if (parsedAmount > remaining) {
      rejectPayment("Le montant dépasse le solde restant de cette facture.");
      return;
    }

    setSaving(true);
    try {
      const savedPayment = await addPayment({
        invoice: selectedInvoice,
        amount,
        method,
        reference: reference.trim() || undefined,
      });
      setSelectedReceipt(savedPayment);
      setAmount("");
      setReference("");
      setSuccess("Règlement enregistré. Le reçu est prêt à être imprimé.");
      notify({
        type: "success",
        title: "Règlement enregistré",
        message: "Le paiement est sauvegardé et son reçu est prêt à être imprimé.",
      });
    } catch (caught) {
      const reason =
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer le règlement.";
      setError(reason);
      notify({ type: "error", title: "Règlement non enregistré", message: reason });
    } finally {
      setSaving(false);
    }
  }

  function printReceipt() {
    if (!selectedReceipt) return;
    const cleanup = () => {
      document.body.classList.remove("print-payment-receipt-mode");
      window.removeEventListener("afterprint", cleanup);
    };
    document.body.classList.add("print-payment-receipt-mode");
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          Trésorerie du cabinet
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Caisse & règlements
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enregistrez les honoraires reçus et rapprochez chaque règlement avec sa facture.
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
          ? "Les règlements sont enregistrés dans PostgreSQL."
          : "Base de données indisponible : les règlements ne peuvent pas être enregistrés."}
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={submitPayment}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nouveau règlement</h2>
            <p className="mt-1 text-sm text-slate-500">
              Le montant est contrôlé par rapport au solde de la facture.
            </p>
          </div>

          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Facture concernée
            <select
              required
              value={invoiceId}
              onChange={(event) => {
                setInvoiceId(event.target.value);
                setAmount("");
                const nextInvoice = payableInvoices.find(
                  (invoice) => (invoice.databaseId ?? invoice.id) === event.target.value,
                );
                if (
                  (method === "CASH_CDF" && nextInvoice?.currency !== "CDF") ||
                  (method === "CASH_USD" && nextInvoice?.currency !== "USD")
                ) {
                  setMethod("BANK_TRANSFER");
                }
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            >
              <option value="">Choisir une facture</option>
              {payableInvoices.map((invoice) => (
                <option
                  key={invoice.databaseId ?? invoice.id}
                  value={invoice.databaseId ?? invoice.id}
                  disabled={databaseConnected && !invoice.databaseId}
                >
                  {invoice.id} · {invoice.client} · {formatMoney(invoice.amount, invoice.currency)}
                </option>
              ))}
            </select>
          </label>

          {selectedInvoice && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-3 text-slate-600">
                <span>Déjà reçu</span>
                <span>{formatMoney(paid, selectedInvoice.currency)}</span>
              </div>
              <div className="mt-1 flex justify-between gap-3 font-semibold text-slate-900">
                <span>Solde à payer</span>
                <span>{formatMoney(remaining, selectedInvoice.currency)}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            L’enregistrement d’un règlement ne certifie pas la facture auprès de l’administration fiscale.
          </p>

          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Montant reçu
            <input
              required
              type="number"
              min="0.01"
              max={remaining || undefined}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="Ex. 250000"
            />
          </label>

          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Moyen de paiement
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as WorkspacePayment["method"])}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            >
              {availableMethods.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Référence (facultatif)
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="N° de transaction, bordereau…"
            />
          </label>

          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}

          <button
            type="submit"
            disabled={saving || !payableInvoices.length}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer le règlement"}
          </button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Derniers règlements</h2>
            <p className="mt-1 text-sm text-slate-500">{payments.length} mouvement(s) enregistré(s)</p>
          </div>
          {payments.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Client / facture</th>
                    <th className="px-4 py-3 font-medium">Mode</th>
                    <th className="px-4 py-3 text-right font-medium">Montant</th>
                    <th className="px-4 py-3 text-center font-medium">Détails</th>
                    <th className="px-4 py-3 text-right font-medium">Reçu</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const isExpanded = expandedPaymentId === payment.id;
                    const linkedInvoice = invoices.find(
                      (invoice) => invoice.databaseId === payment.invoiceId,
                    );
                    const invoiceTotal =
                      payment.invoiceTotal ?? linkedInvoice?.amount;
                    const currentBalance =
                      invoiceTotal !== undefined
                        ? Math.max(invoiceTotal - (linkedInvoice?.paidAmount ?? 0), 0)
                        : null;
                    const historicalBalance =
                      invoiceTotal !== undefined &&
                      payment.invoicePaidAmountAfter !== null &&
                      payment.invoicePaidAmountAfter !== undefined
                        ? Math.max(invoiceTotal - payment.invoicePaidAmountAfter, 0)
                        : null;

                    return (
                      <Fragment key={payment.id}>
                        <tr className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {formatDate(payment.createdAt, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{payment.customer}</p>
                            <p className="text-xs text-slate-500">{payment.invoiceNumber}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {methodLabels[payment.method]}
                            {payment.reference && <span className="block text-xs text-slate-400">{payment.reference}</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                            {formatMoney(Number(payment.amount), payment.currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={`payment-details-${payment.id}`}
                              onClick={() =>
                                setExpandedPaymentId(isExpanded ? null : payment.id)
                              }
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              {isExpanded ? "Fermer" : "Ouvrir"}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(payment)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              aria-label={`Afficher le reçu du paiement ${payment.invoiceNumber}`}
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Imprimer
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr id={`payment-details-${payment.id}`} className="border-t border-slate-100 bg-slate-50/80">
                            <td colSpan={6} className="px-4 py-4">
                              <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <dt className="text-xs text-slate-500">Identifiant du règlement</dt>
                                  <dd className="mt-1 break-all font-medium text-slate-800">{payment.id}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-slate-500">Statut</dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {payment.status === "RECEIVED"
                                      ? "Reçu et enregistré"
                                      : payment.status || "À vérifier"}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-slate-500">Référence</dt>
                                  <dd className="mt-1 font-medium text-slate-800">{payment.reference || "Non renseignée"}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-slate-500">Montant de la facture</dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {invoiceTotal === undefined
                                      ? "Indisponible"
                                      : formatMoney(invoiceTotal, payment.currency)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-slate-500">Cumul réglé après ce paiement</dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {payment.invoicePaidAmountAfter == null
                                      ? "Non conservé pour cet ancien règlement"
                                      : formatMoney(payment.invoicePaidAmountAfter, payment.currency)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-slate-500">
                                    {historicalBalance === null ? "Solde actuel" : "Solde après ce paiement"}
                                  </dt>
                                  <dd className="mt-1 font-semibold text-amber-800">
                                    {historicalBalance !== null
                                      ? formatMoney(historicalBalance, payment.currency)
                                      : currentBalance === null
                                        ? "Indisponible"
                                        : formatMoney(currentBalance, payment.currency)}
                                  </dd>
                                </div>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Aucun règlement enregistré pour le moment.
            </p>
          )}
        </section>
      </section>

      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-receipt-title"
        >
          <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-slate-100 p-3 shadow-2xl sm:p-6">
            <div className="screen-only mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">Aperçu du reçu de règlement</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={printReceipt}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Printer className="h-4 w-4" /> Imprimer le reçu
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  aria-label="Fermer l’aperçu du reçu"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <article className="payment-receipt-print space-y-5 border border-slate-300 bg-white p-6 text-slate-900 shadow-sm sm:p-10">
              <DocumentLetterhead />
              <header className="border-y-2 border-slate-900 py-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Reçu de règlement
                </p>
                <h2
                  id="payment-receipt-title"
                  className="mt-2 text-2xl font-bold uppercase"
                >
                  Paiement reçu
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Reçu interne N°{" "}
                  {selectedReceipt.id.replaceAll("-", "").slice(0, 12).toUpperCase()}
                </p>
              </header>

              <section className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="space-y-2">
                  <p>
                    <span className="font-semibold">Client :</span>{" "}
                    {selectedReceipt.customer}
                  </p>
                  <p>
                    <span className="font-semibold">Facture :</span>{" "}
                    {selectedReceipt.invoiceNumber}
                  </p>
                  <p>
                    <span className="font-semibold">Date du règlement :</span>{" "}
                    {formatDate(selectedReceipt.createdAt, {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <p>
                    <span className="font-semibold">Mode de paiement :</span>{" "}
                    {methodLabels[selectedReceipt.method]}
                  </p>
                  <p>
                    <span className="font-semibold">Référence :</span>{" "}
                    {selectedReceipt.reference || "Non renseignée"}
                  </p>
                  <p>
                    <span className="font-semibold">Statut :</span>{" "}
                    {selectedReceipt.status === "RECEIVED"
                      ? "Reçu et enregistré"
                      : selectedReceipt.status || "À vérifier"}
                  </p>
                </div>
              </section>

              <section className="overflow-hidden border border-slate-400">
                <div className="grid grid-cols-[1fr_auto] border-b border-slate-300 px-4 py-3 text-sm">
                  <span>Montant de cette tranche reçue</span>
                  <strong>{formatMoney(Number(selectedReceipt.amount), selectedReceipt.currency)}</strong>
                </div>
                {receiptInvoiceTotal !== null && (
                  <div className="grid grid-cols-[1fr_auto] border-b border-slate-300 px-4 py-3 text-sm">
                    <span>Montant total de la facture</span>
                    <strong>{formatMoney(receiptInvoiceTotal, selectedReceipt.currency)}</strong>
                  </div>
                )}
                {receiptPaidAfter !== null && receiptBalanceAfter !== null ? (
                  <>
                    <div className="grid grid-cols-[1fr_auto] border-b border-slate-300 px-4 py-3 text-sm">
                      <span>Total cumulé reçu après ce règlement</span>
                      <strong>{formatMoney(receiptPaidAfter, selectedReceipt.currency)}</strong>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] bg-slate-50 px-4 py-3 text-sm">
                      <span>Solde après ce règlement</span>
                      <strong>{formatMoney(receiptBalanceAfter, selectedReceipt.currency)}</strong>
                    </div>
                  </>
                ) : receiptCurrentBalance !== null ? (
                  <div className="grid grid-cols-[1fr_auto] bg-slate-50 px-4 py-3 text-sm">
                    <span>Solde actuel de la facture</span>
                    <strong>{formatMoney(receiptCurrentBalance, selectedReceipt.currency)}</strong>
                  </div>
                ) : null}
              </section>

              <p className="border border-slate-300 p-3 text-xs leading-5 text-slate-600">
                Ce reçu confirme l’enregistrement du montant indiqué. Il ne
                remplace pas la facture et ne vaut pas certification fiscale.
              </p>

              <div className="flex justify-end">
                <DocumentSignature />
              </div>
              <DocumentFooter />
              <p className="text-center text-[10px] text-slate-400">
                {profile?.legalName || "Document généré par FACTURA RDC"}
              </p>
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
