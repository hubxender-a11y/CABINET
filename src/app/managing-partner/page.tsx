"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CircleAlert,
  Download,
  FileText,
  RefreshCw,
  ScrollText,
  Wallet,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

type Currency = "CDF" | "USD";
type OrderStatus = "SUBMITTED" | "FINANCE_APPROVED" | "APPROVED" | "PAID" | "REJECTED";
type Order = {
  id: string;
  companyId: string;
  orderNumber: string;
  date: string;
  requestingService: string;
  amount: string;
  amountInWords: string;
  currency: Currency;
  reason: string;
  beneficiary: string;
  status: OrderStatus;
  managerVisaName?: string | null;
  managerVisaAt?: string | null;
  rejectionReason?: string | null;
  attachment: { id: string; fileName: string; mimeType: string; size: number } | null;
  company: { id: string; legalName: string; tradeName: string | null; logoUrl: string | null };
};
type CompanyReport = {
  id: string;
  name: string;
  legalName: string;
  logoUrl: string | null;
  currencyCode: string;
  counts: { clients: number; invoices: number; payments: number; expenses: number; paymentOrders: number; pendingPaymentOrders: number; cashVouchers: number };
  invoicesByCurrency: { currency: string; count: number; invoiced: string; paid: string }[];
  paymentsByCurrency: { currency: string; received: string }[];
};
type ActivityRow = { id: string; action: string; details: unknown; createdAt: string; company: { id: string; name: string }; user: { name: string } | null };
type Overview = { generatedAt: string; summary: { companies: number; invoices: number; pendingPaymentOrders: number }; companies: CompanyReport[]; paymentOrders: Order[]; recentActivity: ActivityRow[] };
type Notice = { id: string; title: string; message: string; read: boolean; createdAt: string; company: { id: string; legalName: string; tradeName: string | null } };
type AttachmentPreview = { name: string; mimeType: string; url: string };
type CompanyDetails = {
  company: { id: string; name: string; legalName: string; currencyCode: string };
  accounts: { id: string; code: string; name: string; currency: string; balance: string; provisionAvailable: string; isActive: boolean }[];
  cashMovements: { id: string; date: string; direction: "IN" | "OUT"; amount: string; sourceType: string; description: string; reference: string | null; cashAccount: { code: string; name: string; currency: string } }[];
  fundings: { id: string; date: string; amount: string; description: string; reference: string | null; cashAccount: { code: string; name: string; currency: string } }[];
  settlements: { id: string; amount: string; currency: string; method: string; reference: string | null; createdAt: string; customer: { name: string } | null; invoice: { invoiceNumber: string } | null }[];
  unpaidInvoices: { id: string; invoiceNumber: string; issueDate: string; dueDate: string | null; currency: string; totalAmount: string; paidAmount: string; balanceDue: string; customer: { name: string } }[];
  pendingCashVouchers: { id: string; voucherNumber: string; date: string; beneficiary: string; category: string; amount: string; currency: string; status: string }[];
  activityJournal: ActivityRow[];
  accountingNote: string;
};
type DetailTab = "funding" | "cash" | "journal" | "ledger" | "settlements" | "pending";

const statusLabels: Record<OrderStatus, string> = {
  SUBMITTED: "À examiner",
  FINANCE_APPROVED: "À examiner",
  APPROVED: "Approuvée · à payer",
  PAID: "Payée",
  REJECTED: "Rejetée",
};

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("fr-CD", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "CDF",
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(value) || 0);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kinshasa",
  }).format(new Date(value));
}

function orderCompanyName(company: Order["company"]) {
  return company.tradeName || company.legalName;
}

function actionName(value: string) {
  return value.toLocaleLowerCase("fr-CD").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("fr-CD"));
}

function detailsText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/password|secret|token|signature/i.test(key))
    .slice(0, 3)
    .map(([key, item]) => `${key} : ${typeof item === "string" ? item : JSON.stringify(item)}`)
    .join(" · ");
}

