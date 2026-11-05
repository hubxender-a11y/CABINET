"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  FileText,
  Paintbrush,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import {
  useWorkspaceStore,
  type WorkspaceInvoice,
} from "@/components/workspace-store";
import {
  DocumentFooter,
  DocumentLetterhead,
  DocumentSignature,
} from "@/components/document-letterhead";
import {
  companyDisplayName,
  useCompanyProfile,
} from "@/components/company-profile";
import { useNotifications } from "@/components/notification-provider";
import {
  defaultInvoiceTemplate,
  invoiceTemplateDraftStorageKey,
  normalizeInvoiceTemplate,
  type InvoiceTemplateConfiguration,
  type InvoiceTemplateElement,
} from "@/lib/invoice-template";
import { formatMoney } from "@/lib/formatting";
import { downloadInvoiceWord } from "@/lib/invoice-word-export";
import { QRCodeSVG } from "qrcode.react";

type InvoiceItemInput = {
  id: string;
  rubric: string;
  quantity: number;
  unitPrice: number;
};

type InvoiceView = "list" | "create" | "detail";
type InvoiceFilter = "Toutes" | WorkspaceInvoice["status"];

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
      }).format(new Date(`${date}T12:00:00`))
    : "________________";

const invoiceStatusStyles: Record<WorkspaceInvoice["status"], string> = {
  Brouillon: "border-slate-200 bg-slate-50 text-slate-600",
  "En attente": "border-amber-200 bg-amber-50 text-amber-800",
  Certifiée: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Payée: "border-sky-200 bg-sky-50 text-sky-800",
  Rejetée: "border-rose-200 bg-rose-50 text-rose-800",
};

const frenchUnits = [
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
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];

function frenchNumberUnderHundred(value: number): string {
  if (value < frenchUnits.length) return frenchUnits[value];
  if (value < 20) return `dix-${frenchUnits[value - 10]}`;

  const tens = Math.floor(value / 10);
  const remainder = value % 10;
  if (tens === 7) {
    return remainder === 1
      ? "soixante et onze"
      : `soixante-${frenchNumberUnderHundred(10 + remainder)}`;
  }
  if (tens === 8) {
    return remainder === 0
      ? "quatre-vingts"
      : `quatre-vingt-${frenchNumberUnderHundred(remainder)}`;
  }
  if (tens === 9) {
    return `quatre-vingt-${frenchNumberUnderHundred(10 + remainder)}`;
  }

  const tensWords = [
    "",
    "",
    "vingt",
    "trente",
    "quarante",
    "cinquante",
    "soixante",
  ];
  return remainder === 0
    ? tensWords[tens]
    : `${tensWords[tens]}${remainder === 1 ? " et " : "-"}${frenchUnits[remainder]}`;
}

function frenchNumberInWords(value: number): string {
  if (value < 100) return frenchNumberUnderHundred(value);
  if (value < 1_000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    const prefix = hundreds === 1 ? "cent" : `${frenchUnits[hundreds]} cent`;
    return remainder
      ? `${prefix} ${frenchNumberUnderHundred(remainder)}`
      : hundreds === 1
        ? prefix
        : `${prefix}s`;
  }
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1_000);
    const remainder = value % 1_000;
    const prefix =
      thousands === 1 ? "mille" : `${frenchNumberInWords(thousands)} mille`;
    return remainder ? `${prefix} ${frenchNumberInWords(remainder)}` : prefix;
  }
  if (value < 1_000_000_000) {
    const millions = Math.floor(value / 1_000_000);
    const remainder = value % 1_000_000;
    const prefix = `${frenchNumberInWords(millions)} million${millions > 1 ? "s" : ""}`;
    return remainder ? `${prefix} ${frenchNumberInWords(remainder)}` : prefix;
  }

  const billions = Math.floor(value / 1_000_000_000);
  const remainder = value % 1_000_000_000;
  const prefix = `${frenchNumberInWords(billions)} milliard${billions > 1 ? "s" : ""}`;
  return remainder ? `${prefix} ${frenchNumberInWords(remainder)}` : prefix;
}

function amountInWords(amount: number, currency: "CDF" | "USD") {
  if (!Number.isFinite(amount)) return "MONTANT EN LETTRES INDISPONIBLE";
  const fractionDigits = currency === "USD" ? 2 : 0;
  const scaledAmount = Math.round(Math.abs(amount) * 10 ** fractionDigits);
  const wholeAmount = Math.floor(scaledAmount / 10 ** fractionDigits);
  const fractionAmount = scaledAmount % 10 ** fractionDigits;
  const currencyName =
    currency === "USD" ? "dollars américains" : "francs congolais";
  const fractionWords =
    fractionAmount > 0
      ? ` et ${frenchNumberInWords(fractionAmount)} centime${fractionAmount > 1 ? "s" : ""}`
      : "";

  return `${currencyName} ${frenchNumberInWords(wholeAmount)}${fractionWords}`.toLocaleUpperCase(
    "fr",
  );
}

