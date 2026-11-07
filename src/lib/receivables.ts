import type { WorkspaceInvoice } from "@/components/workspace-store";

export const receivableLabels = {
  overdue: "En retard",
  today: "À échéance aujourd’hui",
  upcoming: "À venir",
  undated: "Sans échéance",
};

export type ReceivableStatus = keyof typeof receivableLabels;

export function invoiceBalance(invoice: WorkspaceInvoice) {
  if (["Brouillon", "Rejetée", "Payée"].includes(invoice.status)) return 0;
  return Math.max(0, Math.round((invoice.amount - (invoice.paidAmount ?? 0)) * 100) / 100);
}

export function kinshasaDate(now: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getReceivables(invoices: WorkspaceInvoice[], today: string) {
  return invoices
    .flatMap((invoice) => {
      const balance = invoiceBalance(invoice);
      if (!(balance > 0)) return [];

      const dueDate = invoice.dueDate?.slice(0, 10) || null;
      let status: ReceivableStatus = "undated";
      if (dueDate) {
        status = dueDate < today ? "overdue" : dueDate === today ? "today" : "upcoming";
      }
      return [{ invoice, balance, dueDate, status }];
    })
    .sort((first, second) =>
      (first.dueDate ?? "9999-12-31").localeCompare(second.dueDate ?? "9999-12-31") ||
      first.invoice.id.localeCompare(second.invoice.id, "fr", { numeric: true }),
    );
}
