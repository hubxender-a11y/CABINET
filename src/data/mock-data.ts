export type Kpi = {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "neutral" | "warning";
};

export type InvoiceRow = {
  invoice: string;
  client: string;
  amount: string;
  status: "Certifiée" | "En attente" | "Rejetée" | "Payée";
  date: string;
};

export const kpis: Kpi[] = [
  { label: "Chiffre d'affaires du jour", value: "CDF 4.8M", delta: "+12.4%", tone: "positive" },
  { label: "Ventes du mois", value: "CDF 38.4M", delta: "+8.1%", tone: "positive" },
  { label: "Factures certifiées", value: "184", delta: "92%", tone: "neutral" },
  { label: "Créances clients", value: "CDF 9.1M", delta: "-3.2%", tone: "warning" },
];

export const recentInvoices: InvoiceRow[] = [
  { invoice: "F-2025-1048", client: "Makala Market", amount: "CDF 1.240.000", status: "Certifiée", date: "2025-10-30" },
  { invoice: "F-2025-1047", client: "Boreal Pharma", amount: "CDF 840.000", status: "En attente", date: "2025-10-30" },
  { invoice: "F-2025-1046", client: "Sierra Logistics", amount: "CDF 2.150.000", status: "Payée", date: "2025-10-29" },
  { invoice: "F-2025-1045", client: "Kivu Foods", amount: "CDF 620.000", status: "Rejetée", date: "2025-10-29" },
];

export const customers = [
  { name: "Makala Market", type: "Commerce", balance: "CDF 1.8M", status: "Actif" },
  { name: "Boreal Pharma", type: "Pharmacie", balance: "CDF 1.1M", status: "Actif" },
  { name: "Kivu Foods", type: "Restaurant", balance: "CDF 640K", status: "À surveiller" },
  { name: "Sierra Logistics", type: "Transport", balance: "CDF 2.4M", status: "Actif" },
];

export const products = [
  { sku: "FG-001", name: "Farine de maïs 25kg", stock: 230, atRisk: false, price: "CDF 42.000" },
  { sku: "MED-024", name: "Gel hydroalcoolique", stock: 160, atRisk: false, price: "CDF 7.500" },
  { sku: "DIA-126", name: "Médicament anti-douleur", stock: 42, atRisk: true, price: "CDF 18.000" },
  { sku: "RSE-905", name: "Abonnement SecurX", stock: 98, atRisk: false, price: "CDF 120.000" },
];

export const fiscalStatuses = [
  { label: "DRAFT", count: 8 },
  { label: "PENDING_FISCALIZATION", count: 12 },
  { label: "CERTIFIED", count: 184 },
  { label: "REJECTED", count: 6 },
];

export const reports = [
  { month: "Jan", sales: 18, cash: 16 },
  { month: "Fév", sales: 22, cash: 19 },
  { month: "Mar", sales: 27, cash: 23 },
  { month: "Avr", sales: 24, cash: 25 },
  { month: "Mai", sales: 29, cash: 26 },
  { month: "Juin", sales: 31, cash: 27 },
  { month: "Juil", sales: 34, cash: 29 },
];
