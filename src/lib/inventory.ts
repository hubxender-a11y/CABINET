export type ProductRecord = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  description?: string | null;
  purchasePrice: string;
  sellPrice: string;
  stock: string;
  alertLevel: string;
};

export type SupplierRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  nif: string | null;
};

export type PurchaseRecord = {
  id: string;
  number: string;
  status: "DRAFT" | "RECEIVED";
  total: string;
  currency: string;
  createdAt: string;
  supplier: { id: string; name: string };
  items: {
    id: string;
    name: string;
    quantity: string;
    unitPrice: string;
    total: string;
    product: { id: string; sku: string; name: string } | null;
  }[];
};

export type StockMovement = {
  id: string;
  movementType: string;
  quantity: string;
  unitCost: string | null;
  description: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string };
};

export function formatMoney(value: string | number, currency: string) {
  return new Intl.NumberFormat("fr-CD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatQuantity(value: string | number) {
  return new Intl.NumberFormat("fr-CD", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}
