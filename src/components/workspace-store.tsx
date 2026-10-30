"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";

export type ClientDossier = {
  id: string;
  name: string;
  sector: string;
  contact: string;
  status: "À jour" | "À relancer" | "En retard";
};

export type WorkspaceInvoice = {
  id: string;
  databaseId?: string;
  clientId: string;
  client: string;
  amount: number;
  paidAmount?: number;
  currency: "CDF" | "USD";
  status: "Certifiée" | "En attente" | "Rejetée" | "Payée" | "Brouillon";
  date: string;
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
  method: "CASH_USD" | "CASH_CDF" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY" | "OTHER";
  reference?: string | null;
  createdAt: string;
};

type PaymentApiRecord = {
  id: string;
  amount: string;
  currency: "CDF" | "USD";
  method: WorkspacePayment["method"];
  reference: string | null;
  createdAt: string;
  invoice: { id: string; invoiceNumber: string; currency: "CDF" | "USD" } | null;
  customer: { name: string } | null;
};

const hasConfiguredApi = Boolean(process.env.NEXT_PUBLIC_API_URL);

const initialClients: ClientDossier[] = [
  { id: "makala", name: "Makala Market", sector: "Commerce", contact: "Direction financière", status: "À jour" },
  { id: "boreal", name: "Boreal Pharma", sector: "Pharmacie", contact: "Comptabilité", status: "À relancer" },
  { id: "kivu", name: "Kivu Foods", sector: "Agroalimentaire", contact: "Gérance", status: "En retard" },
  { id: "sierra", name: "Sierra Logistics", sector: "Transport", contact: "Finance", status: "À jour" },
];

const initialInvoices: WorkspaceInvoice[] = [
  { id: "FAC-2026-1048", clientId: "makala", client: "Makala Market", amount: 1240000, currency: "CDF", status: "En attente", date: "2026-10-30" },
  { id: "FAC-2026-1047", clientId: "boreal", client: "Boreal Pharma", amount: 840000, currency: "CDF", status: "En attente", date: "2026-10-30" },
  { id: "FAC-2026-1046", clientId: "sierra", client: "Sierra Logistics", amount: 2150000, currency: "CDF", status: "Payée", date: "2026-10-29" },
  { id: "FAC-2026-1045", clientId: "kivu", client: "Kivu Foods", amount: 620000, currency: "CDF", status: "Rejetée", date: "2026-10-28" },
];

type CustomerApiRecord = {
  id: string;
  name: string;
  sector: string | null;
  contact: string | null;
  status: ClientDossier["status"];
};

