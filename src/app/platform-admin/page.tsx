"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  RefreshCw,
  Search,
  Settings2,
  Users,
  UserRoundCog,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Palette,
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { setSessionToken } from "@/lib/session";

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
  primaryColor: string;
  accentColor: string;
  email?: string | null;
  city?: string | null;
  currencyCode: string;
  createdAt: string;
  isActive: boolean;
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

type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  company: { id: string; name: string; isActive: boolean };
};

type DashboardCard = "companies" | "users" | "invoices" | "payments" | "approvals" | "activity";
type PlatformPreferences = { cards: DashboardCard[]; defaultCompanyId: string };

const preferenceKey = "cabinet-platform-dashboard-preferences";
const cardLabels: Record<DashboardCard, string> = {
  companies: "Entreprises suivies",
  users: "Utilisateurs actifs",
  invoices: "Factures enregistrées",
  payments: "Encaissements",
  approvals: "OP à examiner",
  activity: "Activité du jour",
};
const defaultCards: DashboardCard[] = ["companies", "users", "invoices", "payments", "approvals", "activity"];
const defaultPreferences: PlatformPreferences = { cards: defaultCards, defaultCompanyId: "all" };
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

function prepareCompanyLogo(file: File) {
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("Choisissez une image de moins de 5 Mo."));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire cette image."));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Cette image ne peut pas être décodée."));
      image.onload = () => {
        const scale = Math.min(1, 720 / image.width, 420 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Impossible de préparer le logo."));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.86, 0.74, 0.62, 0.5, 0.38]) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length <= 70_000) return resolve(dataUrl);
        }
        reject(new Error("Le logo est trop détaillé. Choisissez une image plus simple."));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
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
      defaultCompanyId: parsed.defaultCompanyId || "all",
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
  const router = useRouter();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const preferences = useSyncExternalStore(subscribeToPreferences, getPreferencesSnapshot, () => defaultPreferences);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyEditorOpen, setCompanyEditorOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ legalName: "", tradeName: "", email: "", city: "", primaryColor: "#e60000", accentColor: "#ffcc00", logoUrl: "" });
  const [newCompany, setNewCompany] = useState({ legalName: "", tradeName: "", email: "", city: "" });
  const effectiveCompanyId = selectedCompanyId ?? "all";

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
    return effectiveCompanyId === "all" ? events : events.filter((event) => event.company.id === effectiveCompanyId);
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

  useEffect(() => {
    let active = true;
    apiRequest<PlatformUser[]>("/platform-admin/users")
      .then((users) => { if (active) setPlatformUsers(users); })
      .catch(() => { if (active) setPlatformUsers([]); })
      .finally(() => { if (active) setUsersLoading(false); });
    return () => { active = false; };
  }, []);

  function editCompany(company: PlatformCompany) {
    setSelectedCompanyId(company.id);
    setCompanyDraft({
      legalName: company.legalName,
      tradeName: company.name === company.legalName ? "" : company.name,
      email: company.email ?? "",
      city: company.city ?? "",
      primaryColor: company.primaryColor || "#e60000",
      accentColor: company.accentColor || "#ffcc00",
      logoUrl: company.logoUrl ?? "",
    });
    setCompanyEditorOpen(true);
    window.setTimeout(() => scrollTo("theme-editor"), 0);
  }

  function editSelectedCompany() {
    if (selectedCompany) editCompany(selectedCompany);
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompany) return;
    setSavingCompany(true);
    setError("");
    try {
      await apiRequest(`/company/platform/companies/${selectedCompany.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          legalName: companyDraft.legalName,
          tradeName: companyDraft.tradeName || null,
          email: companyDraft.email || null,
          city: companyDraft.city || null,
          primaryColor: companyDraft.primaryColor,
          accentColor: companyDraft.accentColor,
          logoUrl: companyDraft.logoUrl || null,
        }),
      });
      setCompanyEditorOpen(false);
      await loadOverview(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’enregistrer les paramètres de l’entreprise.");
    } finally {
      setSavingCompany(false);
    }
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCompany(true);
    setError("");
    try {
      const created = await apiRequest<PlatformCompany>("/company/platform/companies", {
        method: "POST",
        body: JSON.stringify({
          legalName: newCompany.legalName,
          tradeName: newCompany.tradeName || undefined,
          email: newCompany.email || undefined,
          city: newCompany.city || undefined,
        }),
      });
      setNewCompany({ legalName: "", tradeName: "", email: "", city: "" });
      setSelectedCompanyId(created.id);
      await loadOverview(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de créer l’entreprise.");
    } finally {
      setSavingCompany(false);
    }
  }

  async function openCompany(companyId: string, destination: string) {
    setError("");
    try {
      const session = await apiRequest<{ accessToken: string }>("/auth/switch-company", {
        method: "POST",
        body: JSON.stringify({ companyId }),
      });
      setSessionToken(session.accessToken);
      router.push(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’ouvrir cette entreprise.");
    }
  }

  async function deleteCompany(company: PlatformCompany) {
    const name = company.name;
    if (!window.confirm(`Archiver ${name} et désactiver l’accès à cet espace ? Les données seront conservées et l’archivage pourra être annulé.`)) return;
    setError("");
    try {
      await apiRequest(`/company/platform/companies/${company.id}`, { method: "DELETE" });
      setSelectedCompanyId(null);
      await loadOverview(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de supprimer l’entreprise.");
    }
  }

  async function restoreCompany(company: PlatformCompany) {
    setError("");
    try {
      await apiRequest(`/company/platform/companies/${company.id}/restore`, { method: "POST" });
      await loadOverview(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de restaurer l’entreprise.");
    }
  }

  const summaryCards = [
    { id: "companies" as const, label: cardLabels.companies, value: overview?.summary.companies ?? 0, icon: Building2, color: "blue" },
    { id: "users" as const, label: cardLabels.users, value: overview?.summary.activeUsers ?? 0, icon: Users, color: "violet" },
    { id: "invoices" as const, label: cardLabels.invoices, value: overview?.summary.invoices ?? 0, icon: ArrowUpRight, color: "teal" },
    { id: "payments" as const, label: cardLabels.payments, value: (overview?.summary.totalsByCurrency ?? []).map(({ currency, payments }) => money(payments, currency)).join(" · ") || "—", icon: Wallet, color: "green" },
    { id: "approvals" as const, label: cardLabels.approvals, value: overview?.summary.pendingPaymentOrders ?? 0, icon: ArrowDownRight, color: "amber" },
    { id: "activity" as const, label: cardLabels.activity, value: overview?.summary.activityToday ?? 0, icon: Activity, color: "rose" },
  ];

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
        <button type="button" onClick={() => scrollTo("overview")}>Tableau global</button>
        <button type="button" onClick={() => scrollTo("companies")}>Entreprises</button>
        <button type="button" onClick={() => scrollTo("users")}>Utilisateurs</button>
        <button type="button" onClick={() => scrollTo("themes")}>Thèmes</button>
        <button type="button" onClick={() => scrollTo("reports")}>Rapports</button>
      </nav>

      {error && <div role="alert" className="platform-admin-error">{error}</div>}

      <section id="overview" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>INDICATEURS CONSOLIDÉS</p><h2>La plateforme, en un regard</h2></div>
          {overview && <span>Actualisé {dateTime(overview.generatedAt)}</span>}
        </div>
        {loading && !overview ? (
          <div className="platform-admin-loading">Chargement des activités de l’ensemble des entreprises…</div>
        ) : (
          <div className="platform-admin-metrics">
            {summaryCards.filter((card) => preferences.cards.includes(card.id)).map(({ id, label, value, icon: Icon, color }) => (
              <article className={`platform-admin-metric is-${color}`} key={id}>
                <span className="platform-admin-metric-icon"><Icon size={18} /></span>
                <span className="platform-admin-metric-label">{label}</span>
                <strong>{value}</strong>
                <small>Toutes les entreprises</small>
              </article>
            ))}
          </div>
        )}
        <div className="platform-admin-currency-grid">
          {(overview?.summary.totalsByCurrency ?? []).map((total) => (
            <article className="platform-admin-currency-card" key={total.currency}>
              <div><span>Flux {total.currency}</span><strong>{money(total.payments, total.currency)}</strong></div>
              <div><span>Facturé</span><b>{money(total.invoices, total.currency)}</b></div>
              <div><span>Payé sur factures</span><b>{money(total.paidInvoices, total.currency)}</b></div>
            </article>
          ))}
        </div>
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
                <span className={`platform-admin-company-state ${company.isActive ? "" : "is-archived"}`}>{company.isActive ? company.subscription?.status ?? "Active" : "Archivée"}</span>
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
                <div className="platform-admin-company-actions">
                  <button type="button" onClick={editSelectedCompany}><Pencil size={15} /> Modifier & personnaliser</button>
                  {selectedCompany.isActive ? <>
                    <button type="button" onClick={() => void openCompany(selectedCompany.id, "/users")}><UserRoundCog size={15} /> Gérer les utilisateurs</button>
                    <button type="button" onClick={() => void openCompany(selectedCompany.id, "/")}><ExternalLink size={15} /> Explorer l’entreprise</button>
                    <button type="button" className="is-danger" onClick={() => void deleteCompany(selectedCompany)}><Trash2 size={15} /> Archiver</button>
                  </> : <button type="button" onClick={() => void restoreCompany(selectedCompany)}><RefreshCw size={15} /> Restaurer l’espace</button>}
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
              <div className="platform-admin-company-all"><Building2 size={24} /><strong>Vue consolidée</strong><span>Sélectionnez une entreprise pour consulter ses indicateurs détaillés et son activité récente.</span></div>
            )}
          </div>
        </div>
        <form onSubmit={createCompany} className="platform-admin-create-company">
          <div className="platform-admin-create-copy"><span><Plus size={17} /></span><div><strong>Ajouter une entreprise</strong><small>Créez un espace indépendant, puis personnalisez son identité et son équipe.</small></div></div>
          <div className="platform-admin-create-fields">
            <input required minLength={2} maxLength={180} value={newCompany.legalName} onChange={(event) => setNewCompany({ ...newCompany, legalName: event.target.value })} placeholder="Raison sociale" aria-label="Raison sociale de la nouvelle entreprise" />
            <input maxLength={180} value={newCompany.tradeName} onChange={(event) => setNewCompany({ ...newCompany, tradeName: event.target.value })} placeholder="Nom commercial" aria-label="Nom commercial" />
            <input type="email" maxLength={160} value={newCompany.email} onChange={(event) => setNewCompany({ ...newCompany, email: event.target.value })} placeholder="E-mail" aria-label="E-mail de l’entreprise" />
            <input maxLength={100} value={newCompany.city} onChange={(event) => setNewCompany({ ...newCompany, city: event.target.value })} placeholder="Ville" aria-label="Ville" />
            <button type="submit" disabled={savingCompany}><Plus size={15} /> {savingCompany ? "Création…" : "Créer"}</button>
          </div>
        </form>
        {companyEditorOpen && selectedCompany && (
          <section id="theme-editor" className="platform-admin-brand-editor scroll-mt-24">
            <div className="platform-admin-editor-heading"><div><span><Palette size={17} /></span><div><p>IDENTITÉ VISUELLE & FICHE</p><h3>Personnaliser {selectedCompany.name}</h3></div></div><button type="button" onClick={() => setCompanyEditorOpen(false)} aria-label="Fermer"><X size={18} /></button></div>
            <form onSubmit={saveCompany} className="platform-admin-editor-grid">
              <div className="platform-admin-editor-fields">
                <label>Raison sociale<input required minLength={2} maxLength={180} value={companyDraft.legalName} onChange={(event) => setCompanyDraft({ ...companyDraft, legalName: event.target.value })} /></label>
                <label>Nom commercial<input maxLength={180} value={companyDraft.tradeName} onChange={(event) => setCompanyDraft({ ...companyDraft, tradeName: event.target.value })} /></label>
                <label>E-mail<input type="email" maxLength={160} value={companyDraft.email} onChange={(event) => setCompanyDraft({ ...companyDraft, email: event.target.value })} /></label>
                <label>Ville<input maxLength={100} value={companyDraft.city} onChange={(event) => setCompanyDraft({ ...companyDraft, city: event.target.value })} /></label>
                <label className="platform-admin-logo-upload">Logo de l’entreprise<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepareCompanyLogo(file).then((logoUrl) => setCompanyDraft({ ...companyDraft, logoUrl })).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Impossible de traiter le logo.")); }} /></label>
                {companyDraft.logoUrl && <button type="button" className="platform-admin-clear-logo" onClick={() => setCompanyDraft({ ...companyDraft, logoUrl: "" })}>Retirer le logo</button>}
              </div>
              <div className="platform-admin-theme-preview">
                <div className="platform-admin-color-pickers">
                  <label>Couleur principale<input type="color" value={companyDraft.primaryColor} onChange={(event) => setCompanyDraft({ ...companyDraft, primaryColor: event.target.value })} /></label>
                  <label>Couleur d’accent<input type="color" value={companyDraft.accentColor} onChange={(event) => setCompanyDraft({ ...companyDraft, accentColor: event.target.value })} /></label>
                </div>
                <div className="platform-admin-preview-card" style={{ "--preview-primary": companyDraft.primaryColor, "--preview-accent": companyDraft.accentColor } as React.CSSProperties}>
                  <span className="platform-admin-preview-logo">{companyDraft.logoUrl ? <Image src={companyDraft.logoUrl} alt="Logo aperçu" width={68} height={48} unoptimized /> : <Building2 size={22} />}</span>
                  <span><strong>{companyDraft.tradeName || companyDraft.legalName || "Votre entreprise"}</strong><small>{companyDraft.city || "Aperçu de l’espace"}</small></span>
                  <span className="platform-admin-preview-button">Espace entreprise</span>
                </div>
                <div className="platform-admin-editor-actions"><button type="button" className="is-cancel" onClick={() => setCompanyEditorOpen(false)}>Annuler</button><button type="submit" disabled={savingCompany}><Check size={15} /> {savingCompany ? "Enregistrement…" : "Enregistrer les changements"}</button></div>
              </div>
            </form>
          </section>
        )}
      </section>

      <section id="themes" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading"><div><p>IDENTITÉ VISUELLE</p><h2>Thème de chaque entreprise</h2></div><Palette size={20} className="text-slate-400" /></div>
        <div className="platform-admin-theme-list">
          {(overview?.companies ?? []).map((company) => (
            <article className="platform-admin-theme-row" key={company.id}>
              <span className="platform-admin-theme-logo">{company.logoUrl ? <Image src={company.logoUrl} alt="" width={46} height={42} unoptimized /> : <Building2 size={19} />}</span>
              <div className="min-w-0 flex-1"><strong>{company.name}</strong><small>{company.legalName}</small></div>
              <span className="platform-admin-theme-swatches"><i style={{ background: company.primaryColor || "#e60000" }} /><i style={{ background: company.accentColor || "#ffcc00" }} /></span>
              <button type="button" onClick={() => editCompany(company)}><Palette size={15} /> Personnaliser</button>
            </article>
          ))}
          {!overview?.companies.length && <p className="platform-admin-empty">Ajoutez une entreprise pour personnaliser son identité.</p>}
        </div>
      </section>

      <section id="users" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading"><div><p>ACCÈS AUX ESPACES</p><h2>Utilisateurs des entreprises</h2></div><span>{platformUsers.length} accès</span></div>
        <div className="platform-admin-users-table">
          <div className="platform-admin-users-head"><span>Utilisateur</span><span>Entreprise</span><span>Rôle</span><span>Statut</span><span /></div>
          {usersLoading ? <p className="platform-admin-empty">Chargement des utilisateurs…</p> : platformUsers.map((user) => (
            <div className="platform-admin-user-row" key={`${user.id}-${user.company.id}`}>
              <div><strong>{user.name}</strong><small>{user.email}</small></div>
              <span>{user.company.name}</span>
              <span className="platform-admin-user-role">{user.isPlatformAdmin ? "Super-admin" : user.role.replaceAll("_", " ").toLocaleLowerCase("fr-CD")}</span>
              <span className={`platform-admin-user-status ${user.isActive && user.company.isActive ? "is-active" : "is-inactive"}`}>{!user.company.isActive ? "Entreprise archivée" : user.isActive ? "Actif" : "Désactivé"}</span>
              <button type="button" disabled={!user.company.isActive} onClick={() => void openCompany(user.company.id, "/users")} aria-label={`Gérer l’équipe de ${user.company.name}`} title={user.company.isActive ? "Gérer les accès de cette entreprise" : "Entreprise archivée"}><UserRoundCog size={16} /></button>
            </div>
          ))}
          {!usersLoading && !platformUsers.length && <p className="platform-admin-empty">Aucun utilisateur rattaché aux entreprises.</p>}
        </div>
        <p className="platform-admin-footnote">L’action « Gérer » ouvre l’équipe de l’entreprise sélectionnée pour modifier les rôles et accès dans son contexte.</p>
      </section>

      <section id="reports" className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>RAPPORTS & JOURNAL DE LA PLATEFORME</p><h2>Rapports et activités récentes</h2></div>
          <select value={effectiveCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} aria-label="Filtrer les activités par entreprise" className="platform-admin-select">
            <option value="all">Toutes les entreprises</option>
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
          {!loading && !activities.length && <p className="platform-admin-empty">Aucune activité enregistrée pour ce filtre.</p>}
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
            <h3>Personnaliser les indicateurs</h3>
            <p>Choisissez les cartes visibles dans votre tableau de bord.</p>
            <div className="platform-admin-toggle-list">
              {defaultCards.map((card) => (
                <label key={card} className="platform-admin-toggle-row">
                  <span>{cardLabels[card]}</span>
                  <input type="checkbox" checked={preferences.cards.includes(card)} onChange={() => toggleCard(card)} />
                </label>
              ))}
            </div>
          </article>
          <article className="platform-admin-settings-card">
            <span className="platform-admin-settings-icon"><Building2 size={18} /></span>
            <h3>Entreprise à l’ouverture</h3>
            <p>Choisissez l’entreprise mise en évidence lors de votre prochaine connexion.</p>
            <select value={preferences.defaultCompanyId} onChange={(event) => { savePreferences({ ...preferences, defaultCompanyId: event.target.value }); setSelectedCompanyId(event.target.value); }} className="platform-admin-select w-full">
              <option value="all">Vue consolidée</option>
              {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <div className="platform-admin-config-note"><span className="platform-admin-live-dot" /> Préférences enregistrées dans ce navigateur.</div>
          </article>
          <article className="platform-admin-settings-card platform-admin-config-summary">
            <span className="platform-admin-settings-icon"><Activity size={18} /></span>
            <h3>État de la plateforme</h3>
            <p>Indicateurs de suivi des espaces et des journaux d’activité.</p>
            <div className="platform-admin-config-line"><span>Entreprises enregistrées</span><strong>{overview?.summary.companies ?? "—"}</strong></div>
            <div className="platform-admin-config-line"><span>Utilisateurs actifs</span><strong>{overview?.summary.activeUsers ?? "—"}</strong></div>
            <div className="platform-admin-config-line"><span>OP en attente</span><strong>{overview?.summary.pendingPaymentOrders ?? "—"}</strong></div>
          </article>
        </div>
      </section>
    </main>
  );
}
