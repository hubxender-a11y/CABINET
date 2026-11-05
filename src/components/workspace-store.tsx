"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, apiRequestBlob, AUTH_TOKEN_KEY } from "@/lib/api";

export type ClientDossier = {
  id: string;
  type: "COMPANY" | "INDIVIDUAL";
  name: string;
  sector: string;
  contact: string;
  status: "À jour" | "À relancer" | "En retard";
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nif?: string | null;
  rccm?: string | null;
  createdAt?: string;
};

export type ClientDossierDocument = {
  id: string;
  name: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  size: number;
  createdAt: string;
};

export type WorkspaceInvoice = {
  id: string;
  databaseId?: string;
  clientId: string;
  client: string;
  amount: number;
  paidAmount?: number;
  currency: "CDF" | "USD";
  exchangeRate?: string | null;
  status: "Certifiée" | "En attente" | "Rejetée" | "Payée" | "Brouillon";
  date: string;
  dueDate?: string | null;
  period?: string;
  concern?: string;
  madeAt?: string;
  items?: {
    rubric: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
};

export type WorkspacePayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  amount: string;
  currency: "CDF" | "USD";
  method:
    | "CASH_USD"
    | "CASH_CDF"
    | "BANK_TRANSFER"
    | "CARD"
    | "MOBILE_MONEY"
    | "OTHER";
  reference?: string | null;
  status?: string;
  invoiceTotal?: number;
  invoicePaidAmountAfter?: number | null;
  createdAt: string;
};

type PaymentApiRecord = {
  id: string;
  amount: string;
  currency: "CDF" | "USD";
  method: WorkspacePayment["method"];
  reference: string | null;
  status: string;
  invoicePaidAmountAfter: string | null;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    currency: "CDF" | "USD";
    totalAmount: string;
  } | null;
  customer: { name: string } | null;
};

const hasConfiguredApi = Boolean(process.env.NEXT_PUBLIC_API_URL);

type CustomerApiRecord = {
  id: string;
  type: ClientDossier["type"];
  name: string;
  sector: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nif: string | null;
  rccm: string | null;
  status: ClientDossier["status"];
  createdAt: string;
};

type InvoiceApiRecord = {
  id: string;
  invoiceNumber: string;
  customer: { id: string; name: string };
  totalAmount: string;
  paidAmount: string;
  currency: "CDF" | "USD";
  fiscalStatus: string;
  exchangeRate?: string | null;
  issueDate: string;
  dueDate?: string | null;
  period?: string;
  concern?: string;
  madeAt?: string;
  items?: {
    rubric: string;
    quantity: string | number;
    unitPrice: string | number;
    total: string | number;
  }[];
};

type StatementPaymentApiRecord = {
  id: string;
  amount: string;
  currency: "CDF" | "USD";
  method: WorkspacePayment["method"];
  reference: string | null;
  status: string;
  invoicePaidAmountAfter: string | null;
  createdAt: string;
};

type CustomerStatementApiRecord = {
  customer: CustomerApiRecord;
  invoices: Array<
    Omit<InvoiceApiRecord, "customer"> & {
      payments: StatementPaymentApiRecord[];
    }
  >;
  payments: PaymentApiRecord[];
};

export type WorkspaceClientStatement = {
  client: ClientDossier;
  invoices: Array<WorkspaceInvoice & { payments: WorkspacePayment[] }>;
  payments: WorkspacePayment[];
};

