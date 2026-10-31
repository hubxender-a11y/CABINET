"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWorkspaceStore, type WorkspacePayment } from "@/components/workspace-store";
import { formatMoney } from "@/lib/formatting";

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
  const payableInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.status !== "Rejetée" &&
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

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedInvoice) {
      setError("Sélectionnez une facture à régler.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Saisissez un montant valide supérieur à zéro.");
      return;
    }
    if (parsedAmount > remaining) {
      setError("Le montant dépasse le solde restant de cette facture.");
      return;
    }

    setSaving(true);
    try {
      await addPayment({
        invoice: selectedInvoice,
        amount,
        method,
        reference: reference.trim() || undefined,
      });
      setAmount("");
      setReference("");
      setSuccess("Règlement enregistré.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer le règlement.",
      );
    } finally {
      setSaving(false);
    }
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
          : "Mode démonstration : les règlements restent dans ce navigateur et ne sont pas partagés."}
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
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {new Date(payment.createdAt).toLocaleDateString("fr-FR")}
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
                    </tr>
                  ))}
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
    </div>
  );
}