function templateObjectStyle(
  template: InvoiceTemplateConfiguration,
  id: string,
): CSSProperties {
  const element = template.elements.find((item) => item.id === id);
  const base = defaultInvoiceTemplate.elements.find((item) => item.id === id);
  if (!element || !base) return {};

  const scaleX = element.width / base.width;
  const scaleY = element.height / base.height;
  return {
    display: element.visible ? undefined : "none",
    color: element.color,
    fontSize: `${element.fontSize}pt`,
    zIndex: template.elements.indexOf(element) + 1,
    backgroundColor:
      element.fill !== "transparent" && element.fill !== "#ffffff"
        ? element.fill
        : undefined,
    transform: `translate(${element.x - base.x}mm, ${element.y - base.y}mm) scale(${scaleX}, ${scaleY})`,
    transformOrigin: "top left",
  };
}

function templateText(
  template: InvoiceTemplateConfiguration,
  id: string,
  fallback: string,
  values: Record<string, string>,
) {
  const content = template.elements.find((item) => item.id === id)?.content;
  if (!content) return fallback;
  return content.replace(
    /\{\{([a-z]+)\}\}/gi,
    (token, key: string) => values[key.toLocaleLowerCase("fr")] ?? token,
  );
}

function templateElement(
  template: InvoiceTemplateConfiguration,
  id: string,
): InvoiceTemplateElement | undefined {
  return template.elements.find((element) => element.id === id);
}

function invoiceDateLabel(date: string) {
  if (!date) return "Date à préciser";
  const parsedDate = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-CD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Kinshasa",
  }).format(parsedDate);
}