type WorkspaceStore = {
  clients: ClientDossier[];
  invoices: WorkspaceInvoice[];
  databaseConnected: boolean;
  databaseError: string;
  clientsAvailable: boolean;
  clientsError: string;
  getClientDocuments: (clientId: string) => Promise<ClientDossierDocument[]>;
  addClientDocument: (
    clientId: string,
    file: File,
  ) => Promise<ClientDossierDocument>;
  deleteClientDocument: (clientId: string, documentId: string) => Promise<void>;
  getClientDocumentContent: (
    clientId: string,
    documentId: string,
    download?: boolean,
  ) => Promise<Blob>;
  getClientStatement: (clientId: string) => Promise<WorkspaceClientStatement>;
  addClient: (client: Omit<ClientDossier, "id" | "createdAt">) => Promise<void>;
  updateClient: (
    clientId: string,
    changes: Partial<Omit<ClientDossier, "id" | "createdAt">>,
  ) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  addInvoice: (invoice: WorkspaceInvoice) => Promise<WorkspaceInvoice>;
  deleteInvoice: (invoice: WorkspaceInvoice) => Promise<void>;
  payments: WorkspacePayment[];
  addPayment: (payment: {
    invoice: WorkspaceInvoice;
    amount: string;
    method: WorkspacePayment["method"];
    reference?: string;
  }) => Promise<WorkspacePayment>;
};

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

