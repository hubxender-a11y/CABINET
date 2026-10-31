"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, Printer, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { DocumentFooter, DocumentLetterhead } from "@/components/document-letterhead";
import { useCompanyProfile } from "@/components/company-profile";
import { formatMoney } from "@/lib/formatting";

type InvoiceItemInput = {
  id: string;
  rubric: string;
  quantity: number;
  unitPrice: number;
};

const localDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const displayDate = (date: string) =>
  date
    ? new Intl.DateTimeFormat("fr-CD", {
        dateStyle: "long",
        timeZone: "Africa/Kinshasa",
      }).format(
        new Date(`${date}T12:00:00`),
      )
    : "________________";

export default function InvoicesPage() {
  const { clients, addInvoice } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState("");
  const [concern, setConcern] = useState("");
  const [madeAt, setMadeAt] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [currency, setCurrency] = useState<"CDF" | "USD">("CDF");
  const currencyWasChanged = useRef(false);
  const locationWasChanged = useRef(false);
  const [items, setItems] = useState<InvoiceItemInput[]>([
    { id: "initial-line", rubric: "", quantity: 1, unitPrice: 0 },
  ]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedInvoiceNumber, setSavedInvoiceNumber] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setInvoiceDate(localDate()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!currencyWasChanged.current) setCurrency(profile.currencyCode);
    if (!locationWasChanged.current) {
      setMadeAt(profile.city || profile.commune || "Kinshasa");
    }
  }, [profile]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items],
  );

  function updateItem(id: string, changes: Partial<InvoiceItemInput>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
    setMessage("");
  }

  async function saveInvoice(status: "Brouillon" | "En attente") {
    setError("");
    setMessage("");

    if (!selectedClient) {
      setError("Sélectionnez le client de la facture.");
      return;
    }
    if (!period.trim() || !concern.trim()) {
      setError("Renseignez la période et le champ « Concerne ».");
      return;
    }
    if (!madeAt.trim() || !invoiceDate) {
      setError("Renseignez le lieu et la date de la facture.");
      return;
    }
    if (
      items.some(
        (item) =>
          !item.rubric.trim() ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice < 0,
      )
    ) {
      setError("Chaque rubrique doit avoir un nombre entier positif et un prix unitaire valide.");
      return;
    }
    if (total <= 0 || !Number.isFinite(total)) {
      setError("Le total général doit être supérieur à zéro.");
      return;
    }

    const now = new Date();
    const invoiceNumber = `FAC-${now.getFullYear()}-${Date.now()}`;
    try {
      const saved = await addInvoice({
        id: invoiceNumber,
        clientId: selectedClient.id,
        client: selectedClient.name,
        amount: total,
        currency,
        status,
        date: invoiceDate,
        period: period.trim(),
        concern: concern.trim(),
        madeAt: madeAt.trim(),
        items: items.map((item) => ({
          rubric: item.rubric.trim(),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      });
      setSavedInvoiceNumber(saved.id);
      setMessage(
        status === "Brouillon"
          ? `Le brouillon ${saved.id} a été enregistré.`
          : `La facture ${saved.id} est en attente. Aucun dispositif fiscal n'est connecté : elle n'est pas certifiée.`,
      );
    } catch (requestError) {
      console.error("Enregistrement de la facture impossible.", requestError);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d'enregistrer cette facture.",
      );
    }
  }

  return (
    <div className="invoice-page-shell space-y-6">
      <header className="screen-only flex flex-col gap-3 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
            Facturation du cabinet
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Facture d’honoraires
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Indiquez d’abord la période et l’objet de la facture, puis détaillez les rubriques.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Retour au tableau de bord
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="screen-only space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Client
              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setMessage("");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Choisir un client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} — {client.sector}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Période
              <input
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder="Ex. Octobre 2026 ou du 01/10 au 31/10/2026"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              Concerne
              <input
                value={concern}
                onChange={(event) => setConcern(event.target.value)}
                placeholder="Ex. Prestations comptables et fiscales"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Fait à
              <input
                value={madeAt}
                onChange={(event) => {
                  locationWasChanged.current = true;
                  setMadeAt(event.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Le
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Devise
              <select
                value={currency}
                onChange={(event) => {
                  currencyWasChanged.current = true;
                  setCurrency(event.target.value as "CDF" | "USD");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="CDF">CDF</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Détail de la facture</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Le prix total de chaque ligne est calculé automatiquement.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    { id: crypto.randomUUID(), rubric: "", quantity: 1, unitPrice: 0 },
                  ])
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                <Plus className="h-4 w-4" /> Ajouter une rubrique
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[auto_1.7fr_0.7fr_1fr_1fr_auto] sm:items-end"
                >
                  <span className="pb-2 text-sm font-semibold text-slate-500">{index + 1}.</span>
                  <label className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                    Rubrique
                    <input
                      value={item.rubric}
                      onChange={(event) => updateItem(item.id, { rubric: event.target.value })}
                      placeholder="Ex. Tenue comptable"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                    Nombre
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.id, { quantity: Number(event.target.value) })
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                    Prix unitaire
                    <input
                      type="number"
                      min="0"
                      step={currency === "USD" ? "0.01" : "1"}
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(item.id, { unitPrice: Number(event.target.value) })
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal tracking-normal text-slate-900"
                    />
                  </label>
                  <div className="pb-2 text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                    Prix total
                    <p className="mt-2 text-sm font-semibold tracking-normal text-slate-900">
                      {formatMoney(item.quantity * item.unitPrice, currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Supprimer la rubrique ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) => current.filter((row) => row.id !== item.id))
                    }
                    className="self-end rounded-lg p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => saveInvoice("Brouillon")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Enregistrer brouillon
            </button>
            <button
              type="button"
              onClick={() => saveInvoice("En attente")}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Enregistrer pour transmission
            </button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            L’enregistrement ne vaut pas certification fiscale. La facture reste un document interne tant qu’aucune réponse officielle n’a été reçue.
          </p>
        </section>

        <section className="invoice-document h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <DocumentLetterhead />
          <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div>
              <h2 className="mt-3 text-2xl font-bold uppercase tracking-wide text-slate-900">
                Facture
              </h2>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Facture N°</p>
              <p className="mt-1 font-semibold text-slate-900">
                {savedInvoiceNumber || "À attribuer"}
              </p>
              <p className="mt-3 text-sm text-slate-700">
                Fait à {madeAt || "________"}, le {displayDate(invoiceDate)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 py-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Client</p>
              <p className="mt-1 font-semibold text-slate-900">{selectedClient?.name || "À renseigner"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Période</p>
              <p className="mt-1 font-medium text-slate-900">{period || "À renseigner"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Concerne</p>
              <p className="mt-1 font-medium text-slate-900">{concern || "À renseigner"}</p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                  <th className="w-10 px-2 py-3 text-center">N°</th>
                  <th className="px-2 py-3">Rubrique</th>
                  <th className="px-2 py-3 text-right">Nombre</th>
                  <th className="px-2 py-3 text-right">Prix unitaire</th>
                  <th className="px-2 py-3 text-right">Prix total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-b border-slate-200 align-top">
                    <td className="px-2 py-3 text-center text-slate-500">{index + 1}</td>
                    <td className="px-2 py-3 font-medium text-slate-800">{item.rubric || "—"}</td>
                    <td className="px-2 py-3 text-right text-slate-700">{item.quantity}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right text-slate-700">{formatMoney(item.unitPrice, currency)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium text-slate-900">{formatMoney(item.quantity * item.unitPrice, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-end">
            <div className="flex min-w-64 items-center justify-between gap-6 border-t-2 border-slate-900 pt-3">
              <span className="font-semibold uppercase tracking-wide text-slate-900">Total général</span>
              <span className="text-lg font-bold text-slate-900">{formatMoney(total, currency)}</span>
            </div>
          </div>
          <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Document interne du cabinet. Ne constitue pas une facture normalisée certifiée.
          </p>
          <DocumentFooter />
        </section>
      </div>
    </div>
  );
}