export default function InvoicesPage() {
  const { clients, invoices, addInvoice, deleteInvoice } = useWorkspaceStore();
  const { profile } = useCompanyProfile();
  const [invoiceTemplateDraft, setInvoiceTemplateDraft] =
    useState<InvoiceTemplateConfiguration | null>(null);
  const invoiceTemplate =
    invoiceTemplateDraft ?? normalizeInvoiceTemplate(profile?.invoiceTemplate);
  const companyName = companyDisplayName(profile);
  const usesDefaultBrand =
    !profile || /transparency|factura rdc/i.test(companyName);
  const { notify } = useNotifications();
  const [view, setView] = useState<InvoiceView>("list");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceFilter>("Toutes");
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState("");
  const [prestation, setPrestation] = useState("");
  const [madeAt, setMadeAt] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState<"CDF" | "USD">("CDF");
  const currencyWasChanged = useRef(false);
  const locationWasChanged = useRef(false);
  const [items, setItems] = useState<InvoiceItemInput[]>([
    { id: "initial-line", rubric: "", quantity: 1, unitPrice: 0 },
  ]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedInvoiceNumber, setSavedInvoiceNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportingInvoiceId, setExportingInvoiceId] = useState<string | null>(
    null,
  );
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(
    null,
  );
  const invoiceDocumentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!profile) {
        setInvoiceTemplateDraft(null);
        return;
      }

      const draftKey = invoiceTemplateDraftStorageKey(profile.id);
      const savedDraft = window.localStorage.getItem(draftKey);
      if (!savedDraft) {
        setInvoiceTemplateDraft(null);
        return;
      }

      try {
        setInvoiceTemplateDraft(
          normalizeInvoiceTemplate(JSON.parse(savedDraft)),
        );
      } catch (draftError) {
        console.error(
          "Lecture de la copie locale du modèle impossible.",
          draftError,
        );
        window.localStorage.removeItem(draftKey);
        setInvoiceTemplateDraft(null);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [profile]);

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
  const selectedInvoice = invoices.find(
    (invoice) => invoice.id === selectedInvoiceId,
  );
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items],
  );
  const visibleInvoices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return invoices
      .filter((invoice) => {
        const matchesStatus =
          statusFilter === "Toutes" || invoice.status === statusFilter;
        const matchesSearch =
          !query ||
          `${invoice.id} ${invoice.client} ${invoice.period ?? ""} ${invoice.concern ?? ""}`
            .toLocaleLowerCase("fr")
            .includes(query);
        return matchesStatus && matchesSearch;
      })
      .sort((first, second) => second.date.localeCompare(first.date));
  }, [invoices, search, statusFilter]);
  const invoiceCounts = useMemo(
    () => ({
      total: invoices.length,
      drafts: invoices.filter((invoice) => invoice.status === "Brouillon")
        .length,
      pending: invoices.filter((invoice) => invoice.status === "En attente")
        .length,
      paid: invoices.filter((invoice) => invoice.status === "Payée").length,
    }),
    [invoices],
  );
  const totalsByCurrency = useMemo(
    () =>
      invoices.reduce(
        (totals, invoice) => {
          if (invoice.status === "Rejetée" || invoice.status === "Brouillon")
            return totals;
          const paid =
            invoice.paidAmount ??
            (invoice.status === "Payée" ? invoice.amount : 0);
          totals.issued[invoice.currency] += invoice.amount;
          totals.remaining[invoice.currency] += Math.max(
            invoice.amount - paid,
            0,
          );
          return totals;
        },
        {
          issued: { CDF: 0, USD: 0 },
          remaining: { CDF: 0, USD: 0 },
        },
      ),
    [invoices],
  );
  const documentItems = selectedInvoice ? (selectedInvoice.items ?? []) : items;
  const documentClient = selectedInvoice?.client ?? selectedClient?.name;
  const documentCurrency = selectedInvoice?.currency ?? currency;
  const documentTotal = selectedInvoice?.amount ?? total;
  const documentDate = selectedInvoice?.date ?? invoiceDate;
  const documentDueDate = selectedInvoice?.dueDate ?? dueDate;
  const documentExchangeRate = selectedInvoice
    ? selectedInvoice.exchangeRate
    : profile?.exchangeRateCdfPerUsd;
  const documentNumber = selectedInvoice?.id ?? savedInvoiceNumber;
  const documentMadeAt = selectedInvoice?.madeAt ?? madeAt;
  const documentStatus = selectedInvoice?.status;
  const templateValues = {
    numero: documentNumber || "À attribuer",
    client: documentClient || "À renseigner",
    periode: selectedInvoice?.period || period || "À renseigner",
    concerne: selectedInvoice?.concern || prestation || "À renseigner",
    prestation: selectedInvoice?.concern || prestation || "À renseigner",
    date: displayDate(documentDate),
    lieu: documentMadeAt || "Kinshasa",
    total: formatMoney(documentTotal, documentCurrency),
    entreprise: companyName,
    adresse: profile?.address ?? "",
    telephone: profile?.phone ?? "",
    email: profile?.email ?? "",
    rccm: profile?.rccm ?? "",
    nif: profile?.nif ?? "",
  };
  const equivalentAmount =
    documentExchangeRate && Number(documentExchangeRate) > 0
      ? documentCurrency === "CDF"
        ? documentTotal / Number(documentExchangeRate)
        : documentTotal * Number(documentExchangeRate)
      : null;
  const equivalentCurrency = documentCurrency === "CDF" ? "USD" : "CDF";
  const invoiceQrValue = JSON.stringify({
    application: "FACTURA RDC",
    invoiceId: selectedInvoice?.databaseId,
    number: documentNumber || null,
    client: documentClient || null,
    amount: documentTotal,
    currency: documentCurrency,
    issueDate: documentDate || null,
  });

  function startNewInvoice() {
    setSelectedInvoiceId("");
    setSavedInvoiceNumber("");
    setClientId("");
    setPeriod("");
    setPrestation("");
    setMadeAt(profile?.city || profile?.commune || "Kinshasa");
    setInvoiceDate(localDate());
    setDueDate("");
    setCurrency(profile?.currencyCode ?? "CDF");
    currencyWasChanged.current = false;
    locationWasChanged.current = false;
    setItems([
      { id: crypto.randomUUID(), rubric: "", quantity: 1, unitPrice: 0 },
    ]);
    setMessage("");
    setError("");
    setView("create");
  }

  function openInvoice(invoice: WorkspaceInvoice) {
    setSelectedInvoiceId(invoice.id);
    setSavedInvoiceNumber(invoice.id);
    setView("detail");
  }

  async function removeInvoice(invoice: WorkspaceInvoice) {
    const confirmed = window.confirm(
      `Supprimer définitivement la facture ${invoice.id} ? Cette action supprimera aussi ses règlements, allocations, notes de crédit et traces fiscales. Elle est irréversible.`,
    );
    if (!confirmed) return;

    setDeletingInvoiceId(invoice.id);
    try {
      await deleteInvoice(invoice);
      if (selectedInvoiceId === invoice.id) {
        setSelectedInvoiceId("");
        setView("list");
      }
      notify({
        type: "success",
        title: "Facture supprimée",
        message: `La facture ${invoice.id} et ses éléments liés ont été supprimés.`,
      });
    } catch (requestError) {
      console.error(
        "Suppression définitive de la facture impossible.",
        requestError,
      );
      notify({
        type: "error",
        title: "Facture non supprimée",
        message:
          requestError instanceof Error
            ? requestError.message
            : "Impossible de supprimer cette facture.",
      });
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  async function exportInvoiceWord(invoiceId: string) {
    if (!invoiceDocumentRef.current) {
      notify({
        type: "error",
        title: "Export Word impossible",
        message: "La facture affichée est introuvable.",
      });
      return;
    }

    setExportingInvoiceId(invoiceId);
    try {
      await downloadInvoiceWord(invoiceId, invoiceDocumentRef.current);
      notify({
        type: "success",
        title: "Export Word terminé",
        message: `La facture ${invoiceId} a été téléchargée au format Word.`,
      });
    } catch (exportError) {
      console.error("Export Word de la facture impossible.", exportError);
      notify({
        type: "error",
        title: "Export Word impossible",
        message:
          exportError instanceof Error
            ? exportError.message
            : "Le fichier Word de la facture n’a pas pu être créé.",
      });
    } finally {
      setExportingInvoiceId(null);
    }
  }

  function updateItem(id: string, changes: Partial<InvoiceItemInput>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
    setMessage("");
  }

  async function saveInvoice(status: "Brouillon" | "En attente") {
    setError("");
    setMessage("");

    function rejectSave(reason: string) {
      setError(reason);
      notify({
        type: "error",
        title: "Facture non enregistrée",
        message: reason,
      });
    }

    if (!selectedClient) {
      rejectSave("Sélectionnez le client de la facture.");
      return;
    }
    if (!period.trim() || !prestation.trim()) {
      rejectSave("Renseignez la période et le champ « Concerne ».");
      return;
    }
    if (!madeAt.trim() || !invoiceDate) {
      rejectSave("Renseignez le lieu et la date de la facture.");
      return;
    }
    if (dueDate && dueDate < invoiceDate) {
      rejectSave("La date d’échéance ne peut pas précéder la date de facture.");
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
      rejectSave(
        "Chaque rubrique doit avoir un nombre entier positif et un prix unitaire valide.",
      );
      return;
    }
    if (total <= 0 || !Number.isFinite(total)) {
      rejectSave("Le total général doit être supérieur à zéro.");
      return;
    }

    setSaving(true);
    try {
      const saved = await addInvoice({
        id: "",
        clientId: selectedClient.id,
        client: selectedClient.name,
        amount: total,
        currency,
        status,
        date: invoiceDate,
        dueDate: dueDate || null,
        period: period.trim(),
        concern: prestation.trim(),
        madeAt: madeAt.trim(),
        items: items.map((item) => ({
          rubric: item.rubric.trim(),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      });
      setSavedInvoiceNumber(saved.id);
      setSelectedInvoiceId(saved.id);
      setView("detail");
      const savedMessage =
        status === "Brouillon"
          ? `Le brouillon ${saved.id} a été enregistré.`
          : `La facture ${saved.id} est en attente. Aucun dispositif fiscal n'est connecté : elle n'est pas certifiée.`;
      setMessage(savedMessage);
      notify({
        type: "success",
        title:
          status === "Brouillon"
            ? "Brouillon enregistré"
            : "Facture enregistrée",
        message: savedMessage,
      });
    } catch (requestError) {
      console.error("Enregistrement de la facture impossible.", requestError);
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible d'enregistrer cette facture.";
      setError(reason);
      notify({
        type: "error",
        title: "Facture non enregistrée",
        message: reason,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="invoice-page-shell space-y-6">
      <header className="screen-only invoice-admin-header">
        <div className="min-w-0">
          <div className="invoice-admin-eyebrow">
            <FileText className="h-4 w-4" />
            Gestion administrative · Honoraires
          </div>
          <h1 className="invoice-admin-title">
            {view === "list"
              ? "Facturation du cabinet"
              : view === "create"
                ? "Nouvelle facture"
                : "Détail de la facture"}
          </h1>
          <p className="invoice-admin-description">
            {view === "list"
              ? "Centralisez vos honoraires, suivez les règlements et gardez une trace de chaque dossier."
              : view === "create"
                ? "Renseignez les informations administratives et vérifiez le document avant son enregistrement."
                : "Consultez la facture et téléchargez-la au format Word."}
          </p>
        </div>
        <div className="invoice-admin-actions">
          {view !== "list" && (
            <button
              type="button"
              onClick={() => setView("list")}
              className="invoice-secondary-button"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au registre
            </button>
          )}
          {view === "list" && (
            <Link href="/" className="invoice-secondary-button">
              Tableau de bord
            </Link>
          )}
          {(view === "detail" || view === "create") && (
            <button
              type="button"
              onClick={() =>
                void exportInvoiceWord(documentNumber || "Facture-provisoire")
              }
              disabled={exportingInvoiceId !== null}
              className="invoice-secondary-button"
            >
              <FileText className="h-4 w-4" />
              {exportingInvoiceId !== null
                ? "Préparation Word…"
                : "Télécharger Word"}
            </button>
          )}
          {view === "create" && (
            <>
              <a href="#invoice-preview" className="invoice-secondary-button">
                <Eye className="h-4 w-4" />
                Voir l’aperçu
              </a>
              <Link
                href="/settings/invoice-template"
                className="invoice-secondary-button"
              >
                <Paintbrush className="h-4 w-4" />
                Modèle de facture
              </Link>
            </>
          )}
          {view !== "create" && (
            <button
              type="button"
              onClick={startNewInvoice}
              className="invoice-primary-button"
            >
              <Plus className="h-4 w-4" />
              Nouvelle facture
            </button>
          )}
        </div>
      </header>

      {view === "list" && (
        <div className="screen-only space-y-6">
          <section
            className="invoice-summary-grid"
            aria-label="Résumé de facturation"
          >
            <article className="invoice-summary-card">
              <div className="invoice-summary-icon invoice-summary-icon-navy">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="invoice-summary-label">Factures enregistrées</p>
                <p className="invoice-summary-value">{invoiceCounts.total}</p>
                <p className="invoice-summary-helper">
                  Toutes périodes confondues
                </p>
              </div>
              <span className="invoice-summary-decoration">
                <FileText />
              </span>
            </article>
            <article className="invoice-summary-card">
              <div className="invoice-summary-icon invoice-summary-icon-gold">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="invoice-summary-label">À traiter</p>
                <p className="invoice-summary-value">
                  {invoiceCounts.pending + invoiceCounts.drafts}
                </p>
                <p className="invoice-summary-helper">
                  {invoiceCounts.pending} en attente · {invoiceCounts.drafts}{" "}
                  brouillon(s)
                </p>
              </div>
              <span className="invoice-summary-decoration">
                <Clock3 />
              </span>
            </article>
            <article className="invoice-summary-card">
              <div className="invoice-summary-icon invoice-summary-icon-green">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="invoice-summary-label">Factures réglées</p>
                <p className="invoice-summary-value">{invoiceCounts.paid}</p>
                <p className="invoice-summary-helper">Paiements enregistrés</p>
              </div>
              <span className="invoice-summary-decoration">
                <BadgeCheck />
              </span>
            </article>
            <article className="invoice-summary-card invoice-summary-finance">
              <div className="invoice-summary-icon invoice-summary-icon-blue">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="invoice-summary-label">Solde à recouvrer</p>
                <p className="invoice-summary-value invoice-summary-money">
                  {formatMoney(totalsByCurrency.remaining.CDF, "CDF")}
                  {totalsByCurrency.remaining.USD > 0 && (
                    <span>
                      {formatMoney(totalsByCurrency.remaining.USD, "USD")}
                    </span>
                  )}
                </p>
                <p className="invoice-summary-helper">
                  Montants conservés par devise
                </p>
              </div>
            </article>
          </section>

          <section className="invoice-register">
            <div className="invoice-register-heading">
              <div className="min-w-0">
                <div className="invoice-register-overline">
                  <ShieldCheck className="h-4 w-4" />
                  Registre administratif
                </div>
                <h2>Factures d’honoraires</h2>
                <p>
                  Consultez le statut, le client et le montant de chaque
                  document.
                </p>
              </div>
              <div className="invoice-issued-total">
                <span>Montant facturé</span>
                <strong>
                  {formatMoney(totalsByCurrency.issued.CDF, "CDF")}
                </strong>
                {totalsByCurrency.issued.USD > 0 && (
                  <strong>
                    {formatMoney(totalsByCurrency.issued.USD, "USD")}
                  </strong>
                )}
              </div>
            </div>

            <div className="invoice-register-toolbar">
              <label className="invoice-search">
                <Search className="h-4 w-4" />
                <span className="sr-only">Rechercher une facture</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="N° facture, client, période…"
                />
              </label>
              <label className="invoice-filter">
                <span>Statut</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as InvoiceFilter)
                  }
                >
                  <option value="Toutes">Tous les statuts</option>
                  <option value="Brouillon">Brouillon</option>
                  <option value="En attente">En attente</option>
                  <option value="Certifiée">Certifiée</option>
                  <option value="Payée">Payée</option>
                  <option value="Rejetée">Rejetée</option>
                </select>
              </label>
              <span className="invoice-result-count">
                {visibleInvoices.length} résultat(s)
              </span>
            </div>

            {visibleInvoices.length ? (
              <div className="invoice-table-scroll">
                <table className="invoice-register-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Client</th>
                      <th>Période</th>
                      <th>Date d’émission</th>
                      <th>Montant</th>
                      <th>Statut</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td data-label="Référence">
                          <span className="invoice-reference">
                            <span className="invoice-reference-icon">
                              <FileText className="h-4 w-4" />
                            </span>
                            <span>{invoice.id}</span>
                          </span>
                        </td>
                        <td data-label="Client">
                          <span className="invoice-client-name">
                            {invoice.client}
                          </span>
                          <span className="invoice-client-meta">
                            {clients.find(
                              (client) => client.id === invoice.clientId,
                            )?.sector ?? "Dossier client"}
                          </span>
                        </td>
                        <td data-label="Période">{invoice.period || "—"}</td>
                        <td data-label="Date d’émission">
                          <span className="invoice-date-cell">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {invoiceDateLabel(invoice.date)}
                          </span>
                        </td>
                        <td
                          data-label="Montant"
                          className="invoice-amount-cell"
                        >
                          {formatMoney(invoice.amount, invoice.currency)}
                        </td>
                        <td data-label="Statut">
                          <span
                            className={`invoice-status ${invoiceStatusStyles[invoice.status]}`}
                          >
                            <span />
                            {invoice.status}
                          </span>
                        </td>
                        <td data-label="Actions">
                          <div className="invoice-row-actions">
                            <button
                              type="button"
                              onClick={() => openInvoice(invoice)}
                              className="invoice-view-button"
                              aria-label={`Consulter la facture ${invoice.id}`}
                            >
                              <Eye className="h-4 w-4" />
                              <span>Consulter</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeInvoice(invoice)}
                              disabled={deletingInvoiceId === invoice.id}
                              className="invoice-delete-button"
                              aria-label={`Supprimer définitivement la facture ${invoice.id}`}
                              title={`Supprimer la facture ${invoice.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>
                                {deletingInvoiceId === invoice.id
                                  ? "Suppression…"
                                  : "Supprimer"}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="invoice-empty-state">
                <span>
                  <Users className="h-5 w-5" />
                </span>
                <h3>Aucune facture trouvée</h3>
                <p>
                  {invoices.length
                    ? "Modifiez votre recherche ou choisissez un autre statut."
                    : "Créez une facture d’honoraires pour commencer votre registre."}
                </p>
                {!invoices.length && (
                  <button
                    type="button"
                    onClick={startNewInvoice}
                    className="invoice-primary-button"
                  >
                    <Plus className="h-4 w-4" />
                    Créer une facture
                  </button>
                )}
              </div>
            )}
          </section>
          <p className="invoice-register-note">
            <ShieldCheck className="h-4 w-4" />
            La certification fiscale est indiquée uniquement après réception
            d’une réponse officielle.
          </p>
        </div>
      )}

      {view !== "list" && (
        <div
          className={`grid gap-6 ${view === "detail" ? "" : "xl:grid-cols-[1.15fr_0.85fr]"}`}
        >
          {view === "detail" && (message || error) && (
            <div className="screen-only invoice-detail-feedback">
              {error ? (
                <p role="alert">{error}</p>
              ) : (
                <p role="status">
                  <CheckCircle2 className="h-4 w-4" />
                  {message}
                </p>
              )}
            </div>
          )}
          {view === "create" && (
            <section className="screen-only invoice-entry-form space-y-5">
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
                    value={prestation}
                    onChange={(event) => setPrestation(event.target.value)}
                    placeholder="Ex. Honoraires sur les travaux de contrôle"
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
                  Échéance de paiement (facultatif)
                  <input
                    type="date"
                    min={invoiceDate || undefined}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
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
                  {profile?.exchangeRateCdfPerUsd && (
                    <span className="block text-xs font-normal text-slate-500">
                      Taux indicatif : 1 USD = {profile.exchangeRateCdfPerUsd}{" "}
                      CDF
                    </span>
                  )}
                </label>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Détail de la facture
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Le prix total de chaque ligne est calculé automatiquement.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) => [
                        ...current,
                        {
                          id: crypto.randomUUID(),
                          rubric: "",
                          quantity: 1,
                          unitPrice: 0,
                        },
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
                      <span className="pb-2 text-sm font-semibold text-slate-500">
                        {index + 1}.
                      </span>
                      <label className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                        Rubrique
                        <input
                          value={item.rubric}
                          onChange={(event) =>
                            updateItem(item.id, { rubric: event.target.value })
                          }
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
                            updateItem(item.id, {
                              quantity: Number(event.target.value),
                            })
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
                            updateItem(item.id, {
                              unitPrice: Number(event.target.value),
                            })
                          }
                          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal tracking-normal text-slate-900"
                        />
                      </label>
                      <div className="pb-2 text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                        Prix total
                        <p className="mt-2 text-sm font-semibold tracking-normal text-slate-900">
                          {formatMoney(
                            item.quantity * item.unitPrice,
                            currency,
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Supprimer la rubrique ${index + 1}`}
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((current) =>
                            current.filter((row) => row.id !== item.id),
                          )
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
                <p
                  role="alert"
                  className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
                >
                  {error}
                </p>
              )}
              {message && (
                <p
                  role="status"
                  className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {message}
                </p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveInvoice("Brouillon")}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {saving ? "Enregistrement…" : "Enregistrer brouillon"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveInvoice("En attente")}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {saving ? "Enregistrement…" : "Enregistrer pour transmission"}
                </button>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                L’enregistrement ne vaut pas certification fiscale. La facture
                reste un document interne tant qu’aucune réponse officielle n’a
                été reçue.
              </p>
            </section>
          )}

          <div id="invoice-preview" className="min-w-0">
            {view === "create" && (
              <div className="screen-only mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Aperçu en direct
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Le document se met à jour pendant la saisie. Son numéro
                    définitif sera attribué à l’enregistrement.
                  </p>
                  {invoiceTemplateDraft && (
                    <p
                      role="status"
                      className="mt-1 text-xs font-medium text-amber-800"
                    >
                      Copie locale du modèle affichée — non synchronisée avec le
                      serveur.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="invoice-secondary-button"
                    aria-label="Imprimer ou enregistrer la facture en PDF"
                    title="Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF » pour télécharger le PDF."
                  >
                    <Printer className="h-4 w-4" />
                    Imprimer / PDF
                  </button>
                  <Link
                    href="/settings/invoice-template"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900"
                  >
                    <Paintbrush className="h-4 w-4" />
                    Modifier le modèle
                  </Link>
                </div>
              </div>
            )}
            <section ref={invoiceDocumentRef} className="invoice-document">
              <div className="invoice-document-top">
                <div
                  data-invoice-object="logo"
                  style={templateObjectStyle(invoiceTemplate, "logo")}
                >
                  {templateElement(invoiceTemplate, "logo")?.content ? (
                    <p className="invoice-template-logo-text">
                      {templateText(
                        invoiceTemplate,
                        "logo",
                        "",
                        templateValues,
                      )}
                    </p>
                  ) : (
                    <DocumentLetterhead />
                  )}
                </div>
                <div
                  className="invoice-document-qr"
                  data-invoice-object="qr"
                  style={templateObjectStyle(invoiceTemplate, "qr")}
                >
                  {templateElement(invoiceTemplate, "qr")?.content ? (
                    templateText(invoiceTemplate, "qr", "", templateValues)
                  ) : (
                    <QRCodeSVG
                      value={invoiceQrValue}
                      size={96}
                      level="M"
                      includeMargin
                      title={`Code QR interne de la facture ${documentNumber || "en cours"}`}
                    />
                  )}
                </div>
              </div>

              <div className="invoice-document-heading">
                <div
                  className="invoice-document-title-row"
                  data-invoice-object="title"
                  style={templateObjectStyle(invoiceTemplate, "title")}
                >
                  <h2>
                    {templateText(
                      invoiceTemplate,
                      "title",
                      `FACTURE N° ${documentNumber || "À attribuer"}`,
                      templateValues,
                    )}
                  </h2>
                  {documentStatus && (
                    <span
                      className={`invoice-status invoice-document-status ${invoiceStatusStyles[documentStatus]}`}
                    >
                      <span />
                      {documentStatus}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="invoice-document-accent-rule"
                aria-hidden="true"
              />

              <div className="invoice-document-details">
                {templateElement(invoiceTemplate, "client")?.visible && (
                  <div
                    data-invoice-object="client"
                    style={templateObjectStyle(invoiceTemplate, "client")}
                  >
                    {templateElement(invoiceTemplate, "client")?.content ? (
                      templateText(
                        invoiceTemplate,
                        "client",
                        "",
                        templateValues,
                      )
                    ) : (
                      <>
                        <p className="invoice-document-label">Client</p>
                        <p>{documentClient || "À renseigner"}</p>
                      </>
                    )}
                  </div>
                )}
                {templateElement(invoiceTemplate, "period")?.visible && (
                  <div
                    data-invoice-object="period"
                    style={templateObjectStyle(invoiceTemplate, "period")}
                  >
                    {templateElement(invoiceTemplate, "period")?.content ? (
                      templateText(
                        invoiceTemplate,
                        "period",
                        "",
                        templateValues,
                      )
                    ) : (
                      <>
                        <p className="invoice-document-label">Période :</p>
                        <p>
                          {selectedInvoice?.period || period || "À renseigner"}
                        </p>
                      </>
                    )}
                  </div>
                )}
                {templateElement(invoiceTemplate, "prestation")?.visible && (
                  <div
                    className="invoice-document-prestation"
                    data-invoice-object="prestation"
                    style={templateObjectStyle(invoiceTemplate, "prestation")}
                  >
                    {templateElement(invoiceTemplate, "prestation")?.content ? (
                      templateText(
                        invoiceTemplate,
                        "prestation",
                        "",
                        templateValues,
                      )
                    ) : (
                      <>
                        <p className="invoice-document-label">Concerne :</p>
                        <p>
                          {selectedInvoice?.concern ||
                            prestation ||
                            "À renseigner"}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {templateElement(invoiceTemplate, "items")?.visible && (
                <div
                  className="invoice-document-table-wrap"
                  data-invoice-object="items"
                  style={templateObjectStyle(invoiceTemplate, "items")}
                >
                  {templateElement(invoiceTemplate, "items")?.content ? (
                    templateText(invoiceTemplate, "items", "", templateValues)
                  ) : (
                    <table className="invoice-document-table">
                      <thead>
                        <tr className="border-y border-slate-300 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                          <th className="w-10 px-2 py-3 text-center">N°</th>
                          <th className="px-2 py-3">Rubrique</th>
                          <th className="px-2 py-3 text-right">Nombre</th>
                          <th className="px-2 py-3 text-right">
                            Prix unitaire
                          </th>
                          <th className="px-2 py-3 text-right">Prix total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentItems.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-2 py-6 text-center text-sm text-slate-500"
                            >
                              Détail des rubriques non disponible pour cette
                              facture.
                            </td>
                          </tr>
                        )}
                        {documentItems.map((item, index) => (
                          <tr
                            key={
                              "id" in item ? item.id : `${item.rubric}-${index}`
                            }
                            className="border-b border-slate-200 align-top"
                          >
                            <td className="px-2 py-3 text-center text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-2 py-3 font-medium text-slate-800">
                              {item.rubric || "—"}
                            </td>
                            <td className="px-2 py-3 text-right text-slate-700">
                              {item.quantity}
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 text-right text-slate-700">
                              {formatMoney(item.unitPrice, documentCurrency)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 text-right font-medium text-slate-900">
                              {formatMoney(
                                "total" in item
                                  ? item.total
                                  : item.quantity * item.unitPrice,
                                documentCurrency,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {templateElement(invoiceTemplate, "total")?.visible && (
                <div
                  className="invoice-document-total"
                  data-invoice-object="total"
                  style={templateObjectStyle(invoiceTemplate, "total")}
                >
                  {templateElement(invoiceTemplate, "total")?.content ? (
                    templateText(invoiceTemplate, "total", "", templateValues)
                  ) : (
                    <>
                      <span>Total général</span>
                      <strong>
                        {formatMoney(documentTotal, documentCurrency)}
                      </strong>
                    </>
                  )}
                </div>
              )}
              {templateElement(invoiceTemplate, "amount-words")?.visible && (
                <p
                  className="invoice-document-amount-words"
                  data-invoice-object="amount-words"
                  style={templateObjectStyle(invoiceTemplate, "amount-words")}
                >
                  {templateText(
                    invoiceTemplate,
                    "amount-words",
                    amountInWords(documentTotal, documentCurrency),
                    templateValues,
                  )}
                </p>
              )}
              {documentExchangeRate && Number(documentExchangeRate) > 0 && (
                <div className="mt-3 text-right text-xs text-slate-500">
                  <p>Taux appliqué : 1 USD = {documentExchangeRate} CDF</p>
                  {equivalentAmount !== null && (
                    <p className="mt-1">
                      Équivalent indicatif :{" "}
                      {formatMoney(equivalentAmount, equivalentCurrency)}
                    </p>
                  )}
                  <p className="mt-1">
                    Montant de la facture et règlement à conserver en{" "}
                    {documentCurrency}.
                  </p>
                </div>
              )}
              <div className="invoice-document-bottom">
                {templateElement(invoiceTemplate, "payment-terms")?.visible && (
                  <section
                    className="invoice-payment-terms"
                    data-invoice-object="payment-terms"
                    style={templateObjectStyle(
                      invoiceTemplate,
                      "payment-terms",
                    )}
                  >
                    {templateElement(invoiceTemplate, "payment-terms")
                      ?.content ? (
                      templateText(
                        invoiceTemplate,
                        "payment-terms",
                        "",
                        templateValues,
                      )
                    ) : (
                      <>
                        <h3>Modalités de Paiement :</h3>
                        {usesDefaultBrand ? (
                          <p>
                            Nos factures sont payables dans nos comptes
                            bancaires ouverts à RAWBANK USD 05100-01074774401-40
                            ou EQUITY BCDC USD 0092000000130797, ou dans nos
                            caisses ouvertes au siège de la société.
                          </p>
                        ) : (
                          <p>
                            Veuillez régler selon les modalités communiquées par
                            le cabinet.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}
                <div className="invoice-document-approval">
                  {templateElement(invoiceTemplate, "date")?.visible && (
                    <div
                      className="invoice-document-date"
                      data-invoice-object="date"
                      style={templateObjectStyle(invoiceTemplate, "date")}
                    >
                      <p>
                        {templateText(
                          invoiceTemplate,
                          "date",
                          `Fait à ${documentMadeAt || "________"}, le ${displayDate(documentDate)}${documentDueDate ? ` · Échéance : ${displayDate(documentDueDate)}` : ""}`,
                          templateValues,
                        )}
                      </p>
                    </div>
                  )}
                  {templateElement(invoiceTemplate, "signature")?.visible && (
                    <div
                      data-invoice-object="signature"
                      style={templateObjectStyle(invoiceTemplate, "signature")}
                    >
                      {templateElement(invoiceTemplate, "signature")
                        ?.content ? (
                        templateText(
                          invoiceTemplate,
                          "signature",
                          "",
                          templateValues,
                        )
                      ) : (
                        <DocumentSignature />
                      )}
                    </div>
                  )}
                </div>
              </div>
              {templateElement(invoiceTemplate, "footer")?.visible && (
                <div
                  className="invoice-document-footer"
                  data-invoice-object="footer"
                  style={templateObjectStyle(invoiceTemplate, "footer")}
                >
                  <Image
                    src="/branding/ctrs-invoice-footer.svg"
                    alt=""
                    aria-hidden="true"
                    width={2100}
                    height={600}
                    unoptimized
                    className="invoice-document-footer-art"
                  />
                  {templateElement(invoiceTemplate, "footer")?.content ? (
                    <div className="invoice-template-footer-text">
                      {templateText(
                        invoiceTemplate,
                        "footer",
                        "",
                        templateValues,
                      )}
                    </div>
                  ) : (
                    <DocumentFooter />
                  )}
                </div>
              )}
              {invoiceTemplate.elements
                .filter(
                  (element) => element.kind !== "builtin" && element.visible,
                )
                .map((element) => (
                  <div
                    key={element.id}
                    className={`invoice-template-custom-object is-${element.kind}`}
                    style={{
                      left: `${element.x}mm`,
                      top: `${element.y}mm`,
                      width: `${element.width}mm`,
                      height: `${element.height}mm`,
                      zIndex: invoiceTemplate.elements.indexOf(element) + 1,
                      color: element.color,
                      backgroundColor:
                        element.kind === "shape" ? element.fill : undefined,
                      borderTop:
                        element.kind === "line"
                          ? `1px solid ${element.color}`
                          : undefined,
                      fontSize: `${element.fontSize}pt`,
                    }}
                  >
                    {element.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={element.content} alt={element.name} />
                    ) : element.kind === "shape" ||
                      element.kind === "line" ? null : (
                      templateText(
                        invoiceTemplate,
                        element.id,
                        element.content,
                        templateValues,
                      )
                    )}
                  </div>
                ))}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