function mapInvoice(record: InvoiceApiRecord): WorkspaceInvoice {
  const paid =
    Number(record.paidAmount) >= Number(record.totalAmount) &&
    Number(record.totalAmount) > 0;
  const status: WorkspaceInvoice["status"] = paid
    ? "Payée"
    : record.fiscalStatus === "CERTIFIED"
      ? "Certifiée"
      : record.fiscalStatus === "REJECTED" ||
          record.fiscalStatus === "CANCELLED"
        ? "Rejetée"
        : record.fiscalStatus === "PENDING_FISCALIZATION"
          ? "En attente"
          : "Brouillon";

  return {
    id: record.invoiceNumber,
    databaseId: record.id,
    clientId: record.customer.id,
    client: record.customer.name,
    amount: Number(record.totalAmount),
    paidAmount: Number(record.paidAmount),
    currency: record.currency,
    exchangeRate: record.exchangeRate ?? null,
    status,
    date: record.issueDate.slice(0, 10),
    dueDate: record.dueDate,
    period: record.period,
    concern: record.concern,
    madeAt: record.madeAt,
    items: record.items?.map((item) => ({
      rubric: item.rubric,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
  };
}

function mapPayment(record: PaymentApiRecord): WorkspacePayment {
  return {
    id: record.id,
    invoiceId: record.invoice?.id ?? "",
    invoiceNumber: record.invoice?.invoiceNumber ?? "Paiement non affecté",
    customer: record.customer?.name ?? "Client non renseigné",
    amount: record.amount,
    currency: record.currency,
    method: record.method,
    reference: record.reference,
    status: record.status,
    invoiceTotal: record.invoice?.totalAmount
      ? Number(record.invoice.totalAmount)
      : undefined,
    invoicePaidAmountAfter: record.invoicePaidAmountAfter
      ? Number(record.invoicePaidAmountAfter)
      : null,
    createdAt: record.createdAt,
  };
}

function mapCustomer(record: CustomerApiRecord): ClientDossier {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    sector: record.sector ?? "À préciser",
    contact: record.contact ?? "Contact à renseigner",
    status: record.status,
    phone: record.phone,
    email: record.email,
    address: record.address,
    nif: record.nif,
    rccm: record.rccm,
    createdAt: record.createdAt,
  };
}

export function WorkspaceStoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientDossier[]>([]);
  const [invoices, setInvoices] = useState<WorkspaceInvoice[]>([]);
  const [payments, setPayments] = useState<WorkspacePayment[]>([]);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [databaseError, setDatabaseError] = useState("");
  const [clientsAvailable, setClientsAvailable] = useState(false);
  const [clientsError, setClientsError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hasConfiguredApi) {
        setDatabaseError(
          "API du cabinet non configurée. Aucune donnée métier ne sera enregistrée.",
        );
        return;
      }
      if (!window.localStorage.getItem(AUTH_TOKEN_KEY)) return;

      void Promise.allSettled([
        apiRequest<CustomerApiRecord[]>("/customers"),
        apiRequest<InvoiceApiRecord[]>("/invoices"),
        apiRequest<PaymentApiRecord[]>("/payments"),
      ]).then(([customerResult, invoiceResult, paymentResult]) => {
        if (customerResult.status === "fulfilled") {
          setClients(customerResult.value.map(mapCustomer));
          setClientsAvailable(true);
          setClientsError("");
        } else {
          console.error(
            "Chargement des dossiers clients impossible.",
            customerResult.reason,
          );
          setClientsAvailable(false);
          setClientsError(
            customerResult.reason instanceof Error
              ? customerResult.reason.message
              : "Impossible de charger les dossiers clients.",
          );
        }

        if (invoiceResult.status === "fulfilled") {
          setInvoices(invoiceResult.value.map(mapInvoice));
        } else {
          console.error(
            "Chargement des factures impossible.",
            invoiceResult.reason,
          );
        }

        if (paymentResult.status === "fulfilled") {
          setPayments(paymentResult.value.map(mapPayment));
        } else {
          console.error(
            "Chargement des paiements impossible.",
            paymentResult.reason,
          );
        }

        const allRequestsSucceeded =
          customerResult.status === "fulfilled" &&
          invoiceResult.status === "fulfilled" &&
          paymentResult.status === "fulfilled";
        setDatabaseConnected(allRequestsSucceeded);
        setDatabaseError(
          allRequestsSucceeded
            ? ""
            : "Certains services API sont indisponibles. Consultez les données chargées et réessayez les actions concernées.",
        );
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const value: WorkspaceStore = {
    clients,
    invoices,
    payments,
    databaseConnected,
    databaseError,
    clientsAvailable,
    clientsError,
    getClientDocuments: async (clientId) =>
      apiRequest<ClientDossierDocument[]>(`/customers/${clientId}/documents`),
    addClientDocument: async (clientId, file) => {
      if (!clientsAvailable) {
        throw new Error(
          "Le service client est indisponible. Réessayez plus tard.",
        );
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
          reject(new Error("Impossible de lire ce document."));
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Le document sélectionné est invalide."));
            return;
          }
          resolve(reader.result);
        };
        reader.readAsDataURL(file);
      });
      const [, data] = dataUrl.split(",", 2);
      if (!data) throw new Error("Le document sélectionné est invalide.");
      return apiRequest<ClientDossierDocument>(
        `/customers/${clientId}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
            data,
          }),
        },
      );
    },
    deleteClientDocument: async (clientId, documentId) => {
      await apiRequest<{ id: string }>(
        `/customers/${clientId}/documents/${documentId}`,
        { method: "DELETE" },
      );
    },
    getClientDocumentContent: (clientId, documentId, download = false) =>
      apiRequestBlob(
        `/customers/${clientId}/documents/${documentId}/content`,
        download,
      ),
    getClientStatement: async (clientId) => {
      const record = await apiRequest<CustomerStatementApiRecord>(
        `/customers/${clientId}/statement`,
      );
      const client = mapCustomer(record.customer);
      return {
        client,
        invoices: record.invoices.map((invoice) => ({
          ...mapInvoice({
            ...invoice,
            customer: { id: client.id, name: client.name },
          }),
          payments: invoice.payments.map((payment) => ({
            ...payment,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            customer: client.name,
            invoicePaidAmountAfter:
              payment.invoicePaidAmountAfter === null
                ? null
                : Number(payment.invoicePaidAmountAfter),
          })),
        })),
        payments: record.payments.map(mapPayment),
      };
    },
    addClient: async (client) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. Le client n’a pas été enregistré.",
        );
      }
      if (!clientsAvailable) {
        throw new Error(
          "Le serveur du cabinet est indisponible. Réessayez plus tard.",
        );
      }
      const created = await apiRequest<CustomerApiRecord>("/customers", {
        method: "POST",
        body: JSON.stringify({
          type: client.type,
          status: client.status,
          name: client.name,
          sector: client.sector,
          contact: client.contact,
          phone: client.phone ?? undefined,
          email: client.email ?? undefined,
          address: client.address ?? undefined,
          nif: client.nif ?? undefined,
          rccm: client.rccm ?? undefined,
        }),
      });
      const nextClient = mapCustomer(created);
      setClients((current) => [nextClient, ...current]);
    },
    updateClient: async (clientId, changes) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. Le client n’a pas été modifié.",
        );
      }
      if (!clientsAvailable) {
        throw new Error(
          "Le serveur du cabinet est indisponible. Réessayez plus tard.",
        );
      }
      const updated = await apiRequest<CustomerApiRecord>(
        `/customers/${clientId}`,
        {
          method: "PATCH",
          body: JSON.stringify(changes),
        },
      );
      const nextClient = mapCustomer(updated);
      setClients((current) =>
        current.map((client) => (client.id === clientId ? nextClient : client)),
      );
    },
    deleteClient: async (clientId) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. Le client n’a pas été supprimé.",
        );
      }
      if (!clientsAvailable) {
        throw new Error(
          "Le serveur du cabinet est indisponible. Réessayez plus tard.",
        );
      }
      await apiRequest<{ id: string; deletedAt: string }>(
        `/customers/${clientId}`,
        { method: "DELETE" },
      );
      setClients((current) =>
        current.filter((client) => client.id !== clientId),
      );
    },
    addInvoice: async (invoice) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. La facture n’a pas été enregistrée.",
        );
      }
      if (!databaseConnected) {
        throw new Error(
          "Le serveur du cabinet est indisponible. Réessayez plus tard.",
        );
      }
      const created = await apiRequest<InvoiceApiRecord>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerId: invoice.clientId,
          period: invoice.period,
          concern: invoice.concern,
          madeAt: invoice.madeAt ?? "Kinshasa",
          issueDate: invoice.date,
          dueDate: invoice.dueDate || undefined,
          fiscalStatus:
            invoice.status === "En attente" ? "PENDING_FISCALIZATION" : "DRAFT",
          currency: invoice.currency,
          items: invoice.items?.map((item) => ({
            rubric: item.rubric,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toFixed(2),
          })),
        }),
      });
      const nextInvoice = mapInvoice(created);
      setInvoices((current) => [nextInvoice, ...current]);
      return nextInvoice;
    },
    deleteInvoice: async (invoice) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. La facture n’a pas été supprimée.",
        );
      }
      if (!databaseConnected) {
        throw new Error(
          "Le serveur du cabinet est indisponible. Réessayez plus tard.",
        );
      }
      if (!invoice.databaseId) {
        throw new Error(
          "Cette facture n’a pas d’identifiant serveur et ne peut pas être supprimée.",
        );
      }

      const deleted = await apiRequest<{
        id: string;
        deletedPaymentIds: string[];
      }>(`/invoices/${invoice.databaseId}`, { method: "DELETE" });
      setInvoices((current) =>
        current.filter((item) => item.databaseId !== deleted.id),
      );
      const deletedPaymentIds = new Set(deleted.deletedPaymentIds);
      setPayments((current) =>
        current.filter((payment) => !deletedPaymentIds.has(payment.id)),
      );
    },
    addPayment: async ({ invoice, amount, method, reference }) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. Le règlement n’a pas été enregistré.",
        );
      }
      if (!databaseConnected) {
        throw new Error(
          "Le serveur du cabinet est indisponible. Réessayez plus tard.",
        );
      }
      if (!invoice.databaseId) {
        throw new Error("Cette facture n’a pas d’identifiant PostgreSQL.");
      }
      const created = await apiRequest<PaymentApiRecord>("/payments", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: invoice.databaseId,
          amount,
          method,
          reference,
        }),
      });
      const savedPayment = mapPayment(created);
      setInvoices((current) =>
        current.map((item) => {
          if (item.databaseId !== invoice.databaseId) return item;
          const paidAmount = (item.paidAmount ?? 0) + Number(amount);
          return {
            ...item,
            paidAmount,
            ...(paidAmount >= item.amount ? { status: "Payée" as const } : {}),
          };
        }),
      );
      setPayments((current) => [savedPayment, ...current].slice(0, 200));
      return savedPayment;
    },
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceStore() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error(
      "useWorkspaceStore doit être utilisé dans WorkspaceStoreProvider.",
    );
  }
  return context;
}
