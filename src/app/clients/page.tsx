"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  type ClientDossier,
  type ClientDossierDocument,
  useWorkspaceStore,
  type WorkspaceClientStatement,
  type WorkspaceInvoice,
  type WorkspacePayment,
} from "@/components/workspace-store";
import { useNotifications } from "@/components/notification-provider";
import { formatDate, formatMoney } from "@/lib/formatting";

type PaymentStatus =
  "Payée" | "Partiellement payée" | "À payer" | "En retard" | "En attente";

const paymentMethodLabels: Record<WorkspacePayment["method"], string> = {
  CASH_USD: "Espèces (USD)",
  CASH_CDF: "Espèces (CDF)",
  BANK_TRANSFER: "Virement bancaire",
  CARD: "Carte bancaire",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Autre",
};

const paymentStatusStyles: Record<PaymentStatus, string> = {
  Payée: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Partiellement payée": "border-violet-200 bg-violet-50 text-violet-800",
  "À payer": "border-blue-200 bg-blue-50 text-blue-800",
  "En retard": "border-rose-200 bg-rose-50 text-rose-800",
  "En attente": "border-amber-200 bg-amber-50 text-amber-800",
};

function dateInKinshasa(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function getPaymentStatus(invoice: WorkspaceInvoice): PaymentStatus {
  const paid = invoice.paidAmount ?? 0;
  if (invoice.amount > 0 && paid >= invoice.amount) return "Payée";
  if (paid > 0) return "Partiellement payée";
  if (invoice.dueDate) {
    const dueDate = invoice.dueDate.slice(0, 10);
    const today = dateInKinshasa(new Date());
    if (dueDate < today) return "En retard";
    if (dueDate > today) return "En attente";
  }
  return "À payer";
}

function statusLabel(status?: string) {
  if (status === "RECEIVED") return "Confirmé";
  if (status === "PENDING") return "En attente";
  if (status === "CANCELLED") return "Annulé";
  return status || "À vérifier";
}

function formatDocumentSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} Ko`
    : `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ClientsPage() {
  const {
    clients,
    addClient,
    updateClient,
    deleteClient,
    getClientStatement,
    getClientDocuments,
    addClientDocument,
    deleteClientDocument,
    getClientDocumentContent,
    addPayment,
    databaseConnected,
    databaseError,
    clientsAvailable,
    clientsError,
  } = useWorkspaceStore();
  const { notify } = useNotifications();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [clientType, setClientType] =
    useState<ClientDossier["type"]>("COMPANY");
  const [sector, setSector] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [nif, setNif] = useState("");
  const [rccm, setRccm] = useState("");
  const [clientStatus, setClientStatus] =
    useState<ClientDossier["status"]>("À jour");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [clientActionError, setClientActionError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [statement, setStatement] = useState<WorkspaceClientStatement | null>(
    null,
  );
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [statementError, setStatementError] = useState("");
  const [clientDocuments, setClientDocuments] = useState<
    ClientDossierDocument[]
  >([]);
  const [documentsError, setDocumentsError] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );
  const [previewDocument, setPreviewDocument] = useState<{
    document: ClientDossierDocument;
    url: string;
  } | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<WorkspacePayment["method"]>("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (previewDocument?.url) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    if (!normalizedQuery) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.sector} ${client.contact} ${client.type} ${client.email ?? ""} ${client.phone ?? ""} ${client.address ?? ""} ${client.nif ?? ""} ${client.rccm ?? ""}`
        .toLocaleLowerCase("fr")
        .includes(normalizedQuery),
    );
  }, [clients, query]);

  const selectedClient =
    statement?.client ??
    clients.find((client) => client.id === selectedClientId);
  const statementSummary = useMemo(() => {
    const eligibleInvoices =
      statement?.invoices.filter(
        (invoice) =>
          invoice.status !== "Brouillon" && invoice.status !== "Rejetée",
      ) ?? [];

    return {
      invoiceCount: statement?.invoices.length ?? 0,
      issued: {
        CDF: eligibleInvoices
          .filter((invoice) => invoice.currency === "CDF")
          .reduce((sum, invoice) => sum + invoice.amount, 0),
        USD: eligibleInvoices
          .filter((invoice) => invoice.currency === "USD")
          .reduce((sum, invoice) => sum + invoice.amount, 0),
      },
      received: {
        CDF: eligibleInvoices
          .filter((invoice) => invoice.currency === "CDF")
          .reduce(
            (sum, invoice) =>
              sum + Math.min(invoice.paidAmount ?? 0, invoice.amount),
            0,
          ),
        USD: eligibleInvoices
          .filter((invoice) => invoice.currency === "USD")
          .reduce(
            (sum, invoice) =>
              sum + Math.min(invoice.paidAmount ?? 0, invoice.amount),
            0,
          ),
      },
      due: {
        CDF: eligibleInvoices
          .filter((invoice) => invoice.currency === "CDF")
          .reduce(
            (sum, invoice) =>
              sum + Math.max(invoice.amount - (invoice.paidAmount ?? 0), 0),
            0,
          ),
        USD: eligibleInvoices
          .filter((invoice) => invoice.currency === "USD")
          .reduce(
            (sum, invoice) =>
              sum + Math.max(invoice.amount - (invoice.paidAmount ?? 0), 0),
            0,
          ),
      },
    };
  }, [statement]);

  async function openClient(clientId: string) {
    setSelectedClientId(clientId);
    setStatement(null);
    setStatementError("");
    setClientDocuments([]);
    setDocumentsError("");
    setPreviewDocument(null);
    setLoadingStatement(true);
    setPaymentInvoiceId("");
    setPaymentError("");
    setPaymentMessage("");
    try {
      const [statementResult, documentsResult] = await Promise.allSettled([
        getClientStatement(clientId),
        getClientDocuments(clientId),
      ]);
      if (statementResult.status === "fulfilled") {
        setStatement(statementResult.value);
      } else {
        throw statementResult.reason;
      }
      if (documentsResult.status === "fulfilled") {
        setClientDocuments(documentsResult.value);
      } else {
        console.error(
          "Chargement des pièces du dossier impossible.",
          documentsResult.reason,
        );
        setDocumentsError(
          documentsResult.reason instanceof Error
            ? documentsResult.reason.message
            : "Impossible de charger les pièces justificatives.",
        );
      }
    } catch (requestError) {
      console.error(
        "Chargement de l'historique client impossible.",
        requestError,
      );
      setStatementError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger l’historique de ce client.",
      );
    } finally {
      setLoadingStatement(false);
    }
  }

  function closeClient() {
    setSelectedClientId("");
    setStatement(null);
    setStatementError("");
    setClientDocuments([]);
    setDocumentsError("");
    setPreviewDocument(null);
    setPaymentInvoiceId("");
    setPaymentError("");
    setPaymentMessage("");
  }

  async function uploadClientDocument(file: File | undefined) {
    if (!file || !selectedClientId) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setDocumentsError("Formats acceptés : PDF, JPG et PNG.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setDocumentsError("Chaque document ne peut pas dépasser 4 Mo.");
      return;
    }

    setUploadingDocument(true);
    setDocumentsError("");
    try {
      const created = await addClientDocument(selectedClientId, file);
      setClientDocuments((current) => [created, ...current]);
      notify({
        type: "success",
        title: "Pièce ajoutée au dossier",
        message: file.name,
      });
    } catch (requestError) {
      console.error(
        "Ajout d'une pièce au dossier client impossible.",
        requestError,
      );
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’ajouter cette pièce au dossier.";
      setDocumentsError(reason);
      notify({ type: "error", title: "Pièce non ajoutée", message: reason });
    } finally {
      setUploadingDocument(false);
    }
  }

  async function previewClientDocument(document: ClientDossierDocument) {
    if (!selectedClientId) return;
    setLoadingPreviewId(document.id);
    setDocumentsError("");
    try {
      const blob = await getClientDocumentContent(
        selectedClientId,
        document.id,
      );
      const url = URL.createObjectURL(blob);
      setPreviewDocument({ document, url });
    } catch (requestError) {
      console.error("Aperçu de la pièce client impossible.", requestError);
      setDocumentsError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’ouvrir l’aperçu de cette pièce.",
      );
    } finally {
      setLoadingPreviewId(null);
    }
  }

  async function downloadClientDocument(document: ClientDossierDocument) {
    if (!selectedClientId) return;
    try {
      const blob = await getClientDocumentContent(
        selectedClientId,
        document.id,
        true,
      );
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      console.error(
        "Téléchargement de la pièce client impossible.",
        requestError,
      );
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible de télécharger cette pièce.";
      setDocumentsError(reason);
      notify({
        type: "error",
        title: "Téléchargement impossible",
        message: reason,
      });
    }
  }

  async function removeClientDocument(document: ClientDossierDocument) {
    if (
      !selectedClientId ||
      !window.confirm(`Supprimer la pièce « ${document.name} » du dossier ?`)
    ) {
      return;
    }
    setDeletingDocumentId(document.id);
    setDocumentsError("");
    try {
      await deleteClientDocument(selectedClientId, document.id);
      setClientDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
      if (previewDocument?.document.id === document.id) {
        setPreviewDocument(null);
      }
      notify({
        type: "success",
        title: "Pièce supprimée",
        message: document.name,
      });
    } catch (requestError) {
      console.error("Suppression de la pièce client impossible.", requestError);
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible de supprimer cette pièce.";
      setDocumentsError(reason);
      notify({ type: "error", title: "Pièce non supprimée", message: reason });
    } finally {
      setDeletingDocumentId(null);
    }
  }

  function printClientDossier() {
    const body = window.document.body;
    const removePrintMode = () => {
      body.classList.remove("print-client-dossier-mode");
      window.removeEventListener("afterprint", removePrintMode);
    };
    body.classList.add("print-client-dossier-mode");
    window.addEventListener("afterprint", removePrintMode, { once: true });
    window.print();
  }

  function resetClientForm() {
    setEditingClientId(null);
    setClientType("COMPANY");
    setName("");
    setSector("");
    setContact("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNif("");
    setRccm("");
    setClientStatus("À jour");
    setError("");
  }

  function editClient(client: ClientDossier) {
    setEditingClientId(client.id);
    setClientType(client.type);
    setName(client.name);
    setSector(client.sector);
    setContact(client.contact);
    setPhone(client.phone ?? "");
    setEmail(client.email ?? "");
    setAddress(client.address ?? "");
    setNif(client.nif ?? "");
    setRccm(client.rccm ?? "");
    setClientStatus(client.status);
    setError("");
    setMessage("");
    setClientActionError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim() || !sector.trim()) {
      const reason = "Le nom du dossier et son secteur sont obligatoires.";
      setError(reason);
      notify({
        type: "error",
        title: "Dossier non enregistré",
        message: reason,
      });
      return;
    }

    setSavingClient(true);
    try {
      const changes = {
        type: clientType,
        name: name.trim(),
        sector: sector.trim(),
        contact: contact.trim() || "Contact à renseigner",
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        nif: nif.trim() || null,
        rccm: rccm.trim() || null,
        status: clientStatus,
      };
      if (editingClientId) {
        await updateClient(editingClientId, changes);
      } else {
        await addClient({ ...changes, status: "À jour" });
      }
      const savedName = name.trim();
      setMessage(
        editingClientId
          ? `Le dossier ${savedName} a été mis à jour.`
          : `Le dossier ${savedName} a été enregistré dans la base du cabinet.`,
      );
      notify({
        type: "success",
        title: editingClientId
          ? "Dossier client modifié"
          : "Dossier client créé",
        message: editingClientId
          ? `${savedName} a été mis à jour.`
          : `${savedName} a été enregistré dans la base du cabinet.`,
      });
      resetClientForm();
      setShowForm(false);
    } catch (requestError) {
      console.error("Création du dossier client impossible.", requestError);
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible d'enregistrer ce dossier client.";
      setError(reason);
      notify({
        type: "error",
        title: "Dossier non enregistré",
        message: reason,
      });
    } finally {
      setSavingClient(false);
    }
  }

  async function removeClient(client: ClientDossier) {
    if (
      !window.confirm(
        `Retirer ${client.name} de la liste des clients ? Ses factures et règlements seront conservés.`,
      )
    ) {
      return;
    }

    setDeletingClientId(client.id);
    setClientActionError("");
    try {
      await deleteClient(client.id);
      if (selectedClientId === client.id) closeClient();
      if (editingClientId === client.id) {
        resetClientForm();
        setShowForm(false);
      }
      setMessage(
        `${client.name} a été retiré de la liste. Son historique est conservé.`,
      );
      notify({
        type: "success",
        title: "Dossier client supprimé de la liste",
        message: "Les factures et règlements du client sont conservés.",
      });
    } catch (requestError) {
      console.error("Suppression du dossier client impossible.", requestError);
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible de supprimer ce dossier client.";
      setClientActionError(reason);
      notify({ type: "error", title: "Dossier non supprimé", message: reason });
    } finally {
      setDeletingClientId(null);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");
    setPaymentMessage("");
    const invoice = statement?.invoices.find(
      (item) => item.id === paymentInvoiceId,
    );
    if (!invoice) {
      const reason = "Sélectionnez une facture à régler.";
      setPaymentError(reason);
      notify({
        type: "error",
        title: "Règlement non enregistré",
        message: reason,
      });
      return;
    }

    const amount = Number(paymentAmount);
    const remaining = Math.max(invoice.amount - (invoice.paidAmount ?? 0), 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      const reason = "Saisissez un montant valide supérieur à zéro.";
      setPaymentError(reason);
      notify({
        type: "error",
        title: "Règlement non enregistré",
        message: reason,
      });
      return;
    }
    if (amount > remaining) {
      const reason = "Le montant dépasse le solde restant de cette facture.";
      setPaymentError(reason);
      notify({
        type: "error",
        title: "Règlement non enregistré",
        message: reason,
      });
      return;
    }

    setSavingPayment(true);
    try {
      await addPayment({
        invoice,
        amount: paymentAmount,
        method: paymentMethod,
        reference: paymentReference.trim() || undefined,
      });
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentMessage("Règlement enregistré dans PostgreSQL.");
      notify({
        type: "success",
        title: "Règlement enregistré",
        message: `Le paiement de ${invoice.id} a été sauvegardé.`,
      });
      try {
        setStatement(await getClientStatement(invoice.clientId));
      } catch (refreshError) {
        console.error(
          "Actualisation de l'historique après paiement impossible.",
          refreshError,
        );
        setPaymentMessage(
          "Règlement enregistré, mais l’historique n’a pas pu être actualisé. Rechargez le dossier avant toute nouvelle saisie.",
        );
        notify({
          type: "info",
          title: "Historique à actualiser",
          message:
            "Le paiement est enregistré. Actualisez le dossier avant une nouvelle saisie.",
        });
      }
    } catch (requestError) {
      console.error(
        "Enregistrement du règlement client impossible.",
        requestError,
      );
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible d'enregistrer ce règlement.";
      setPaymentError(reason);
      notify({
        type: "error",
        title: "Règlement non enregistré",
        message: reason,
      });
    } finally {
      setSavingPayment(false);
    }
  }

  if (selectedClientId) {
    const payments = statement?.payments ?? [];
    const paymentInvoice = statement?.invoices.find(
      (invoice) => invoice.id === paymentInvoiceId,
    );
    const availableMethods = (
      Object.entries(paymentMethodLabels) as [
        WorkspacePayment["method"],
        string,
      ][]
    ).filter(
      ([method]) =>
        (method !== "CASH_CDF" || paymentInvoice?.currency === "CDF") &&
        (method !== "CASH_USD" || paymentInvoice?.currency === "USD"),
    );

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={closeClient}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux clients
        </button>

        {loadingStatement && (
          <div
            role="status"
            className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
          >
            Chargement du dossier et de l’historique complet…
          </div>
        )}

        {statementError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
            <p role="alert">{statementError}</p>
            <button
              type="button"
              onClick={() => void openClient(selectedClientId)}
              className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 font-medium hover:bg-rose-100"
            >
              Réessayer
            </button>
          </div>
        )}

        {statement && selectedClient && (
          <>
            <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">
                  {selectedClient.name.slice(0, 2).toLocaleUpperCase("fr")}
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-blue-600">
                    Compte client
                  </p>
                  <h1 className="mt-1 text-3xl font-semibold text-slate-900">
                    {selectedClient.name}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedClient.type === "INDIVIDUAL"
                      ? "Personne physique"
                      : "Entreprise"}
                    {" · "}
                    {selectedClient.sector} · Client depuis{" "}
                    {formatDate(selectedClient.createdAt ?? new Date())}
                  </p>
                  <div className="mt-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${selectedClient.status === "À jour" ? "bg-emerald-100 text-emerald-700" : selectedClient.status === "En retard" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {selectedClient.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  {databaseConnected
                    ? "Données synchronisées"
                    : "Base partiellement indisponible"}
                </div>
                <button
                  type="button"
                  onClick={printClientDossier}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  aria-label="Aperçu et impression du dossier client"
                  title="Aperçu avant impression ou enregistrement PDF"
                >
                  <Printer className="h-4 w-4" />
                  Aperçu / PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeClient();
                    editClient(selectedClient);
                  }}
                  disabled={!clientsAvailable || savingClient}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" />
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => void removeClient(selectedClient)}
                  disabled={
                    !clientsAvailable || deletingClientId === selectedClient.id
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  title="Archive le dossier actif sans supprimer factures, règlements ni pièces"
                >
                  <Archive className="h-4 w-4" />
                  {deletingClientId === selectedClient.id
                    ? "Archivage…"
                    : "Archiver"}
                </button>
              </div>
            </header>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Factures au dossier</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {statementSummary.invoiceCount}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Honoraires facturés</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatMoney(statementSummary.issued.CDF, "CDF")}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatMoney(statementSummary.issued.USD, "USD")}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-sm text-emerald-800">Règlements reçus</p>
                <p className="mt-2 text-sm font-semibold text-emerald-900">
                  {formatMoney(statementSummary.received.CDF, "CDF")}
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-900">
                  {formatMoney(statementSummary.received.USD, "USD")}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-sm text-amber-900">Solde à recouvrer</p>
                <p className="mt-2 text-sm font-semibold text-amber-950">
                  {formatMoney(statementSummary.due.CDF, "CDF")}
                </p>
                <p className="mt-1 text-sm font-semibold text-amber-950">
                  {formatMoney(statementSummary.due.USD, "USD")}
                </p>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="font-semibold text-slate-900">
                    Informations du client
                  </h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Contact</dt>
                      <dd className="text-right font-medium text-slate-800">
                        {selectedClient.contact || "Non renseigné"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Téléphone</dt>
                      <dd className="text-right font-medium text-slate-800">
                        {selectedClient.phone || "Non renseigné"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Courriel</dt>
                      <dd className="break-all text-right font-medium text-slate-800">
                        {selectedClient.email || "Non renseigné"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Adresse</dt>
                      <dd className="text-right font-medium text-slate-800">
                        {selectedClient.address || "Non renseignée"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">NIF</dt>
                      <dd className="text-right font-medium text-slate-800">
                        {selectedClient.nif || "Non renseigné"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">RCCM</dt>
                      <dd className="text-right font-medium text-slate-800">
                        {selectedClient.rccm || "Non renseigné"}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        Pièces justificatives
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        PDF, JPG ou PNG · 4 Mo maximum par fichier · 30 fichiers
                        maximum
                      </p>
                    </div>
                    <label
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 ${uploadingDocument || !clientsAvailable ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <FileText className="h-4 w-4" />
                      {uploadingDocument ? "Envoi…" : "Ajouter une pièce"}
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                        className="sr-only"
                        disabled={uploadingDocument || !clientsAvailable}
                        onChange={(event) => {
                          void uploadClientDocument(
                            event.currentTarget.files?.[0],
                          );
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {documentsError && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
                    >
                      {documentsError}
                    </p>
                  )}
                  {clientDocuments.length ? (
                    <ul className="mt-4 divide-y divide-slate-100">
                      {clientDocuments.map((document) => (
                        <li
                          key={document.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-5 w-5 shrink-0 text-blue-600" />
                            <div className="min-w-0">
                              <p className="break-all text-sm font-medium text-slate-800">
                                {document.name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {document.mimeType === "application/pdf"
                                  ? "PDF"
                                  : document.mimeType === "image/png"
                                    ? "PNG"
                                    : "JPG"}
                                {" · "}
                                {formatDocumentSize(document.size)}
                                {" · "}
                                {formatDate(document.createdAt, {
                                  dateStyle: "medium",
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                void previewClientDocument(document)
                              }
                              disabled={loadingPreviewId === document.id}
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              aria-label={`Aperçu de ${document.name}`}
                              title="Aperçu"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void downloadClientDocument(document)
                              }
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                              aria-label={`Télécharger ${document.name}`}
                              title="Télécharger"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void removeClientDocument(document)
                              }
                              disabled={
                                deletingDocumentId === document.id ||
                                !clientsAvailable
                              }
                              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              aria-label={`Supprimer ${document.name}`}
                              title="Supprimer la pièce"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Aucune pièce justificative n’est encore jointe à ce
                      dossier.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-blue-600" />
                    <h2 className="font-semibold text-slate-900">
                      Historique des règlements
                    </h2>
                  </div>
                  {payments.length ? (
                    <ol className="mt-4 space-y-4">
                      {payments.map((payment) => {
                        const isExpanded = expandedPaymentId === payment.id;
                        const paymentInvoice = statement.invoices.find(
                          (invoice) => invoice.databaseId === payment.invoiceId,
                        );
                        const historicalPaid =
                          payment.invoicePaidAmountAfter == null
                            ? null
                            : Number(payment.invoicePaidAmountAfter);
                        const historicalBalance =
                          paymentInvoice && historicalPaid !== null
                            ? Math.max(
                                paymentInvoice.amount - historicalPaid,
                                0,
                              )
                            : null;
                        return (
                          <li
                            key={payment.id}
                            className="relative border-l border-slate-200 pb-1 pl-4 last:border-l-transparent"
                          >
                            <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={`client-payment-details-${payment.id}`}
                              onClick={() =>
                                setExpandedPaymentId(
                                  isExpanded ? null : payment.id,
                                )
                              }
                              className="w-full rounded-lg p-2 text-left transition hover:bg-slate-50"
                            >
                              <span className="flex justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-900">
                                  {formatMoney(
                                    payment.amount,
                                    payment.currency,
                                  )}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatDate(payment.createdAt, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}
                                </span>
                              </span>
                              <span className="mt-1 flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-600">
                                  {payment.invoiceNumber} ·{" "}
                                  {paymentMethodLabels[payment.method]}
                                </span>
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {statusLabel(payment.status)}
                                {payment.reference
                                  ? ` · Réf. ${payment.reference}`
                                  : ""}
                              </span>
                            </button>
                            {isExpanded && (
                              <dl
                                id={`client-payment-details-${payment.id}`}
                                className="mt-2 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2"
                              >
                                <div>
                                  <dt className="text-slate-500">
                                    Identifiant du règlement
                                  </dt>
                                  <dd className="mt-1 break-all font-medium text-slate-800">
                                    {payment.id}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    Statut du paiement
                                  </dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {statusLabel(payment.status)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    Facture liée
                                  </dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {payment.invoiceNumber}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    Montant total de la facture
                                  </dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {paymentInvoice
                                      ? formatMoney(
                                          paymentInvoice.amount,
                                          paymentInvoice.currency,
                                        )
                                      : "Indisponible"}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    Cumul réglé après ce paiement
                                  </dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {historicalPaid === null
                                      ? "Non conservé pour cet ancien règlement"
                                      : formatMoney(
                                          historicalPaid,
                                          payment.currency,
                                        )}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    {historicalBalance === null
                                      ? "Solde actuel de la facture"
                                      : "Solde après ce paiement"}
                                  </dt>
                                  <dd className="mt-1 font-semibold text-amber-800">
                                    {historicalBalance !== null
                                      ? formatMoney(
                                          historicalBalance,
                                          payment.currency,
                                        )
                                      : paymentInvoice
                                        ? formatMoney(
                                            Math.max(
                                              paymentInvoice.amount -
                                                (paymentInvoice.paidAmount ??
                                                  0),
                                              0,
                                            ),
                                            payment.currency,
                                          )
                                        : "Indisponible"}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    Mode de paiement
                                  </dt>
                                  <dd className="mt-1 font-medium text-slate-800">
                                    {paymentMethodLabels[payment.method]}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">
                                    Référence de transaction
                                  </dt>
                                  <dd className="mt-1 break-words font-medium text-slate-800">
                                    {payment.reference || "Non renseignée"}
                                  </dd>
                                </div>
                              </dl>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Aucun règlement enregistré pour ce client.
                    </p>
                  )}
                </section>
              </div>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <h2 className="font-semibold text-slate-900">
                      Factures et soldes
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Les états de paiement sont calculés depuis les factures et
                    règlements enregistrés.
                  </p>
                </div>
                {statement.invoices.length ? (
                  <div className="divide-y divide-slate-100">
                    {statement.invoices.map((invoice) => {
                      const status = getPaymentStatus(invoice);
                      const paid = Math.min(
                        invoice.paidAmount ?? 0,
                        invoice.amount,
                      );
                      const remaining = Math.max(invoice.amount - paid, 0);
                      const canPay =
                        status !== "Payée" &&
                        invoice.status !== "Brouillon" &&
                        invoice.status !== "Rejetée";
                      const isPaymentFormOpen = paymentInvoiceId === invoice.id;

                      return (
                        <article
                          key={invoice.databaseId ?? invoice.id}
                          className="p-5"
                        >
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {invoice.id}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {invoice.concern || "Concerne"} ·{" "}
                                {invoice.period || "Période non précisée"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Émise le{" "}
                                {formatDate(`${invoice.date}T12:00:00`, {
                                  dateStyle: "medium",
                                })}
                                {invoice.dueDate
                                  ? ` · Échéance ${formatDate(invoice.dueDate, { dateStyle: "medium" })}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${paymentStatusStyles[status]}`}
                              >
                                Paiement : {status}
                              </span>
                              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                {invoice.status === "Brouillon"
                                  ? "Brouillon"
                                  : invoice.status === "En attente"
                                    ? "En attente de certification"
                                    : invoice.status === "Rejetée"
                                      ? "Rejetée fiscalement"
                                      : "Certifiée"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-slate-500">
                                Montant facture
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {formatMoney(invoice.amount, invoice.currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">
                                Déjà réglé
                              </p>
                              <p className="mt-1 font-semibold text-emerald-800">
                                {formatMoney(paid, invoice.currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">
                                Reste à payer
                              </p>
                              <p className="mt-1 font-semibold text-amber-900">
                                {formatMoney(remaining, invoice.currency)}
                              </p>
                            </div>
                          </div>

                          {canPay && !isPaymentFormOpen && (
                            <button
                              type="button"
                              disabled={!databaseConnected}
                              onClick={() => {
                                setPaymentInvoiceId(invoice.id);
                                setPaymentAmount("");
                                setPaymentReference("");
                                setPaymentError("");
                                setPaymentMessage("");
                                setPaymentMethod("BANK_TRANSFER");
                              }}
                              className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Enregistrer un règlement
                            </button>
                          )}

                          {isPaymentFormOpen && (
                            <form
                              onSubmit={submitPayment}
                              className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-slate-900">
                                  Nouveau règlement
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => setPaymentInvoiceId("")}
                                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                                >
                                  Fermer
                                </button>
                              </div>
                              <label className="block space-y-1 text-sm font-medium text-slate-700">
                                Montant reçu · solde{" "}
                                {formatMoney(remaining, invoice.currency)}
                                <input
                                  required
                                  type="number"
                                  min="0.01"
                                  max={remaining}
                                  step="0.01"
                                  value={paymentAmount}
                                  onChange={(event) =>
                                    setPaymentAmount(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                />
                              </label>
                              <label className="block space-y-1 text-sm font-medium text-slate-700">
                                Moyen de paiement
                                <select
                                  value={paymentMethod}
                                  onChange={(event) =>
                                    setPaymentMethod(
                                      event.target
                                        .value as WorkspacePayment["method"],
                                    )
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                >
                                  {availableMethods.map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block space-y-1 text-sm font-medium text-slate-700">
                                Référence (facultatif)
                                <input
                                  maxLength={120}
                                  value={paymentReference}
                                  onChange={(event) =>
                                    setPaymentReference(event.target.value)
                                  }
                                  placeholder="N° de transaction, bordereau…"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                />
                              </label>
                              {paymentError && (
                                <p
                                  role="alert"
                                  className="text-sm text-rose-700"
                                >
                                  {paymentError}
                                </p>
                              )}
                              {paymentMessage && (
                                <p
                                  role="status"
                                  className="text-sm text-emerald-800"
                                >
                                  {paymentMessage}
                                </p>
                              )}
                              <button
                                type="submit"
                                disabled={savingPayment || !databaseConnected}
                                className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savingPayment
                                  ? "Enregistrement…"
                                  : "Confirmer le règlement"}
                              </button>
                            </form>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-5 py-12 text-center text-sm text-slate-500">
                    Aucune facture n’est encore associée à ce client.
                  </p>
                )}
              </section>
            </section>

            <section
              className="client-dossier-print"
              aria-label="Récapitulatif imprimable du dossier client"
            >
              <header className="client-dossier-print-header">
                <p>FACTURA RDC · DOSSIER CLIENT</p>
                <h1>{selectedClient.name}</h1>
                <p>
                  {selectedClient.type === "INDIVIDUAL"
                    ? "Personne physique"
                    : "Entreprise"}
                  {" · "}
                  {selectedClient.sector} · Statut : {selectedClient.status}
                </p>
              </header>
              <section>
                <h2>Informations du client</h2>
                <dl className="client-dossier-print-grid">
                  <div>
                    <dt>Contact</dt>
                    <dd>{selectedClient.contact || "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>Téléphone</dt>
                    <dd>{selectedClient.phone || "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>Courriel</dt>
                    <dd>{selectedClient.email || "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>Adresse</dt>
                    <dd>{selectedClient.address || "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt>NIF</dt>
                    <dd>{selectedClient.nif || "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>RCCM</dt>
                    <dd>{selectedClient.rccm || "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>Client depuis</dt>
                    <dd>
                      {formatDate(selectedClient.createdAt ?? new Date())}
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <h2>Résumé financier</h2>
                <dl className="client-dossier-print-grid">
                  <div>
                    <dt>Factures au dossier</dt>
                    <dd>{statementSummary.invoiceCount}</dd>
                  </div>
                  <div>
                    <dt>Facturé CDF</dt>
                    <dd>{formatMoney(statementSummary.issued.CDF, "CDF")}</dd>
                  </div>
                  <div>
                    <dt>Facturé USD</dt>
                    <dd>{formatMoney(statementSummary.issued.USD, "USD")}</dd>
                  </div>
                  <div>
                    <dt>Reçu CDF</dt>
                    <dd>{formatMoney(statementSummary.received.CDF, "CDF")}</dd>
                  </div>
                  <div>
                    <dt>Reçu USD</dt>
                    <dd>{formatMoney(statementSummary.received.USD, "USD")}</dd>
                  </div>
                  <div>
                    <dt>À recouvrer CDF</dt>
                    <dd>{formatMoney(statementSummary.due.CDF, "CDF")}</dd>
                  </div>
                  <div>
                    <dt>À recouvrer USD</dt>
                    <dd>{formatMoney(statementSummary.due.USD, "USD")}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h2>Factures</h2>
                {statement.invoices.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Numéro</th>
                        <th>Date</th>
                        <th>Objet</th>
                        <th>Statut</th>
                        <th>Total</th>
                        <th>Payé</th>
                        <th>Reste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.invoices.map((invoice) => (
                        <tr key={invoice.databaseId ?? invoice.id}>
                          <td>{invoice.id}</td>
                          <td>
                            {formatDate(`${invoice.date}T12:00:00`, {
                              dateStyle: "medium",
                            })}
                          </td>
                          <td>
                            {invoice.concern || "—"} · {invoice.period || "—"}
                          </td>
                          <td>{invoice.status}</td>
                          <td>
                            {formatMoney(invoice.amount, invoice.currency)}
                          </td>
                          <td>
                            {formatMoney(
                              Math.min(invoice.paidAmount ?? 0, invoice.amount),
                              invoice.currency,
                            )}
                          </td>
                          <td>
                            {formatMoney(
                              Math.max(
                                invoice.amount - (invoice.paidAmount ?? 0),
                                0,
                              ),
                              invoice.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Aucune facture.</p>
                )}
              </section>
              <section>
                <h2>Règlements enregistrés</h2>
                {payments.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Facture</th>
                        <th>Montant</th>
                        <th>Moyen</th>
                        <th>Référence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            {formatDate(payment.createdAt, {
                              dateStyle: "medium",
                            })}
                          </td>
                          <td>{payment.invoiceNumber}</td>
                          <td>
                            {formatMoney(
                              Number(payment.amount),
                              payment.currency,
                            )}
                          </td>
                          <td>{paymentMethodLabels[payment.method]}</td>
                          <td>{payment.reference || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Aucun règlement enregistré.</p>
                )}
              </section>
              <section>
                <h2>Pièces justificatives ({clientDocuments.length})</h2>
                {clientDocuments.length ? (
                  <ul>
                    {clientDocuments.map((document) => (
                      <li key={document.id}>
                        {document.name} · {formatDocumentSize(document.size)} ·{" "}
                        {formatDate(document.createdAt, {
                          dateStyle: "medium",
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucune pièce jointe.</p>
                )}
              </section>
              <footer>
                Document de synthèse généré le {formatDate(new Date())}. Les
                pièces justificatives ne sont pas incluses dans ce PDF.
              </footer>
            </section>
          </>
        )}

        {previewDocument && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label={`Aperçu de ${previewDocument.document.name}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget)
                setPreviewDocument(null);
            }}
          >
            <section className="flex h-[min(90vh,60rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-900">
                    {previewDocument.document.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {previewDocument.document.mimeType === "application/pdf"
                      ? "Aperçu PDF"
                      : "Aperçu image"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      void downloadClientDocument(previewDocument.document)
                    }
                    className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                    aria-label={`Télécharger ${previewDocument.document.name}`}
                    title="Télécharger"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDocument(null)}
                    className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                    aria-label="Fermer l’aperçu"
                    title="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>
              <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-4">
                {previewDocument.document.mimeType === "application/pdf" ? (
                  <iframe
                    src={previewDocument.url}
                    title={`Aperçu de ${previewDocument.document.name}`}
                    className="h-full w-full rounded-lg border border-slate-200 bg-white"
                  />
                ) : (
                  <Image
                    src={previewDocument.url}
                    alt={previewDocument.document.name}
                    width={1600}
                    height={1200}
                    unoptimized
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
            Portefeuille du cabinet
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Dossiers clients
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {clients.length} dossier(s) suivis par votre équipe.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetClientForm();
            setShowForm((open) => !open);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {editingClientId ? "Modifier le dossier" : "Nouveau dossier"}
        </button>
      </header>

      {message && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      {clientActionError && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {clientActionError}
        </p>
      )}
      {!clientsAvailable && clientsError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          La liste des clients n’est pas disponible : {clientsError}
        </p>
      )}
      {!databaseConnected && databaseError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Connexion API indisponible : {databaseError}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={saveClient}
          className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 md:grid-cols-3"
        >
          <h2 className="text-base font-semibold text-slate-900 md:col-span-3">
            {editingClientId
              ? "Modifier le dossier client"
              : "Nouveau dossier client"}
          </h2>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Type de client *
            <select
              value={clientType}
              onChange={(event) =>
                setClientType(event.target.value as ClientDossier["type"])
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <option value="COMPANY">Entreprise</option>
              <option value="INDIVIDUAL">Personne physique</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            {clientType === "COMPANY"
              ? "Nom de l’entreprise *"
              : "Nom complet *"}
            <input
              autoFocus
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                clientType === "COMPANY" ? "Ex. Société ABC" : "Ex. Jean Mbuyi"
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Secteur d’activité *
            <input
              required
              maxLength={100}
              value={sector}
              onChange={(event) => setSector(event.target.value)}
              placeholder="Ex. Commerce"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Contact principal
            <input
              maxLength={160}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Nom ou service"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Téléphone
            <input
              maxLength={32}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+243…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            E-mail
            <input
              type="email"
              maxLength={160}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="contact@entreprise.cd"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Adresse
            <input
              maxLength={300}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Adresse du client"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            NIF
            <input
              maxLength={32}
              value={nif}
              onChange={(event) => setNif(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            RCCM
            <input
              maxLength={32}
              value={rccm}
              onChange={(event) => setRccm(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Statut du dossier
            <select
              value={clientStatus}
              onChange={(event) =>
                setClientStatus(event.target.value as ClientDossier["status"])
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <option>À jour</option>
              <option>À relancer</option>
              <option>En retard</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <button
              type="submit"
              disabled={savingClient || !clientsAvailable}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingClient
                ? "Enregistrement…"
                : editingClientId
                  ? "Enregistrer les modifications"
                  : "Créer le dossier"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetClientForm();
                setShowForm(false);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Annuler
            </button>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>
        </form>
      )}

      <label className="flex max-w-lg items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400">
        <Search className="h-4 w-4" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un client, secteur, contact..."
          className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none"
        />
      </label>

      {filteredClients.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <article
              key={client.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => void openClient(client.id)}
                className="w-full p-5 text-left"
                aria-label={`Ouvrir le dossier et l'historique de paiement de ${client.name}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
                    {client.name.slice(0, 2).toLocaleUpperCase("fr")}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {client.type === "INDIVIDUAL"
                        ? "Personne physique"
                        : "Entreprise"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${client.status === "À jour" ? "bg-emerald-100 text-emerald-700" : client.status === "En retard" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {client.status}
                    </span>
                  </div>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-900">
                  {client.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{client.sector}</p>
                <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />{" "}
                    {client.contact}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                    Ouvrir <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </button>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    editClient(client);
                  }}
                  disabled={!clientsAvailable || savingClient}
                  title={`Modifier ${client.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Modifier ${client.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeClient(client);
                  }}
                  disabled={!clientsAvailable || deletingClientId === client.id}
                  title={
                    deletingClientId === client.id
                      ? "Suppression en cours"
                      : `Supprimer ${client.name}`
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Supprimer ${client.name}`}
                >
                  {deletingClientId === client.id ? (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-rose-300 border-t-rose-700"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <p className="font-medium text-slate-800">
            Aucun dossier ne correspond à cette recherche.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Essayez un autre terme ou créez un nouveau dossier.
          </p>
        </div>
      )}
    </div>
  );
}
