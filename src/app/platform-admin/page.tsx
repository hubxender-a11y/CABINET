"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  RefreshCw,
  Search,
  Settings2,
  Check,
  Users,
  Wallet,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

type CurrencyTotals = {
  currency: string;
  invoices: string;
  paidInvoices: string;
  payments: string;
};

type PlatformCompany = {
  id: string;
  name: string;
  legalName: string;
  logoUrl: string | null;
  currencyCode: string;
  createdAt: string;
  subscription: { plan: string; status: string; endAt: string | null } | null;
  counts: {
    users: number;
    clients: number;
    invoices: number;
    payments: number;
    expenses: number;
    paymentOrders: number;
    pendingPaymentOrders: number;
    cashVouchers: number;
    archiveDocuments: number;
    auditEvents: number;
    activityToday: number;
  };
  invoicesByCurrency: { currency: string; count: number; invoiced: string; paid: string }[];
  paymentsByCurrency: { currency: string; received: string }[];
};

type PlatformActivity = {
  id: string;
  action: string;
  details: unknown;
  createdAt: string;
  company: { id: string; name: string };
  user: { name: string; email: string } | null;
};

type PlatformOverview = {
  generatedAt: string;
  summary: {
    companies: number;
    activeUsers: number;
    invoices: number;
    pendingPaymentOrders: number;
    activityToday: number;
    totalsByCurrency: CurrencyTotals[];
  };
  companies: PlatformCompany[];
  recentActivity: PlatformActivity[];
};

type DashboardCard = "clients" | "users" | "invoices" | "payments" | "approvals" | "activity";
type PlatformPreferences = { cards: DashboardCard[]; defaultCompanyId: string };

const preferenceKey = "cabinet-platform-dashboard-preferences";
const cardLabels: Record<DashboardCard, string> = {
  clients: "Dossiers clients",
  users: "Membres",
  invoices: "Factures enregistrées",
  payments: "Encaissements",
  approvals: "OP à examiner",
  activity: "Activité du jour",
};
const defaultCards: DashboardCard[] = ["clients", "users", "invoices", "payments", "approvals", "activity"];
const defaultPreferences: PlatformPreferences = { cards: defaultCards, defaultCompanyId: "" };
let cachedPreferences: PlatformPreferences | null = null;

function money(value: string | number, currency: string) {
  const amount = Number(value);
  return new Intl.NumberFormat("fr-CD", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "CDF",
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kinshasa",
  }).format(new Date(value));
}

function actionLabel(action: string) {
  return action
    .toLocaleLowerCase("fr-CD")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("fr-CD"));
}

function activityDetails(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  return Object.entries(details as Record<string, unknown>)
    .filter(([key]) => !/password|secret|token|signature/i.test(key))
    .slice(0, 4)
    .map(([key, value]) => {
      const display = typeof value === "string" ? value : JSON.stringify(value);
      return `${key}: ${display ?? "—"}`;
    })
    .join(" · ")
    .slice(0, 240);
}

function readPreferences(): PlatformPreferences {
  try {
    const value = window.localStorage.getItem(preferenceKey);
    if (!value) return defaultPreferences;
    const parsed = JSON.parse(value) as Partial<PlatformPreferences>;
    return {
      cards: defaultCards.filter((card) => parsed.cards?.includes(card)),
      defaultCompanyId: parsed.defaultCompanyId === "all" ? "" : parsed.defaultCompanyId || "",
    };
  } catch {
    return defaultPreferences;
  }
}

function getPreferencesSnapshot() {
  if (typeof window === "undefined") return defaultPreferences;
  cachedPreferences ??= readPreferences();
  return cachedPreferences;
}

function subscribeToPreferences(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("platform-admin-preferences", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("platform-admin-preferences", onChange);
  };
}

function savePreferences(preferences: PlatformPreferences) {
  cachedPreferences = preferences;
  window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  window.dispatchEvent(new Event("platform-admin-preferences"));
}

