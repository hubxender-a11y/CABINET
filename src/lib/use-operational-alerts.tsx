"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { apiRequest } from "@/lib/api";
import { formatMoney } from "@/lib/formatting";
import { getReceivables } from "@/lib/receivables";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

type Currency = "CDF" | "USD";
type OrderStatus = "SUBMITTED" | "FINANCE_APPROVED" | "APPROVED" | "PAID" | "REJECTED";

type PaymentOrderAlertRecord = {
  id: string;
  orderNumber: string;
  date: string;
  beneficiary: string;
  amount: string;
  currency: Currency;
  status: OrderStatus;
};

type CashVoucherAlertRecord = {
  id: string;
  voucherNumber: string;
  date: string;
  beneficiary: string;
  amount: string;
  currency: Currency;
  status: "PENDING_APPROVAL" | "READY_FOR_PAYMENT" | "ISSUED" | "CANCELLED";
  managerApprovalName?: string | null;
};

export type OperationalAlert = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: "order" | "invoice" | "voucher";
  urgent?: boolean;
};

const orderStatusLabel: Record<OrderStatus, string> = {
  SUBMITTED: "À examiner par les Finances",
  FINANCE_APPROVED: "À examiner par l’Associé-Gérant",
  APPROVED: "Validée · paiement à effectuer",
  PAID: "Payée",
  REJECTED: "Rejetée",
};

type OperationalAlertsValue = {
  alerts: OperationalAlert[];
  activeOrders: PaymentOrderAlertRecord[];
  receivables: ReturnType<typeof getReceivables>;
  recentVouchers: CashVoucherAlertRecord[];
  unpaidCount: number;
  unpaidByCurrency: Record<Currency, number>;
  orderCount: number;
  voucherCount: number;
  notificationCount: number;
  loading: boolean;
  hasLoadError: boolean;
};

const OperationalAlertsContext = createContext<OperationalAlertsValue | null>(null);

export function OperationalAlertsProvider({ children }: { children: ReactNode }) {
  const { invoices, databaseConnected } = useWorkspaceStore();
  const today = useKinshasaDate();
  const [orders, setOrders] = useState<PaymentOrderAlertRecord[]>([]);
  const [vouchers, setVouchers] = useState<CashVoucherAlertRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    if (!databaseConnected) {
      return;
    }

    let active = true;
    const refresh = async () => {
      const [orderResult, voucherResult] = await Promise.allSettled([
        apiRequest<PaymentOrderAlertRecord[]>("/payment-orders"),
        apiRequest<CashVoucherAlertRecord[]>("/cash-vouchers"),
      ]);
      if (!active) return;
      if (orderResult.status === "fulfilled") setOrders(orderResult.value);
      if (voucherResult.status === "fulfilled") setVouchers(voucherResult.value);
      setHasLoadError(orderResult.status === "rejected" || voucherResult.status === "rejected");
      setLoaded(true);
    };

    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(() => void refresh(), 45_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [databaseConnected]);

  const receivables = useMemo(
    () => (today ? getReceivables(invoices, today) : []),
    [invoices, today],
  );
  const activeOrders = useMemo(
    () =>
      (databaseConnected ? orders : []).filter((order) =>
        ["SUBMITTED", "FINANCE_APPROVED", "APPROVED"].includes(order.status),
      ),
    [databaseConnected, orders],
  );
  const recentVouchers = useMemo(
    () => (databaseConnected ? vouchers : []).filter((voucher) => ["READY_FOR_PAYMENT", "ISSUED"].includes(voucher.status)).slice(0, 3),
    [databaseConnected, vouchers],
  );
  const alerts = useMemo<OperationalAlert[]>(() => {
    const orderAlerts: OperationalAlert[] = activeOrders.map((order) => ({
      id: `order-${order.id}`,
      title: `${order.orderNumber} · ${order.beneficiary}`,
      detail: `${orderStatusLabel[order.status]} · ${formatMoney(order.amount, order.currency)}`,
      href: "/payment-orders",
      kind: "order",
      urgent: order.status === "FINANCE_APPROVED" || order.status === "APPROVED",
    }));
    const invoiceAlerts: OperationalAlert[] = receivables.map(({ invoice, balance, status }) => ({
      id: `invoice-${invoice.databaseId ?? invoice.id}`,
      title: `${invoice.client} · facture ${invoice.id}`,
      detail: `${formatMoney(balance, invoice.currency)} à recevoir${status === "overdue" ? " · en retard" : ""}`,
      href: "/recouvrement",
      kind: "invoice",
      urgent: status === "overdue",
    }));
    const voucherAlerts: OperationalAlert[] = recentVouchers.map((voucher) => ({
      id: `voucher-${voucher.id}`,
      title: `${voucher.voucherNumber} · ${voucher.beneficiary}`,
      detail: `${voucher.status === "READY_FOR_PAYMENT" ? `Approuvé par ${voucher.managerApprovalName ?? "l’Associé-Gérant"} · à payer` : "Bon de sortie payé"} · ${formatMoney(voucher.amount, voucher.currency)}`,
      href: "/cash-vouchers",
      kind: "voucher",
      urgent: voucher.status === "READY_FOR_PAYMENT",
    }));
    return [...orderAlerts, ...invoiceAlerts, ...voucherAlerts];
  }, [activeOrders, receivables, recentVouchers]);

  const unpaidByCurrency = receivables.reduce(
    (totals, item) => ({
      ...totals,
      [item.invoice.currency]: totals[item.invoice.currency] + item.balance,
    }),
    { CDF: 0, USD: 0 },
  );

  const value: OperationalAlertsValue = {
    alerts,
    activeOrders,
    receivables,
    recentVouchers,
    unpaidCount: receivables.length,
    unpaidByCurrency,
    orderCount: activeOrders.length,
    voucherCount: recentVouchers.length,
    notificationCount: activeOrders.length + receivables.length + recentVouchers.length,
    loading: databaseConnected && !loaded,
    hasLoadError: !databaseConnected || hasLoadError,
  };

  return (
    <OperationalAlertsContext.Provider value={value}>
      {children}
    </OperationalAlertsContext.Provider>
  );
}

export function useOperationalAlerts() {
  const value = useContext(OperationalAlertsContext);
  if (!value) {
    throw new Error("useOperationalAlerts doit être utilisé dans OperationalAlertsProvider.");
  }
  return value;
}