type InvoiceApiRecord = {
  id: string;
  invoiceNumber: string;
  customer: { id: string; name: string };
  totalAmount: string;
  paidAmount: string;
  currency: "CDF" | "USD";
  fiscalStatus: string;
  issueDate: string;
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

type WorkspaceStore = {
  clients: ClientDossier[];
  invoices: WorkspaceInvoice[];
  databaseConnected: boolean;
  databaseError: string;
  addClient: (client: Omit<ClientDossier, "id">) => Promise<void>;
  addInvoice: (invoice: WorkspaceInvoice) => Promise<WorkspaceInvoice>;
  payments: WorkspacePayment[];
  addPayment: (payment: {
    invoice: WorkspaceInvoice;
    amount: string;
    method: WorkspacePayment["method"];
    reference?: string;
  }) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

function readStored<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Impossible de lire les données locales "${key}".`, error);
    return fallback;
  }
}

function mapInvoice(record: InvoiceApiRecord): WorkspaceInvoice {
  const paid =
    Number(record.paidAmount) >= Number(record.totalAmount) &&
    Number(record.totalAmount) > 0;
  const status: WorkspaceInvoice["status"] = paid
    ? "Payée"
    : record.fiscalStatus === "CERTIFIED"
      ? "Certifiée"
      : record.fiscalStatus === "REJECTED" || record.fiscalStatus === "CANCELLED"
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
    status,
    date: record.issueDate.slice(0, 10),
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

export function WorkspaceStoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientDossier[]>(hasConfiguredApi ? [] : initialClients);
  const [invoices, setInvoices] = useState<WorkspaceInvoice[]>(hasConfiguredApi ? [] : initialInvoices);
  const [payments, setPayments] = useState<WorkspacePayment[]>([]);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [databaseError, setDatabaseError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hasConfiguredApi) {
        setClients(readStored("factura-clients", initialClients));
        setInvoices(readStored("factura-invoices", initialInvoices));
        setPayments(readStored("factura-payments", []));
      }
      setHydrated(true);

      void Promise.all([
        apiRequest<CustomerApiRecord[]>("/customers"),
        apiRequest<InvoiceApiRecord[]>("/invoices"),
        apiRequest<PaymentApiRecord[]>("/payments"),
      ])
        .then(([customerRows, invoiceRows, paymentRows]) => {
          setClients(
            customerRows.map((customer) => ({
              id: customer.id,
              name: customer.name,
              sector: customer.sector ?? "À préciser",
              contact: customer.contact ?? "Contact à renseigner",
              status: customer.status,
            })),
          );
          setInvoices(invoiceRows.map(mapInvoice));
          setPayments(paymentRows.map((payment) => ({
            id: payment.id,
            invoiceId: payment.invoice?.id ?? "",
            invoiceNumber: payment.invoice?.invoiceNumber ?? "Paiement non affecté",
            customer: payment.customer?.name ?? "Client non renseigné",
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            reference: payment.reference,
            createdAt: payment.createdAt,
          })));
          setDatabaseConnected(true);
          setDatabaseError("");
        })
        .catch((error: unknown) => {
          console.error("Chargement de la base cabinet impossible.", error);
          setDatabaseConnected(false);
          setDatabaseError(
            hasConfiguredApi
              ? "API ou PostgreSQL indisponible. Aucune donnée locale de démonstration n’est affichée."
              : "API ou PostgreSQL indisponible : affichage des données locales de démonstration. Configurez et démarrez le backend pour utiliser la base du cabinet.",
          );
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("factura-clients", JSON.stringify(clients));
    window.localStorage.setItem("factura-invoices", JSON.stringify(invoices));
    window.localStorage.setItem("factura-payments", JSON.stringify(payments));
  }, [clients, hydrated, invoices, payments]);

  const value: WorkspaceStore = {
    clients,
    invoices,
    payments,
    databaseConnected,
    databaseError,
    addClient: async (client) => {
      let nextClient: ClientDossier;
      if (databaseConnected) {
        const created = await apiRequest<CustomerApiRecord>("/customers", {
          method: "POST",
          body: JSON.stringify(client),
        });
        nextClient = {
          id: created.id,
          name: created.name,
          sector: created.sector ?? "À préciser",
          contact: created.contact ?? "Contact à renseigner",
          status: created.status,
        };
      } else {
        if (hasConfiguredApi) {
          throw new Error("Le serveur du cabinet est indisponible. Réessayez plus tard.");
        }
        nextClient = { ...client, id: crypto.randomUUID() };
      }
      setClients((current) => [nextClient, ...current]);
    },
    addInvoice: async (invoice) => {
      let nextInvoice = invoice;
      if (databaseConnected) {
        const created = await apiRequest<InvoiceApiRecord>("/invoices", {
          method: "POST",
          body: JSON.stringify({
            customerId: invoice.clientId,
            period: invoice.period,
            concern: invoice.concern,
            madeAt: invoice.madeAt ?? "Kinshasa",
            issueDate: invoice.date,
            currency: invoice.currency,
            items: invoice.items?.map((item) => ({
              rubric: item.rubric,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toFixed(2),
            })),
          }),
        });
        nextInvoice = mapInvoice(created);
      } else if (hasConfiguredApi) {
        throw new Error("Le serveur du cabinet est indisponible. Réessayez plus tard.");
      }
      setInvoices((current) => [nextInvoice, ...current]);
      return nextInvoice;
    },
    addPayment: async ({ invoice, amount, method, reference }) => {
      if (databaseConnected) {
        if (!invoice.databaseId) {
          throw new Error("Cette facture n’a pas d’identifiant PostgreSQL.");
        }
        await apiRequest<PaymentApiRecord>("/payments", {
          method: "POST",
          body: JSON.stringify({
            invoiceId: invoice.databaseId,
            amount,
            method,
            reference,
          }),
        });
        const [invoiceRows, paymentRows] = await Promise.all([
          apiRequest<InvoiceApiRecord[]>("/invoices"),
          apiRequest<PaymentApiRecord[]>("/payments"),
        ]);
        setInvoices(invoiceRows.map(mapInvoice));
        setPayments(paymentRows.map((payment) => ({
          id: payment.id,
          invoiceId: payment.invoice?.id ?? "",
          invoiceNumber: payment.invoice?.invoiceNumber ?? "Paiement non affecté",
          customer: payment.customer?.name ?? "Client non renseigné",
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          reference: payment.reference,
          createdAt: payment.createdAt,
        })));
        return;
      }

      if (hasConfiguredApi) {
        throw new Error("Le serveur du cabinet est indisponible. Réessayez plus tard.");
      }
      setPayments((current) => [{
        id: crypto.randomUUID(),
        invoiceId: invoice.databaseId ?? invoice.id,
        invoiceNumber: invoice.id,
        customer: invoice.client,
        amount,
        currency: invoice.currency,
        method,
        reference: reference ?? null,
        createdAt: new Date().toISOString(),
      }, ...current]);
      setInvoices((current) =>
        current.map((entry) => {
          if (entry.id !== invoice.id) return entry;
          const nextPaidAmount = (entry.paidAmount ?? 0) + Number(amount);
          return {
            ...entry,
            paidAmount: nextPaidAmount,
            status: nextPaidAmount >= entry.amount ? "Payée" : entry.status,
          };
        }),
      );
    },
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceStore doit être utilisé dans WorkspaceStoreProvider.");
  }
  return context;
}