export default function PlatformAdminPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const preferences = useSyncExternalStore(subscribeToPreferences, getPreferencesSnapshot, () => defaultPreferences);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [managingPartnerEmail, setManagingPartnerEmail] = useState("samyligbakelo@ctrs.cd");
  const [grantingPartner, setGrantingPartner] = useState(false);
  const [partnerAccessMessage, setPartnerAccessMessage] = useState("");
  const effectiveCompanyId = selectedCompanyId ?? preferences.defaultCompanyId;

  const loadOverview = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await apiRequest<PlatformOverview>("/platform-admin/overview");
      setOverview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le tableau de bord global n’a pas pu être chargé.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<PlatformOverview>("/platform-admin/overview")
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Le tableau de bord global n’a pas pu être chargé.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedCompany = overview?.companies.find((company) => company.id === effectiveCompanyId) ?? null;
  const companies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-CD");
    return (overview?.companies ?? []).filter((company) =>
      !query || `${company.name} ${company.legalName}`.toLocaleLowerCase("fr-CD").includes(query),
    );
  }, [overview?.companies, search]);
  const activities = useMemo(() => {
    const events = overview?.recentActivity ?? [];
    return effectiveCompanyId ? events.filter((event) => event.company.id === effectiveCompanyId) : [];
  }, [effectiveCompanyId, overview?.recentActivity]);

  function toggleCard(card: DashboardCard) {
    const cards = preferences.cards.includes(card)
      ? preferences.cards.filter((item) => item !== card)
      : [...preferences.cards, card];
    savePreferences({ ...preferences, cards });
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selectedCurrencyTotals = useMemo(() => {
    const totals = new Map<string, { invoices: string; paidInvoices: string; payments: string }>();
    for (const row of selectedCompany?.invoicesByCurrency ?? []) {
      totals.set(row.currency, { invoices: row.invoiced, paidInvoices: row.paid, payments: "0" });
    }
    for (const row of selectedCompany?.paymentsByCurrency ?? []) {
      const current = totals.get(row.currency) ?? { invoices: "0", paidInvoices: "0", payments: "0" };
      totals.set(row.currency, { ...current, payments: row.received });
    }
    return [...totals.entries()].map(([currency, values]) => ({ currency, ...values }));
  }, [selectedCompany]);

  const summaryCards = selectedCompany ? [
    { id: "clients" as const, label: cardLabels.clients, value: selectedCompany.counts.clients, icon: Building2, color: "blue" },
    { id: "users" as const, label: cardLabels.users, value: selectedCompany.counts.users, icon: Users, color: "violet" },
    { id: "invoices" as const, label: cardLabels.invoices, value: selectedCompany.counts.invoices, icon: ArrowUpRight, color: "teal" },
    { id: "payments" as const, label: cardLabels.payments, value: (selectedCompany.paymentsByCurrency ?? []).map(({ currency, received }) => money(received, currency)).join(" · ") || money(0, selectedCompany.currencyCode), icon: Wallet, color: "green" },
    { id: "approvals" as const, label: cardLabels.approvals, value: selectedCompany.counts.pendingPaymentOrders, icon: ArrowDownRight, color: "amber" },
    { id: "activity" as const, label: cardLabels.activity, value: selectedCompany.counts.activityToday, icon: Activity, color: "rose" },
  ] : [];

  function setDefaultCompany(companyId: string) {
    savePreferences({ ...preferences, defaultCompanyId: companyId });
    setSelectedCompanyId(companyId || null);
  }

  async function grantManagingPartnerAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPartnerAccessMessage("");
    if (!window.confirm(`Accorder à ${managingPartnerEmail} l’accès global aux rapports, OP, visas et notifications de toutes les entreprises ?`)) return;
    setGrantingPartner(true);
    try {
      const result = await apiRequest<{ message: string }>("/platform-admin/managing-partners", {
        method: "POST",
        body: JSON.stringify({ email: managingPartnerEmail }),
      });
      setPartnerAccessMessage(result.message);
    } catch (caught) {
      setPartnerAccessMessage(caught instanceof Error ? caught.message : "L’accès global n’a pas pu être activé.");
    } finally {
      setGrantingPartner(false);
    }
  }

  return (
    <main className="platform-admin-page space-y-8">
      <header className="platform-admin-hero">
        <div>
          <p className="platform-admin-eyebrow">CONSOLE DE PILOTAGE · SUPER-ADMIN</p>
          <h1>Vue d’ensemble de la plateforme</h1>
          <p>Suivez les entreprises, les flux et les validations depuis un seul espace global.</p>
        </div>
        <button type="button" onClick={() => void loadOverview(true)} disabled={refreshing} className="platform-admin-refresh">
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={17} />
          Actualiser
        </button>
      </header>

      <nav className="platform-admin-section-nav" aria-label="Menus super-administrateur">
        <button type="button" onClick={() => scrollTo("overview")}>Vue globale</button>
        <button type="button" onClick={() => scrollTo("companies")}>Entreprises</button>
        <button type="button" onClick={() => scrollTo("activity")}>Activités</button>
        <button type="button" onClick={() => scrollTo("settings")}>Configuration</button>
      </nav>

      {error && <div role="alert" className="platform-admin-error">{error}</div>}

      <section id="overview" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>TABLEAU DE BORD · ENTREPRISE SÉLECTIONNÉE</p><h2>{selectedCompany ? selectedCompany.name : "Choisissez un espace à suivre"}</h2></div>
          {overview && <span>Actualisé {dateTime(overview.generatedAt)}</span>}
        </div>
        <div className="platform-admin-overview-toolbar">
          <label className="platform-admin-company-picker">
            <span><Building2 size={16} /> Entreprise suivie</span>
            <select value={effectiveCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value || null)} className="platform-admin-select">
              <option value="">Sélectionner une entreprise</option>
              {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          {selectedCompany && <div className="platform-admin-selected-company"><span className="platform-admin-company-logo">{selectedCompany.logoUrl ? <Image src={selectedCompany.logoUrl} alt="" width={38} height={38} unoptimized /> : <Building2 size={18} />}</span><span><strong>{selectedCompany.name}</strong><small>{selectedCompany.legalName}</small></span><span className="platform-admin-company-state">{selectedCompany.subscription?.status ?? "Active"}</span></div>}
        </div>
        {loading && !overview ? (
          <div className="platform-admin-loading">Chargement des indicateurs…</div>
        ) : !selectedCompany ? (
          <div className="platform-admin-company-prompt"><span className="platform-admin-settings-icon"><Building2 size={20} /></span><div><strong>Les indicateurs sont propres à chaque entreprise</strong><p>Sélectionnez un espace ci-dessus pour afficher ses factures, encaissements, OP et activités.</p></div><button type="button" onClick={() => scrollTo("companies")}>Voir les entreprises <ArrowRight size={16} /></button></div>
        ) : (
          <div className="platform-admin-metrics">
            {summaryCards.filter((card) => preferences.cards.includes(card.id)).map(({ id, label, value, icon: Icon, color }) => (
              <article className={`platform-admin-metric is-${color}`} key={id}>
                <span className="platform-admin-metric-icon"><Icon size={18} /></span>
                <span className="platform-admin-metric-label">{label}</span>
                <strong>{value}</strong>
                <small>{selectedCompany.name}</small>
              </article>
            ))}
            {!summaryCards.some((card) => preferences.cards.includes(card.id)) && <div className="platform-admin-company-prompt"><span className="platform-admin-settings-icon"><Settings2 size={20} /></span><div><strong>Aucun indicateur affiché</strong><p>Réactivez au moins une carte dans la configuration personnelle.</p></div><button type="button" onClick={() => scrollTo("settings")}>Configurer <ArrowRight size={16} /></button></div>}
          </div>
        )}
        {selectedCompany && <div className="platform-admin-currency-grid">
          {selectedCurrencyTotals.map((total) => (
            <article className="platform-admin-currency-card" key={total.currency}>
              <div><span>Encaissements {total.currency}</span><strong>{money(total.payments, total.currency)}</strong></div>
              <div><span>Facturé</span><b>{money(total.invoices, total.currency)}</b></div>
              <div><span>Payé sur factures</span><b>{money(total.paidInvoices, total.currency)}</b></div>
            </article>
          ))}
          {!selectedCurrencyTotals.length && <p className="platform-admin-currency-empty">Aucun flux financier pour le moment.</p>}
        </div>}
      </section>

      <section id="companies" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>GESTION MULTI-ENTREPRISE</p><h2>Activité par entreprise</h2></div>
          <label className="platform-admin-search">
            <Search size={17} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une entreprise" />
          </label>
        </div>
        <div className="platform-admin-company-layout">
          <div className="platform-admin-company-list">
            {companies.map((company) => (
              <button
                type="button"
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={`platform-admin-company-row ${selectedCompanyId === company.id ? "is-selected" : ""}`}
              >
                <span className="platform-admin-company-logo">
                  {company.logoUrl ? <Image src={company.logoUrl} alt="" width={38} height={38} unoptimized /> : <Building2 size={18} />}
                </span>
                <span className="min-w-0 flex-1"><strong>{company.name}</strong><small>{company.legalName}</small></span>
                <span className="platform-admin-company-state">{company.subscription?.status ?? "Active"}</span>
              </button>
            ))}
            {!companies.length && <p className="platform-admin-empty">Aucune entreprise ne correspond à cette recherche.</p>}
          </div>

          <div className="platform-admin-company-detail">
            {selectedCompany ? (
              <>
                <div className="platform-admin-company-detail-head">
                  <div><p>FICHE ENTREPRISE</p><h3>{selectedCompany.name}</h3><span>{selectedCompany.legalName}</span></div>
                  <span className="platform-admin-company-badge">{selectedCompany.subscription?.plan ?? "Espace actif"}</span>
                </div>
                <div className="platform-admin-company-counts">
                  <div><span>Membres</span><strong>{selectedCompany.counts.users}</strong></div>
                  <div><span>Dossiers clients</span><strong>{selectedCompany.counts.clients}</strong></div>
                  <div><span>Factures</span><strong>{selectedCompany.counts.invoices}</strong></div>
                  <div><span>Règlements</span><strong>{selectedCompany.counts.payments}</strong></div>
                  <div><span>Ordres de paiement</span><strong>{selectedCompany.counts.paymentOrders}</strong></div>
                  <div><span>OP en attente</span><strong>{selectedCompany.counts.pendingPaymentOrders}</strong></div>
                  <div><span>Bons de sortie</span><strong>{selectedCompany.counts.cashVouchers}</strong></div>
                  <div><span>Documents archivés</span><strong>{selectedCompany.counts.archiveDocuments}</strong></div>
                </div>
                <div className="platform-admin-company-financials">
                  <h4>Facturation et encaissements</h4>
                  {selectedCompany.invoicesByCurrency.map((item) => (
                    <div className="platform-admin-financial-row" key={item.currency}>
                      <strong>{item.currency}</strong><span>{item.count} factures</span><span>Émis {money(item.invoiced, item.currency)}</span><span>Réglé {money(item.paid, item.currency)}</span>
                    </div>
                  ))}
                  {selectedCompany.paymentsByCurrency.map((item) => (
                    <div className="platform-admin-financial-row" key={`payment-${item.currency}`}>
                      <strong>{item.currency}</strong><span>Encaissements reçus</span><span>{money(item.received, item.currency)}</span><span />
                    </div>
                  ))}
                  {!selectedCompany.invoicesByCurrency.length && !selectedCompany.paymentsByCurrency.length && <p className="platform-admin-empty">Aucun flux financier enregistré.</p>}
                </div>
                <button type="button" className="platform-admin-text-button" onClick={() => { setSelectedCompanyId(selectedCompany.id); scrollTo("activity"); }}>
                  Voir l’historique d’activité de cette entreprise <span aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <div className="platform-admin-company-all"><Building2 size={24} /><strong>Sélectionnez une entreprise</strong><span>Les indicateurs financiers et opérationnels sont consultés espace par espace.</span></div>
            )}
          </div>
        </div>
      </section>

      <section id="activity" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>JOURNAL DE LA PLATEFORME</p><h2>Activités récentes</h2></div>
          <select value={effectiveCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value || null)} aria-label="Filtrer les activités par entreprise" className="platform-admin-select">
            <option value="">Sélectionner une entreprise</option>
            {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
        <div className="platform-admin-activity-list">
          {activities.map((event) => (
            <article className="platform-admin-activity-row" key={event.id}>
              <span className="platform-admin-activity-mark"><Activity size={16} /></span>
              <div className="min-w-0 flex-1">
                <strong>{actionLabel(event.action)}</strong>
                <p>{event.company.name} · {event.user?.name ?? "Activité système"}</p>
                {activityDetails(event.details) && <small className="mt-1 block break-words text-slate-500">{activityDetails(event.details)}</small>}
              </div>
              <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
            </article>
          ))}
          {!loading && !effectiveCompanyId && <p className="platform-admin-empty">Choisissez une entreprise pour consulter son journal d’activité.</p>}
          {!loading && effectiveCompanyId && !activities.length && <p className="platform-admin-empty">Aucune activité enregistrée pour cette entreprise.</p>}
        </div>
        <p className="platform-admin-footnote">Les activités affichées proviennent du journal d’audit de chaque entreprise. Les écritures financières ne sont pas modifiables depuis cette vue.</p>
      </section>

      <section id="settings" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>ESPACE PERSONNEL</p><h2>Configuration du super-admin</h2></div>
          <Settings2 size={20} className="text-slate-400" />
        </div>
        <div className="platform-admin-settings-grid">
          <article className="platform-admin-settings-card">
            <span className="platform-admin-settings-icon"><Settings2 size={18} /></span>
            <div className="platform-admin-settings-title"><h3>Mes indicateurs</h3><span>{preferences.cards.length}/{defaultCards.length}</span></div>
            <p>Choisissez les cartes visibles dans votre tableau de bord.</p>
            <div className="platform-admin-settings-progress"><span style={{ width: `${(preferences.cards.length / defaultCards.length) * 100}%` }} /></div>
            <div className="platform-admin-settings-actions"><button type="button" onClick={() => savePreferences({ ...preferences, cards: [...defaultCards] })}>Tout afficher</button><button type="button" onClick={() => savePreferences({ ...preferences, cards: [] })}>Tout masquer</button></div>
            <div className="platform-admin-toggle-list">
              {defaultCards.map((card) => (
                <label key={card} className="platform-admin-toggle-row">
                  <span>{cardLabels[card]}</span>
                  <input type="checkbox" checked={preferences.cards.includes(card)} onChange={() => toggleCard(card)} aria-label={`Afficher ${cardLabels[card]}`} />
                </label>
              ))}
            </div>
          </article>
          <article className="platform-admin-settings-card">
            <span className="platform-admin-settings-icon"><Building2 size={18} /></span>
            <div className="platform-admin-settings-title"><h3>Mon espace d’accueil</h3><span>Par défaut</span></div>
            <p>Choisissez l’entreprise à ouvrir en premier dans cette session.</p>
            <select value={preferences.defaultCompanyId} onChange={(event) => setDefaultCompany(event.target.value)} className="platform-admin-select w-full">
              <option value="">Choisir à chaque connexion</option>
              {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            {overview?.companies.find((company) => company.id === preferences.defaultCompanyId) ? (() => {
              const homeCompany = overview.companies.find((company) => company.id === preferences.defaultCompanyId)!;
              return <div className="platform-admin-home-preview"><span className="platform-admin-company-logo">{homeCompany.logoUrl ? <Image src={homeCompany.logoUrl} alt="" width={38} height={38} unoptimized /> : <Building2 size={18} />}</span><span><strong>{homeCompany.name}</strong><small>{homeCompany.counts.invoices} factures · {homeCompany.counts.pendingPaymentOrders} OP à examiner</small></span><Check size={17} /></div>;
            })() : <div className="platform-admin-home-empty"><span className="platform-admin-live-dot" /> Aucune entreprise prédéfinie. Vous choisirez au tableau de bord.</div>}
            <div className="platform-admin-config-note">Préférence enregistrée sur cet appareil.</div>
          </article>
          <article className="platform-admin-settings-card platform-admin-settings-shortcuts">
            <span className="platform-admin-settings-icon"><Activity size={18} /></span>
            <h3>Accès rapides</h3>
            <p>Ouvrez directement les vues de pilotage.</p>
            <button type="button" onClick={() => scrollTo("companies")}><span><Building2 size={16} /> Entreprises</span><strong>{overview?.summary.companies ?? "—"}<ArrowRight size={15} /></strong></button>
            <button type="button" onClick={() => scrollTo("activity")}><span><Activity size={16} /> Journal d’activité</span><strong>Ouvrir<ArrowRight size={15} /></strong></button>
            <button type="button" onClick={() => { setSelectedCompanyId(null); scrollTo("overview"); }}><span><RefreshCw size={16} /> Changer d’espace</span><strong>Choisir<ArrowRight size={15} /></strong></button>
          </article>
          <article className="platform-admin-settings-card">
            <span className="platform-admin-settings-icon"><Users size={18} /></span>
            <div className="platform-admin-settings-title"><h3>Accès associé-gérant global</h3><span>OP · Rapports</span></div>
            <p>Activez le compte existant du patron pour consulter les opérations détaillées de chaque entreprise, recevoir les notifications et approuver ou rejeter les OP. Les réglages de la plateforme et la gestion des utilisateurs restent réservés au super-admin.</p>
            <form onSubmit={(event) => void grantManagingPartnerAccess(event)} className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">Adresse e-mail du compte existant
                <input type="email" required value={managingPartnerEmail} onChange={(event) => setManagingPartnerEmail(event.target.value)} className="platform-admin-select w-full" />
              </label>
              <button type="submit" disabled={grantingPartner} className="platform-admin-text-button justify-center disabled:opacity-60">
                {grantingPartner ? "Activation…" : "Activer l’accès associé-gérant"}
              </button>
              {partnerAccessMessage && <p role="status" className="platform-admin-config-note">{partnerAccessMessage}</p>}
            </form>
          </article>
        </div>
      </section>
    </main>
  );
}