export default function ManagingPartnerPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("funding");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [overviewData, notificationData] = await Promise.all([
        apiRequest<Overview>("/managing-partner/overview"),
        apiRequest<Notice[]>("/notifications"),
      ]);
      setOverview(overviewData);
      setNotices(notificationData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les données globales sont indisponibles.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview.url); }, [attachmentPreview]);
  useEffect(() => {
    if (companyFilter === "all") { setCompanyDetails(null); return; }
    let active = true;
    setDetailsLoading(true);
    apiRequest<CompanyDetails>(`/managing-partner/companies/${companyFilter}/details`)
      .then((data) => { if (active) setCompanyDetails(data); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Le détail de la société est indisponible."); })
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [companyFilter, overview?.generatedAt]);

  const orders = overview?.paymentOrders ?? [];
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesCompany = companyFilter === "all" || order.companyId === companyFilter;
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "pending" && ["SUBMITTED", "FINANCE_APPROVED"].includes(order.status))
      || order.status === statusFilter;
    return matchesCompany && matchesStatus;
  }), [companyFilter, orders, statusFilter]);
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const visibleOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
  const unreadCount = notices.filter((notice) => !notice.read).length;

  async function decide(order: Order, decision: "approve" | "reject", reason?: string) {
    setBusyId(order.id);
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/managing-partner/payment-orders/${order.id}/${decision}`, {
        method: "POST",
        ...(reason ? { body: JSON.stringify({ reason }) } : {}),
      });
      setRejecting(null);
      setRejectReason("");
      setSuccess(decision === "approve" ? `${order.orderNumber} approuvée et signée pour ${orderCompanyName(order.company)}.` : `${order.orderNumber} rejetée.`);
      await refresh(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La décision n’a pas pu être enregistrée.");
    } finally {
      setBusyId("");
    }
  }

  async function previewAttachment(order: Order) {
    setError("");
    try {
      const file = await apiRequest<{ fileName: string; mimeType: string; data: string }>(`/managing-partner/payment-orders/${order.id}/attachment`);
      const bytes = Uint8Array.from(atob(file.data), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      setAttachmentPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { name: file.fileName, mimeType: file.mimeType, url };
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’état de besoin n’a pas pu être ouvert.");
    }
  }

  async function markNoticeRead(notice: Notice) {
    try {
      await apiRequest(`/notifications/${notice.id}/read`, { method: "PATCH" });
      setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, read: true } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La notification n’a pas pu être actualisée.");
    }
  }

  async function markAllNoticesRead() {
    try {
      await apiRequest("/notifications/read-all", { method: "PATCH" });
      setNotices((current) => current.map((notice) => ({ ...notice, read: true })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les notifications n’ont pas pu être actualisées.");
    }
  }

  const pendingOrders = orders.filter((order) => ["SUBMITTED", "FINANCE_APPROVED"].includes(order.status));

  return (
    <main className="platform-admin-page managing-partner-page space-y-7">
      <header className="platform-admin-hero">
        <div><p className="platform-admin-eyebrow">ESPACE ASSOCIÉ-GÉRANT · VUE INTER-SOCIÉTÉS</p><h1>Suivi des opérations</h1><p>Rapports, notifications et visas des ordres de paiement de toutes les entreprises.</p></div>
        <button type="button" onClick={() => void refresh(true)} disabled={refreshing} className="platform-admin-refresh"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Actualiser</button>
      </header>

      <nav className="platform-admin-section-nav" aria-label="Suivi associé-gérant">
        <a href="#overview"><Building2 size={16} />Vue globale</a>
        <a href="#payment-orders"><ScrollText size={16} />Ordres de paiement{pendingOrders.length > 0 && <b>{pendingOrders.length}</b>}</a>
        <a href="#reports"><Wallet size={16} />Rapports</a>
        <a href="#notifications"><Bell size={16} />Notifications{unreadCount > 0 && <b>{unreadCount}</b>}</a>
      </nav>

      {error && <div role="alert" className="platform-admin-error"><CircleAlert size={17} />{error}</div>}
      {success && <div role="status" className="platform-admin-success"><Check size={17} />{success}</div>}

      <section id="overview" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading"><div><p>VUE GÉNÉRALE</p><h2>Activité de toutes les sociétés</h2></div><span className="text-sm text-slate-500">{overview ? dateTime(overview.generatedAt) : ""}</span></div>
        <div className="platform-admin-metrics">
          {[
            { label: "Entreprises", value: overview?.summary.companies ?? "—", icon: Building2, color: "blue" },
            { label: "Factures enregistrées", value: overview?.summary.invoices ?? "—", icon: FileText, color: "teal" },
            { label: "OP à examiner", value: overview?.summary.pendingPaymentOrders ?? "—", icon: ScrollText, color: "amber" },
            { label: "Notifications non lues", value: unreadCount, icon: Bell, color: "violet" },
          ].map(({ label, value, icon: Icon, color }) => <article className={`platform-admin-metric is-${color}`} key={label}><span className="platform-admin-metric-icon"><Icon size={18} /></span><span className="platform-admin-metric-label">{label}</span><strong>{value}</strong></article>)}
        </div>
        <div className="platform-admin-company-list mt-4">
          {(overview?.companies ?? []).map((company) => <article key={company.id} className="platform-admin-company-row"><span className="platform-admin-company-logo">{company.logoUrl ? <img src={company.logoUrl} alt="" width={38} height={38} /> : <Building2 size={18} />}</span><span className="min-w-0 flex-1"><strong>{company.name}</strong><small>{company.legalName}</small></span><span className="platform-admin-company-state">{company.counts.pendingPaymentOrders} OP en attente</span><a className="platform-admin-text-button" href="#reports" onClick={() => setCompanyFilter(company.id)}>Détails <ArrowRight size={15} /></a></article>)}
          {!loading && !overview?.companies.length && <p className="platform-admin-empty">Aucune entreprise enregistrée.</p>}
        </div>
      </section>

      <section id="payment-orders" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading"><div><p>VALIDATIONS</p><h2>Registre des ordres de paiement</h2></div><span className="platform-admin-company-state">{pendingOrders.length} à examiner</span></div>
        <div className="flex flex-wrap gap-3">
          <select aria-label="Filtrer par entreprise" className="platform-admin-select" value={companyFilter} onChange={(event) => { setCompanyFilter(event.target.value); setPage(1); }}><option value="all">Toutes les entreprises</option>{(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
          <select aria-label="Filtrer par statut" className="platform-admin-select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="pending">À examiner</option><option value="APPROVED">Approuvées · à payer</option><option value="PAID">Payées</option><option value="REJECTED">Rejetées</option><option value="all">Tous les statuts</option></select>
        </div>
        <div className="mt-4 grid gap-3">
          {visibleOrders.map((order) => <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{orderCompanyName(order.company)} · {order.orderNumber}</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{order.beneficiary}</h3><p className="mt-1 text-sm text-slate-600">{order.reason}</p></div><div className="text-right"><strong className="text-lg text-slate-900">{money(order.amount, order.currency)}</strong><p className="text-xs text-slate-500">{dateTime(order.date)}</p></div></div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3"><span>Service : {order.requestingService}</span><span>Demandeur : {order.beneficiary}</span><span className="font-medium text-amber-700">{statusLabels[order.status]}</span></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {order.attachment && <button type="button" onClick={() => void previewAttachment(order)} className="platform-admin-text-button"><FileText size={15} />Voir l’état de besoin</button>}
              {["SUBMITTED", "FINANCE_APPROVED"].includes(order.status) && <><button type="button" disabled={busyId === order.id} onClick={() => { if (window.confirm(`Approuver et signer ${order.orderNumber} pour ${orderCompanyName(order.company)} ?`)) void decide(order, "approve"); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{busyId === order.id ? "Traitement…" : "Approuver et signer"}</button><button type="button" disabled={busyId === order.id} onClick={() => { setRejecting(order); setRejectReason(""); }} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Rejeter</button></>}
              {order.status === "APPROVED" && order.managerVisaName && <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">Signée par {order.managerVisaName}{order.managerVisaAt ? ` · ${dateTime(order.managerVisaAt)}` : ""}</span>}
              {order.status === "REJECTED" && order.rejectionReason && <span className="text-sm text-rose-700">Motif : {order.rejectionReason}</span>}
            </div>
          </article>)}
          {!loading && !visibleOrders.length && <div className="platform-admin-empty">Aucune OP ne correspond à ce filtre.</div>}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>{filteredOrders.length} dossier(s) · page {page} / {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} className="platform-admin-text-button" onClick={() => setPage((current) => current - 1)}>Précédent</button><button type="button" disabled={page >= pageCount} className="platform-admin-text-button" onClick={() => setPage((current) => current + 1)}>Suivant</button></div></div>
      </section>

      <section id="reports" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading"><div><p>RAPPORTS FINANCIERS</p><h2>Exploration détaillée d’une société</h2></div><ArrowDownRight size={20} className="text-slate-400" /></div>
        <label className="mb-4 flex max-w-xl flex-col gap-1 text-sm font-medium text-slate-700">Société à consulter<select className="platform-admin-select" value={companyFilter} onChange={(event) => { setCompanyFilter(event.target.value); setPage(1); }}><option value="all">Sélectionner une société…</option>{(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        {companyDetails && <><div className="platform-admin-settings-card"><div className="platform-admin-settings-title"><div><h3>{companyDetails.company.name}</h3><small>{companyDetails.company.legalName}</small></div><span>{companyDetails.company.currencyCode}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{companyDetails.accounts.map((account) => <div key={account.id} className="rounded-xl border border-slate-200 bg-white p-4"><small className="block text-xs text-slate-500">{account.name} · {account.code}</small><strong className="mt-1 block text-lg text-slate-900">{money(account.balance, account.currency)}</strong><span className="text-xs text-slate-600">Fonds OP disponibles : {money(account.provisionAvailable, account.currency)}</span></div>)}</div></div>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Détails financiers de la société">{([["funding", "Approvisionnements"], ["cash", "Livre de caisse"], ["journal", "Journal d’activité"], ["ledger", "Grand livre opérationnel"], ["settlements", "Règlements clients"], ["pending", "À suivre"]] as [DetailTab, string][]).map(([key, label]) => <button key={key} role="tab" aria-selected={detailTab === key} type="button" onClick={() => setDetailTab(key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${detailTab === key ? "bg-blue-800 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>)}</div>
          <article className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {detailsLoading && <p className="p-5 text-sm text-slate-500">Actualisation du détail…</p>}
            {detailTab === "funding" && <div className="overflow-x-auto"><h3 className="p-4 text-base font-semibold">Approvisionnements reçus · 200 derniers versements</h3><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Caisse</th><th className="p-3">Description</th><th className="p-3">Référence</th><th className="p-3 text-right">Montant</th></tr></thead><tbody>{companyDetails.fundings.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{dateTime(row.date)}</td><td className="p-3">{row.cashAccount.name}</td><td className="p-3">{row.description}</td><td className="p-3">{row.reference || "—"}</td><td className="p-3 text-right font-semibold text-emerald-700">+ {money(row.amount, row.cashAccount.currency)}</td></tr>)}{!companyDetails.fundings.length && <tr><td className="p-4 text-slate-500" colSpan={5}>Aucun approvisionnement enregistré. Le solde des fonds reste indiqué ci-dessus.</td></tr>}</tbody></table></div>}
            {detailTab === "cash" && <div className="overflow-x-auto"><h3 className="p-4 text-base font-semibold">Livre de caisse · 200 derniers mouvements</h3><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Compte</th><th className="p-3">Libellé</th><th className="p-3">Origine</th><th className="p-3 text-right">Mouvement</th></tr></thead><tbody>{companyDetails.cashMovements.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{dateTime(row.date)}</td><td className="p-3">{row.cashAccount.name}</td><td className="p-3">{row.description}</td><td className="p-3">{actionName(row.sourceType)}</td><td className={`p-3 text-right font-semibold ${row.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>{row.direction === "IN" ? "+ " : "− "}{money(row.amount, row.cashAccount.currency)}</td></tr>)}{!companyDetails.cashMovements.length && <tr><td className="p-4 text-slate-500" colSpan={5}>Aucun mouvement de caisse.</td></tr>}</tbody></table></div>}
            {detailTab === "journal" && <div className="p-4"><h3 className="text-base font-semibold">Journal des activités enregistrées</h3><p className="mb-3 mt-1 text-xs text-slate-500">Actions utilisateurs récentes; ce registre ne remplace pas un journal comptable en partie double.</p><div className="platform-admin-activity-list">{companyDetails.activityJournal.map((row) => <article className="platform-admin-activity-row" key={row.id}><span className="platform-admin-activity-mark"><Activity size={16} /></span><div className="min-w-0 flex-1"><strong>{actionName(row.action)}</strong><p>{detailsText(row.details)}</p></div><span className="text-xs text-slate-500">{row.user?.name ?? "Utilisateur"} · {dateTime(row.createdAt)}</span></article>)}{!companyDetails.activityJournal.length && <p className="py-4 text-sm text-slate-500">Aucune activité enregistrée.</p>}</div></div>}
            {detailTab === "ledger" && <div className="p-4"><h3 className="text-base font-semibold">Grand livre opérationnel · comptes de caisse</h3><p className="mb-3 mt-1 text-xs text-slate-500">Synthèse par compte à partir des mouvements enregistrés. Pas d’écritures débit/crédit configurées dans le logiciel.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Compte</th><th className="p-3">Devise</th><th className="p-3 text-right">Solde physique</th><th className="p-3 text-right">Fonds disponibles OP</th></tr></thead><tbody>{companyDetails.accounts.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.code} · {row.name}</td><td className="p-3">{row.currency}</td><td className="p-3 text-right">{money(row.balance, row.currency)}</td><td className="p-3 text-right">{money(row.provisionAvailable, row.currency)}</td></tr>)}</tbody></table></div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{companyDetails.accountingNote}</p></div>}
            {detailTab === "settlements" && <div className="overflow-x-auto"><h3 className="p-4 text-base font-semibold">Règlements de factures · banque et caisse restent identifiées</h3><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Client / facture</th><th className="p-3">Mode</th><th className="p-3">Référence</th><th className="p-3 text-right">Montant</th></tr></thead><tbody>{companyDetails.settlements.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{dateTime(row.createdAt)}</td><td className="p-3">{row.customer?.name || "Client"} · {row.invoice?.invoiceNumber || "Affectation libre"}</td><td className="p-3">{actionName(row.method)}</td><td className="p-3">{row.reference || "—"}</td><td className="p-3 text-right font-semibold">{money(row.amount, row.currency)}</td></tr>)}{!companyDetails.settlements.length && <tr><td className="p-4 text-slate-500" colSpan={5}>Aucun règlement reçu.</td></tr>}</tbody></table></div>}
            {detailTab === "pending" && <div className="grid gap-5 p-4 lg:grid-cols-2"><div><h3 className="font-semibold">Factures non réglées</h3>{companyDetails.unpaidInvoices.map((row) => <div key={row.id} className="mt-2 flex justify-between gap-3 rounded-xl border p-3 text-sm"><span><strong>{row.invoiceNumber}</strong><span className="block text-slate-500">{row.customer.name} · échéance {row.dueDate ? dateTime(row.dueDate) : "non définie"}</span></span><strong className="text-amber-800">{money(row.balanceDue, row.currency)}</strong></div>)}{!companyDetails.unpaidInvoices.length && <p className="mt-2 text-sm text-slate-500">Aucune facture avec solde dû.</p>}</div><div><h3 className="font-semibold">Bons de sortie à suivre</h3>{companyDetails.pendingCashVouchers.map((row) => <div key={row.id} className="mt-2 flex justify-between gap-3 rounded-xl border p-3 text-sm"><span><strong>{row.voucherNumber} · {row.beneficiary}</strong><span className="block text-slate-500">{row.category} · {dateTime(row.date)} · {actionName(row.status)}</span></span><strong>{money(row.amount, row.currency)}</strong></div>)}{!companyDetails.pendingCashVouchers.length && <p className="mt-2 text-sm text-slate-500">Aucun bon en attente de traitement.</p>}</div></div>}
          </article></>}
        {companyFilter === "all" && <p className="platform-admin-empty">Choisissez une société pour consulter ses comptes et ses mouvements détaillés.</p>}
        {detailsLoading && !companyDetails && <p className="platform-admin-empty">Chargement du dossier de la société…</p>}
      </section>

      <section id="notifications" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading"><div><p>SUIVI DES VALIDATIONS</p><h2>Notifications de toutes les entreprises</h2></div><button type="button" disabled={!unreadCount} onClick={() => void markAllNoticesRead()} className="platform-admin-text-button">Tout marquer comme lu</button></div>
        <div className="grid gap-2">{notices.map((notice) => <article key={notice.id} className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${notice.read ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/60"}`}><Bell size={17} className="mt-0.5 text-amber-700" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{notice.title}</strong><span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{notice.company.tradeName || notice.company.legalName}</span></div><p className="mt-1 text-sm text-slate-600">{notice.message}</p><small className="mt-1 block text-xs text-slate-500">{dateTime(notice.createdAt)}</small></div>{!notice.read && <button type="button" onClick={() => void markNoticeRead(notice)} aria-label={`Marquer comme lue : ${notice.title}`} className="platform-admin-text-button"><Check size={15} />Lu</button>}</article>)}{!loading && !notices.length && <div className="platform-admin-empty">Aucune notification.</div>}</div>
      </section>

      <section className="platform-admin-section">
        <div className="platform-admin-section-heading"><div><p>ACTIVITÉ RÉCENTE</p><h2>Journal inter-sociétés</h2></div><Activity size={20} className="text-slate-400" /></div>
        <div className="platform-admin-activity-list">{(overview?.recentActivity ?? []).map((event) => <article className="platform-admin-activity-row" key={event.id}><span className="platform-admin-activity-mark"><Activity size={16} /></span><div className="min-w-0 flex-1"><strong>{actionName(event.action)} · {event.company.name}</strong><p>{detailsText(event.details)}</p></div><span className="text-xs text-slate-500">{event.user?.name ?? "Utilisateur"} · {dateTime(event.createdAt)}</span></article>)}</div>
      </section>

      {rejecting && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setRejecting(null); }}><section role="dialog" aria-modal="true" aria-labelledby="global-order-reject-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-rose-700">{orderCompanyName(rejecting.company)} · {rejecting.orderNumber}</p><h2 id="global-order-reject-title" className="mt-1 text-xl font-semibold">Rejeter cette OP</h2></div><button type="button" onClick={() => setRejecting(null)} aria-label="Fermer"><X size={19} /></button></div><label className="mt-5 grid gap-2 text-sm font-medium text-slate-700">Motif du rejet<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={300} rows={4} className="rounded-xl border border-slate-300 p-3" placeholder="Expliquez la décision à l’équipe…" /></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setRejecting(null)} className="platform-admin-text-button">Annuler</button><button type="button" disabled={rejectReason.trim().length < 4 || busyId === rejecting.id} onClick={() => void decide(rejecting, "reject", rejectReason.trim())} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmer le rejet</button></div></section></div>}

      {attachmentPreview && <div role="presentation" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { URL.revokeObjectURL(attachmentPreview.url); setAttachmentPreview(null); } }}><section role="dialog" aria-modal="true" aria-label={`État de besoin : ${attachmentPreview.name}`} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center gap-3 border-b p-4"><FileText size={18} className="text-blue-700" /><strong className="min-w-0 flex-1 truncate">{attachmentPreview.name}</strong><a href={attachmentPreview.url} download={attachmentPreview.name} className="platform-admin-text-button"><Download size={15} />Télécharger</a><button type="button" onClick={() => { URL.revokeObjectURL(attachmentPreview.url); setAttachmentPreview(null); }} aria-label="Fermer"><X size={19} /></button></header>{attachmentPreview.mimeType.startsWith("image/") ? <div className="overflow-auto p-4 text-center"><img src={attachmentPreview.url} alt={attachmentPreview.name} className="mx-auto max-h-[78vh] max-w-full object-contain" /></div> : attachmentPreview.mimeType === "application/pdf" ? <iframe title={attachmentPreview.name} src={attachmentPreview.url} className="min-h-[75vh] w-full" /> : <div className="p-8 text-center text-slate-600">Aperçu indisponible pour ce format. Téléchargez le document pour l’examiner.</div>}</section></div>}
      {loading && <div role="status" className="platform-admin-loading">Chargement des opérations et rapports…</div>}
    </main>
  );
}
