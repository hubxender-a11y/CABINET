"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
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
  ChevronLeft,
  ChevronRight,
  UserPlus,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
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
    activityToday: number;
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
  recentActivity?: PlatformActivity[];
};

type PlatformActivityPage = {
  items: PlatformActivity[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type PendingPaymentOrderEmailResult = {
  configured: boolean;
  pending: number;
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  remaining?: boolean;
  message?: string;
};

type PlatformTab = "overview" | "companies" | "users" | "themes" | "reports";

const platformTabs: { id: PlatformTab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Tableau global", icon: Activity },
  { id: "companies", label: "Entreprises", icon: Building2 },
  { id: "users", label: "Utilisateurs", icon: Users },
  { id: "themes", label: "Thèmes", icon: Palette },
  { id: "reports", label: "Rapports", icon: ArrowUpRight },
];

type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  platformRole?: string | null;
  company: { id: string; name: string; isActive: boolean };
};

type PlatformAdmin = { id: string; name: string; email: string; isActive: boolean };
type PlatformUserRole =
  | "COMPANY_ADMIN"
  | "MANAGING_PARTNER"
  | "FINANCE_MANAGER"
  | "ACCOUNTANT"
  | "CASHIER"
  | "SALES_MANAGER"
  | "STOCK_MANAGER"
  | "AUDITOR"
  | "VIEWER";

const platformUserRoles: { value: PlatformUserRole; label: string }[] = [
  { value: "COMPANY_ADMIN", label: "Administrateur du cabinet" },
  { value: "MANAGING_PARTNER", label: "Associé-Gérant" },
  { value: "FINANCE_MANAGER", label: "Responsable financier" },
  { value: "ACCOUNTANT", label: "Comptable" },
  { value: "CASHIER", label: "Secrétaire" },
  { value: "SALES_MANAGER", label: "Responsable commercial" },
  { value: "STOCK_MANAGER", label: "Gestionnaire de stock" },
  { value: "AUDITOR", label: "Auditeur" },
  { value: "VIEWER", label: "Lecture seule" },
];

function roleLabel(role: string) {
  return platformUserRoles.find((option) => option.value === role)?.label ?? role.replaceAll("_", " ");
}

function temporaryPassword() {
  return `Ct#${crypto.randomUUID()}aA9`;
}

type DashboardCard = "companies" | "users" | "invoices" | "payments" | "approvals" | "activity";
type PlatformPreferences = { cards: DashboardCard[]; defaultCompanyId: string };

const preferenceKey = "cabinet-platform-dashboard-preferences";
const cardLabels: Record<DashboardCard, string> = {
  companies: "Espace sélectionné",
  users: "Accès utilisateurs",
  invoices: "Factures enregistrées",
  payments: "Encaissements",
  approvals: "OP à examiner",
  activity: "Activité aujourd’hui",
};
const defaultCards: DashboardCard[] = ["companies", "users", "invoices", "payments", "approvals", "activity"];
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
      defaultCompanyId: parsed.defaultCompanyId === "all" ? "" : parsed.defaultCompanyId ?? "",
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
  const [platformAdmins, setPlatformAdmins] = useState<PlatformAdmin[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [userActionError, setUserActionError] = useState("");
  const [userActionSuccess, setUserActionSuccess] = useState("");
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userCompanyFilter, setUserCompanyFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const [userDraft, setUserDraft] = useState({ companyId: "", name: "", email: "", role: "ACCOUNTANT" as PlatformUserRole, password: "" });
  const [adminDraft, setAdminDraft] = useState({ name: "", email: "", password: "" });
  const [managingPartnerEmail, setManagingPartnerEmail] = useState("samyligbakelo@ctrs.cd");
  const [activeTab, setActiveTab] = useState<PlatformTab>("overview");
  const [activityPage, setActivityPage] = useState<PlatformActivityPage | null>(null);
  const [activityPageNumber, setActivityPageNumber] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFallback, setActivityFallback] = useState(false);
  const [emailResendLoading, setEmailResendLoading] = useState(false);
  const [emailResendMessage, setEmailResendMessage] = useState("");
  const [emailResendError, setEmailResendError] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyEditorOpen, setCompanyEditorOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ legalName: "", tradeName: "", email: "", city: "", primaryColor: "#e60000", accentColor: "#ffcc00", logoUrl: "" });
  const [newCompany, setNewCompany] = useState({ legalName: "", tradeName: "", email: "", city: "" });
  const activeDashboardCompanyId = selectedCompanyId ?? preferences.defaultCompanyId;
  const effectiveCompanyId = selectedCompanyId ?? (preferences.defaultCompanyId || "all");

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

  async function resendPendingPaymentOrderEmails() {
    if (emailResendLoading) return;
    const confirmed = window.confirm(
      "Renvoyer au Gérant les OP en attente de toutes les entreprises ? Les OP déjà envoyées seront ignorées.",
    );
    if (!confirmed) return;

    setEmailResendLoading(true);
    setEmailResendMessage("");
    setEmailResendError("");
    try {
      const result = await apiRequest<PendingPaymentOrderEmailResult>(
        "/platform-admin/payment-orders/resend-pending-emails",
        { method: "POST" },
      );
      if (!result.configured) {
        setEmailResendError(result.message || "Le service e-mail n’est pas configuré.");
        return;
      }
      const tail = result.remaining ? " Les suivantes restent à traiter." : "";
      setEmailResendMessage(
        `Renvoi terminé : ${result.sent} envoyé(s), ${result.skippedAlreadySent} déjà transmis, ${result.failed} échec(s) sur ${result.pending} OP en attente.${tail}`,
      );
      await loadOverview(true);
    } catch (caught) {
      setEmailResendError(caught instanceof Error ? caught.message : "Impossible de renvoyer les OP en attente.");
    } finally {
      setEmailResendLoading(false);
    }
  }

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

  const selectedCompany = overview?.companies.find((company) => company.id === activeDashboardCompanyId) ?? null;
  const knownAccount = useMemo(() => {
    const email = adminDraft.email.trim().toLocaleLowerCase("fr-CD");
    if (!email) return null;
    return platformUsers.find((user) => user.email.toLocaleLowerCase("fr-CD") === email)
      ?? platformAdmins.find((admin) => admin.email.toLocaleLowerCase("fr-CD") === email)
      ?? null;
  }, [adminDraft.email, platformAdmins, platformUsers]);
  const knownCompanyUser = useMemo(() => {
    const email = userDraft.email.trim().toLocaleLowerCase("fr-CD");
    if (!email) return null;
    return platformUsers.find((user) => user.email.toLocaleLowerCase("fr-CD") === email)
      ?? platformAdmins.find((admin) => admin.email.toLocaleLowerCase("fr-CD") === email)
      ?? null;
  }, [platformAdmins, platformUsers, userDraft.email]);
  const filteredPlatformUsers = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase("fr-CD");
    return platformUsers.filter((user) => {
      const matchesSearch = !query || `${user.name} ${user.email} ${user.company.name}`.toLocaleLowerCase("fr-CD").includes(query);
      const matchesCompany = userCompanyFilter === "all" || user.company.id === userCompanyFilter;
      const active = user.isActive && user.company.isActive;
      const matchesStatus = userStatusFilter === "all" || (userStatusFilter === "active" ? active : !active);
      return matchesSearch && matchesCompany && matchesStatus;
    });
  }, [platformUsers, userCompanyFilter, userSearch, userStatusFilter]);
  const userPageSize = 10;
  const userTotalPages = Math.max(1, Math.ceil(filteredPlatformUsers.length / userPageSize));
  const paginatedPlatformUsers = filteredPlatformUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);
  const uniqueUserCount = new Set(platformUsers.map((user) => user.id)).size;
  const activeUserCount = new Set(platformUsers.filter((user) => user.isActive && user.company.isActive).map((user) => user.id)).size;
  const companies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-CD");
    return (overview?.companies ?? []).filter((company) =>
      !query || `${company.name} ${company.legalName}`.toLocaleLowerCase("fr-CD").includes(query),
    );
  }, [overview?.companies, search]);
  const fallbackActivities = (overview?.recentActivity ?? []).filter(
    (event) => effectiveCompanyId === "all" || event.company.id === effectiveCompanyId,
  );
  const fallbackTotalPages = Math.ceil(fallbackActivities.length / 10);
  const activities = activityPage?.items ?? (activityFallback
    ? fallbackActivities.slice((activityPageNumber - 1) * 10, activityPageNumber * 10)
    : []);
  const activityTotalCount = activityPage?.totalCount ?? (activityFallback ? fallbackActivities.length : 0);
  const activityTotalPages = Math.max(1, activityPage?.totalPages ?? fallbackTotalPages);

  function toggleCard(card: DashboardCard) {
    const cards = preferences.cards.includes(card)
      ? preferences.cards.filter((item) => item !== card)
      : [...preferences.cards, card];
    savePreferences({ ...preferences, cards });
  }

  useEffect(() => {
    if (activeTab !== "reports" || activityFallback) return;
    const query = new URLSearchParams({ page: String(activityPageNumber), pageSize: "10" });
    if (effectiveCompanyId !== "all") query.set("companyId", effectiveCompanyId);
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setActivityLoading(true);
        return apiRequest<PlatformActivityPage>(`/platform-admin/activities?${query.toString()}`);
      })
      .then((result) => { if (active && result) setActivityPage(result); })
      .catch((caught: unknown) => {
        if (active) {
          setActivityPage(null);
          if (overview?.recentActivity) setActivityFallback(true);
          else setError(caught instanceof Error ? caught.message : "Impossible de charger le journal d’activité.");
        }
      })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [activeTab, activityFallback, activityPageNumber, effectiveCompanyId, overview?.recentActivity]);

  useEffect(() => {
    if (activeTab === "companies" && companyEditorOpen) {
      document.getElementById("theme-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab, companyEditorOpen]);

  const loadPlatformUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const [users, admins] = await Promise.all([
        apiRequest<PlatformUser[]>("/platform-admin/users"),
        apiRequest<PlatformAdmin[]>("/company/platform/admins"),
      ]);
      setPlatformUsers(users);
      setPlatformAdmins(admins);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de charger les utilisateurs et les super-admins.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadPlatformUsers); }, [loadPlatformUsers]);

  function openUserModal() {
    const activeCompanies = (overview?.companies ?? []).filter((company) => company.isActive);
    if (!activeCompanies.length) {
      setError("Créez ou réactivez une entreprise avant d’ajouter un utilisateur.");
      return;
    }
    const selectedActiveCompany = activeCompanies.find((company) => company.id === activeDashboardCompanyId);
    setUserDraft({ companyId: selectedActiveCompany?.id ?? activeCompanies[0].id, name: "", email: "", role: "ACCOUNTANT", password: "" });
    setUserActionError("");
    setUserActionSuccess("");
    setShowTemporaryPassword(false);
    setUserModalOpen(true);
  }

  function openAdminModal() {
    setAdminDraft({ name: "", email: "", password: "" });
    setUserActionError("");
    setUserActionSuccess("");
    setShowTemporaryPassword(false);
    setAdminModalOpen(true);
  }

  async function createPlatformUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserSaving(true);
    setUserActionError("");
    setUserActionSuccess("");
    try {
      await apiRequest<PlatformUser>("/platform-admin/users", {
        method: "POST",
        body: JSON.stringify({
          ...userDraft,
          name: knownCompanyUser ? undefined : userDraft.name,
          password: knownCompanyUser ? undefined : userDraft.password,
        }),
      });
      setUserModalOpen(false);
      setUserActionSuccess("L’accès a été ajouté à l’entreprise.");
      await Promise.all([loadPlatformUsers(), loadOverview(true)]);
    } catch (caught) {
      setUserActionError(caught instanceof Error ? caught.message : "Impossible d’ajouter cet utilisateur.");
    } finally {
      setUserSaving(false);
    }
  }

  async function createPlatformAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserSaving(true);
    setUserActionError("");
    setUserActionSuccess("");
    try {
      await apiRequest<PlatformAdmin>("/platform-admin/admins", {
        method: "POST",
        body: JSON.stringify({
          email: adminDraft.email,
          name: knownAccount ? undefined : adminDraft.name,
          password: knownAccount ? undefined : adminDraft.password,
        }),
      });
      setAdminModalOpen(false);
      setUserActionSuccess(knownAccount ? "Les droits super-admin ont été attribués." : "Le compte super-admin a été créé.");
      await loadPlatformUsers();
    } catch (caught) {
      setUserActionError(caught instanceof Error ? caught.message : "Impossible d’ajouter ce super-admin.");
    } finally {
      setUserSaving(false);
    }
  }

  async function assignGlobalManagingPartner() {
    const email = managingPartnerEmail.trim().toLocaleLowerCase("fr-CD");
    if (!email) { setUserActionError("Indiquez l’adresse e-mail du compte existant."); return; }
    if (!window.confirm(`Attribuer à ${email} l’accès global d’Associé-Gérant ? Ce rôle ouvre les données, rapports, notifications et validations de toutes les sociétés.`)) return;
    setUserSaving(true);
    setUserActionError("");
    setUserActionSuccess("");
    try {
      await apiRequest("/platform-admin/managing-partners", { method: "POST", body: JSON.stringify({ email }) });
      setUserActionSuccess(`L’accès global Associé-Gérant a été attribué à ${email}.`);
      await loadPlatformUsers();
    } catch (caught) {
      setUserActionError(caught instanceof Error ? caught.message : "Impossible d’attribuer le rôle global.");
    } finally { setUserSaving(false); }
  }

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
    setActiveTab("companies");
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

  const selectedCurrencyTotals = useMemo(() => {
    if (!selectedCompany) return [];
    const totals = new Map<string, { invoices: string; paidInvoices: string; payments: string }>();
    for (const row of selectedCompany.invoicesByCurrency) {
      totals.set(row.currency, { invoices: row.invoiced, paidInvoices: row.paid, payments: "0" });
    }
    for (const row of selectedCompany.paymentsByCurrency) {
      const current = totals.get(row.currency) ?? { invoices: "0", paidInvoices: "0", payments: "0" };
      totals.set(row.currency, { ...current, payments: row.received });
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedCompany]);

  const summaryCards = selectedCompany ? [
    { id: "companies" as const, label: cardLabels.companies, value: selectedCompany.isActive ? "1" : "Archivé", icon: Building2, color: "blue" },
    { id: "users" as const, label: cardLabels.users, value: selectedCompany.counts.users, icon: Users, color: "violet" },
    { id: "invoices" as const, label: cardLabels.invoices, value: selectedCompany.counts.invoices, icon: ArrowUpRight, color: "teal" },
    { id: "payments" as const, label: cardLabels.payments, value: selectedCurrencyTotals.map(([currency, total]) => money(total.payments, currency)).join(" · ") || money(0, selectedCompany.currencyCode), icon: Wallet, color: "green" },
    { id: "approvals" as const, label: cardLabels.approvals, value: selectedCompany.counts.pendingPaymentOrders, icon: ArrowDownRight, color: "amber" },
    { id: "activity" as const, label: cardLabels.activity, value: selectedCompany.counts.activityToday, icon: Activity, color: "rose" },
  ] : [];

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

      <nav className="platform-admin-section-nav" role="tablist" aria-label="Menus super-administrateur">
        {platformTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`platform-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`platform-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {error && <div role="alert" className="platform-admin-error">{error}</div>}

      <section id="platform-panel-overview" role="tabpanel" aria-labelledby="platform-tab-overview" hidden={activeTab !== "overview"} className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading platform-admin-overview-heading">
          <div><p>ESPACE SÉLECTIONNÉ</p><h2>Activité de l’entreprise</h2><span>Les indicateurs et montants suivent l’entreprise choisie.</span></div>
          <label className="platform-admin-company-picker"><span>Entreprise</span><select aria-label="Choisir une entreprise pour les indicateurs" value={activeDashboardCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value || null)} disabled={loading || !overview?.companies.length}>
            <option value="">Sélectionner une entreprise</option>
            {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}{company.isActive ? "" : " · Archivée"}</option>)}
          </select></label>
        </div>
        {loading && !overview ? (
          <div className="platform-admin-loading">Chargement des entreprises…</div>
        ) : !overview?.companies.length ? (
          <div className="platform-admin-company-prompt"><span className="platform-admin-settings-icon"><Building2 size={20} /></span><div><strong>Aucune entreprise à suivre</strong><p>Créez un espace pour consulter ses indicateurs ici.</p></div><button type="button" onClick={() => setActiveTab("companies")}>Ajouter une entreprise <ChevronRight size={16} /></button></div>
        ) : !selectedCompany ? (
          <div className="platform-admin-company-prompt"><span className="platform-admin-settings-icon"><Building2 size={20} /></span><div><strong>Choisissez une entreprise</strong><p>Les chiffres consolidés ne sont pas affichés. Sélectionnez un espace pour voir ses factures, encaissements et validations.</p></div></div>
        ) : (
          <>
            <div className="platform-admin-selected-company" style={{ "--company-primary": selectedCompany.primaryColor, "--company-accent": selectedCompany.accentColor } as CSSProperties}>
              <span className="platform-admin-selected-company-logo">{selectedCompany.logoUrl ? <Image src={selectedCompany.logoUrl} alt="" width={42} height={42} unoptimized /> : <Building2 size={20} />}</span>
              <div><strong>{selectedCompany.name}</strong><span>{selectedCompany.city || selectedCompany.legalName}</span></div>
              <span className={`platform-admin-company-state ${selectedCompany.isActive ? "" : "is-archived"}`}>{selectedCompany.isActive ? "Espace actif" : "Archivé"}</span>
              {overview && <small>Mis à jour {dateTime(overview.generatedAt)}</small>}
            </div>
            <div className="platform-admin-metrics">
              {summaryCards.filter((card) => preferences.cards.includes(card.id)).map(({ id, label, value, icon: Icon, color }) => (
                <article className={`platform-admin-metric is-${color}`} key={id}>
                  <span className="platform-admin-metric-icon"><Icon size={18} /></span>
                  <span className="platform-admin-metric-label">{label}</span>
                  <strong>{value}</strong>
                  <small>{selectedCompany.name}</small>
                </article>
              ))}
            </div>
            <div className="platform-admin-currency-grid">
              {selectedCurrencyTotals.map(([currency, total]) => (
                <article className="platform-admin-currency-card" key={currency}>
                  <div><span>Encaissements {currency}</span><strong>{money(total.payments, currency)}</strong></div>
                  <div><span>Facturé</span><b>{money(total.invoices, currency)}</b></div>
                  <div><span>Payé sur factures</span><b>{money(total.paidInvoices, currency)}</b></div>
                </article>
              ))}
              {!selectedCurrencyTotals.length && <article className="platform-admin-currency-empty">Aucun mouvement financier enregistré pour cette entreprise.</article>}
            </div>
          </>
        )}
      </section>

      <section role="tabpanel" aria-labelledby="platform-tab-companies" id="platform-panel-companies" hidden={activeTab !== "companies"} className="platform-admin-section scroll-mt-24">
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
                <button type="button" className="platform-admin-text-button" onClick={() => { setSelectedCompanyId(selectedCompany.id); setActivityPageNumber(1); setActiveTab("reports"); }}>
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

      <section role="tabpanel" aria-labelledby="platform-tab-themes" id="platform-panel-themes" hidden={activeTab !== "themes"} className="platform-admin-section scroll-mt-24">
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

      <section role="tabpanel" aria-labelledby="platform-tab-users" id="platform-panel-users" hidden={activeTab !== "users"} className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading platform-admin-user-heading">
          <div><p>ACCÈS AUX ESPACES</p><h2>Utilisateurs des entreprises</h2><span>Comptes, rôles et accès organisés par entreprise.</span></div>
          <div className="platform-admin-user-actions">
            <button type="button" onClick={openAdminModal} disabled={usersLoading}><ShieldCheck size={16} /> Ajouter super-admin</button>
            <button type="button" className="is-primary" onClick={openUserModal} disabled={usersLoading || loading || !(overview?.companies.some((company) => company.isActive) ?? false)}><UserPlus size={16} /> Ajouter utilisateur</button>
          </div>
        </div>
        {userActionSuccess && !userModalOpen && !adminModalOpen && <p role="status" className="platform-admin-success">{userActionSuccess}</p>}
        {userActionError && !userModalOpen && !adminModalOpen && <p role="alert" className="platform-admin-error">{userActionError}</p>}
        <section className="platform-admin-roster-card" aria-labelledby="global-manager-title">
          <div className="platform-admin-roster-heading"><div><span className="platform-admin-roster-icon"><ShieldCheck size={18} /></span><div><p>ACCÈS TRANSVERSAL</p><h3 id="global-manager-title">Associé-Gérant de toutes les sociétés</h3></div></div></div>
          <p className="platform-admin-footnote">Attribuez ce rôle à un compte déjà créé. Il pourra consulter les sociétés une par une, suivre leurs notifications et rapports, et examiner ou approuver leurs OP et bons de sortie.</p>
          <div className="flex flex-col gap-3 sm:flex-row"><input aria-label="E-mail de l’associé-gérant" className="platform-admin-select min-w-0 flex-1" type="email" value={managingPartnerEmail} onChange={(event) => setManagingPartnerEmail(event.target.value)} placeholder="nom@entreprise.cd" /><button type="button" className="is-primary" onClick={() => void assignGlobalManagingPartner()} disabled={userSaving || usersLoading}><ShieldCheck size={16} /> {userSaving ? "Attribution…" : "Attribuer le rôle"}</button></div>
        </section>
        <div className="platform-admin-user-metrics">
          <article><span>Accès entreprise</span><strong>{platformUsers.length}</strong><small>Rôles attribués</small></article>
          <article><span>Utilisateurs uniques</span><strong>{uniqueUserCount}</strong><small>Comptes distincts</small></article>
          <article><span>Actifs</span><strong>{activeUserCount}</strong><small>Au moins un accès actif</small></article>
          <article><span>Super-admins</span><strong>{platformAdmins.length}</strong><small>Contrôle global</small></article>
        </div>
        <div className="platform-admin-user-toolbar">
          <label className="platform-admin-search"><Search size={17} aria-hidden="true" /><input value={userSearch} onChange={(event) => { setUserPage(1); setUserSearch(event.target.value); }} placeholder="Rechercher un nom, e-mail ou entreprise" /></label>
          <select aria-label="Filtrer par entreprise" className="platform-admin-select" value={userCompanyFilter} onChange={(event) => { setUserPage(1); setUserCompanyFilter(event.target.value); }}>
            <option value="all">Toutes les entreprises</option>
            {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <select aria-label="Filtrer par état du compte" className="platform-admin-select" value={userStatusFilter} onChange={(event) => { setUserPage(1); setUserStatusFilter(event.target.value); }}>
            <option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="inactive">Inactifs ou entreprise archivée</option>
          </select>
        </div>
        <div className="platform-admin-users-table">
          <div className="platform-admin-users-head"><span>Utilisateur</span><span>Entreprise</span><span>Rôle</span><span>Statut</span><span /></div>
          {usersLoading ? <p className="platform-admin-empty">Chargement des utilisateurs…</p> : paginatedPlatformUsers.map((user) => (
            <div className="platform-admin-user-row" key={`${user.id}-${user.company.id}`}>
              <div><strong>{user.name}</strong><small>{user.email}</small></div>
              <span className="platform-admin-user-company">{user.company.name}</span>
              <span className="platform-admin-user-role">{user.isPlatformAdmin ? "Super-admin" : user.platformRole === "PLATFORM_MANAGING_PARTNER" ? "Associé-Gérant global" : roleLabel(user.role)}</span>
              <span className={`platform-admin-user-status ${user.isActive && user.company.isActive ? "is-active" : "is-inactive"}`}>{!user.company.isActive ? "Entreprise archivée" : user.isActive ? "Actif" : "Désactivé"}</span>
              <button type="button" disabled={!user.company.isActive} onClick={() => void openCompany(user.company.id, "/users")} aria-label={`Gérer l’équipe de ${user.company.name}`} title={user.company.isActive ? "Gérer les accès de cette entreprise" : "Entreprise archivée"}><UserRoundCog size={16} /></button>
            </div>
          ))}
          {!usersLoading && !filteredPlatformUsers.length && <p className="platform-admin-empty">Aucun utilisateur pour ces filtres.</p>}
        </div>
        <div className="platform-admin-pagination" aria-label="Pagination des utilisateurs">
          <span>{filteredPlatformUsers.length ? `${(userPage - 1) * userPageSize + 1}–${Math.min(userPage * userPageSize, filteredPlatformUsers.length)} sur ${filteredPlatformUsers.length} accès` : "0 accès"}</span>
          <div><button type="button" onClick={() => setUserPage((page) => Math.max(1, page - 1))} disabled={usersLoading || userPage <= 1} aria-label="Page précédente"><ChevronLeft size={16} /> Précédent</button><span>Page {userPage} / {userTotalPages}</span><button type="button" onClick={() => setUserPage((page) => Math.min(userTotalPages, page + 1))} disabled={usersLoading || userPage >= userTotalPages} aria-label="Page suivante">Suivant <ChevronRight size={16} /></button></div>
        </div>
        <p className="platform-admin-footnote">Un même utilisateur peut avoir plusieurs accès, un par entreprise. L’action « Gérer » ouvre l’équipe concernée; elle ne change pas les droits du compte global.</p>
        <section className="platform-admin-roster-card" aria-labelledby="platform-admin-roster-title">
          <div className="platform-admin-roster-heading"><div><span className="platform-admin-roster-icon"><ShieldCheck size={18} /></span><div><p>CONTRÔLE GLOBAL</p><h3 id="platform-admin-roster-title">Super-administrateurs de la plateforme</h3></div></div><span>{platformAdmins.length} compte(s)</span></div>
          <div className="platform-admin-roster-list">
            {platformAdmins.map((admin) => <article key={admin.id}><span className="platform-admin-roster-avatar">{admin.name.trim().slice(0, 1).toLocaleUpperCase("fr-CD")}</span><div><strong>{admin.name}</strong><small>{admin.email}</small></div><span className={`platform-admin-user-status ${admin.isActive ? "is-active" : "is-inactive"}`}>{admin.isActive ? "Actif" : "Désactivé"}</span></article>)}
            {!usersLoading && !platformAdmins.length && <p className="platform-admin-empty">Aucun super-admin n’est enregistré.</p>}
          </div>
        </section>
      </section>

      <section role="tabpanel" aria-labelledby="platform-tab-reports" id="platform-panel-reports" hidden={activeTab !== "reports"} className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>RAPPORTS & JOURNAL DE LA PLATEFORME</p><h2>Rapports et activités récentes</h2></div>
          <div className="platform-admin-user-actions">
            <select value={effectiveCompanyId} onChange={(event) => { setActivityPageNumber(1); setSelectedCompanyId(event.target.value); }} aria-label="Filtrer les activités par entreprise" className="platform-admin-select">
              <option value="all">Toutes les entreprises</option>
              {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <button type="button" className="is-primary" onClick={() => void resendPendingPaymentOrderEmails()} disabled={emailResendLoading}>
              <Mail size={16} /> {emailResendLoading ? "Envoi en cours…" : "Renvoyer les OP en attente"}
            </button>
          </div>
        </div>
        {emailResendMessage && <p role="status" className="platform-admin-footnote">{emailResendMessage}</p>}
        {emailResendError && <p role="alert" className="platform-admin-error">{emailResendError}</p>}
        <p className="platform-admin-footnote">Le renvoi couvre toutes les entreprises et ignore les OP déjà transmises au Gérant.</p>
        <div className="platform-admin-activity-list" aria-live="polite">
          {activityLoading ? <p className="platform-admin-empty">Chargement du journal d’activité…</p> : activities.map((event) => (
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
          {!activityLoading && !activities.length && <p className="platform-admin-empty">Aucune activité enregistrée pour ce filtre.</p>}
        </div>
        <div className="platform-admin-pagination" aria-label="Pagination des activités">
          <span>{activityTotalCount ? `${(activityPage?.page ? activityPage.page - 1 : activityPageNumber - 1) * (activityPage?.pageSize ?? 10) + 1}–${Math.min((activityPage?.page ?? activityPageNumber) * (activityPage?.pageSize ?? 10), activityTotalCount)} sur ${activityTotalCount}` : "0 activité"}</span>
          <div>
            <button type="button" onClick={() => setActivityPageNumber((page) => Math.max(1, page - 1))} disabled={activityLoading || activityPageNumber <= 1} aria-label="Page précédente"><ChevronLeft size={16} /> Précédent</button>
            <span>Page {activityPage?.page ?? activityPageNumber} / {activityTotalPages}</span>
            <button type="button" onClick={() => setActivityPageNumber((page) => page + 1)} disabled={activityLoading || activityPageNumber >= activityTotalPages} aria-label="Page suivante">Suivant <ChevronRight size={16} /></button>
          </div>
        </div>
        <p className="platform-admin-footnote">Les activités affichées proviennent du journal d’audit de chaque entreprise. Les écritures financières ne sont pas modifiables depuis cette vue.</p>
      </section>

      <section id="settings" hidden={activeTab !== "overview"} className="platform-admin-section scroll-mt-24">
        <div className="platform-admin-section-heading">
          <div><p>ESPACE PERSONNEL</p><h2>Préférences du tableau de bord</h2><span>Vos réglages s’appliquent immédiatement à ce navigateur.</span></div>
          <Settings2 size={20} className="text-slate-400" />
        </div>
        <div className="platform-admin-settings-grid">
          <article className="platform-admin-settings-card platform-admin-settings-cards">
            <span className="platform-admin-settings-icon"><Settings2 size={18} /></span>
            <div className="platform-admin-settings-card-title"><h3>Indicateurs visibles</h3><span>{preferences.cards.length} / {defaultCards.length}</span></div>
            <p>Activez les informations utiles. Elles afficheront toujours les chiffres de l’entreprise sélectionnée.</p>
            <div className="platform-admin-settings-progress"><i style={{ width: `${(preferences.cards.length / defaultCards.length) * 100}%` }} /></div>
            <div className="platform-admin-toggle-list">
              {defaultCards.map((card) => (
                <label key={card} className="platform-admin-toggle-row">
                  <span>{cardLabels[card]}</span>
                  <input type="checkbox" checked={preferences.cards.includes(card)} onChange={() => toggleCard(card)} />
                </label>
              ))}
            </div>
            <div className="platform-admin-settings-actions"><button type="button" onClick={() => savePreferences({ ...preferences, cards: defaultCards })}>Tout afficher</button><button type="button" onClick={() => savePreferences({ ...preferences, cards: [] })}>Tout masquer</button></div>
          </article>
          <article className="platform-admin-settings-card">
            <span className="platform-admin-settings-icon"><Building2 size={18} /></span>
            <h3>Entreprise à l’ouverture</h3>
            <p>Choisissez l’espace pré-sélectionné. Vous pourrez le changer à tout moment dans le tableau de bord.</p>
            <select value={preferences.defaultCompanyId} onChange={(event) => { savePreferences({ ...preferences, defaultCompanyId: event.target.value }); setSelectedCompanyId(null); }} className="platform-admin-select w-full">
              <option value="">Choisir à chaque connexion</option>
              {(overview?.companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}{company.isActive ? "" : " · Archivée"}</option>)}
            </select>
            {overview?.companies.find((company) => company.id === preferences.defaultCompanyId) ? (() => {
              const homeCompany = overview.companies.find((company) => company.id === preferences.defaultCompanyId)!;
              return <div className="platform-admin-home-preview"><span className="platform-admin-home-preview-logo">{homeCompany.logoUrl ? <Image src={homeCompany.logoUrl} alt="" width={34} height={34} unoptimized /> : <Building2 size={17} />}</span><span><strong>{homeCompany.name}</strong><small>{homeCompany.city || homeCompany.legalName}</small></span><span className={`platform-admin-company-state ${homeCompany.isActive ? "" : "is-archived"}`}>{homeCompany.isActive ? "Active" : "Archivée"}</span></div>;
            })() : <div className="platform-admin-home-empty"><span className="platform-admin-live-dot" /> Aucun espace n’est présélectionné.</div>}
            <button type="button" className="platform-admin-settings-primary" onClick={() => { setSelectedCompanyId(preferences.defaultCompanyId || null); setActiveTab("overview"); }} disabled={!preferences.defaultCompanyId}>Ouvrir cet espace <ChevronRight size={16} /></button>
          </article>
          <article className="platform-admin-settings-card platform-admin-settings-shortcuts">
            <span className="platform-admin-settings-icon"><Activity size={18} /></span>
            <h3>Raccourcis de pilotage</h3>
            <p>Accédez directement aux écrans de gestion et de suivi.</p>
            <button type="button" onClick={() => setActiveTab("companies")}><Building2 size={16} /><span><strong>Gérer les entreprises</strong><small>{overview?.summary.companies ?? 0} espace(s) configuré(s)</small></span><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setActiveTab("users")}><Users size={16} /><span><strong>Gérer les accès</strong><small>{uniqueUserCount} utilisateur(s) d’entreprise</small></span><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setActiveTab("reports")}><Activity size={16} /><span><strong>Consulter les rapports</strong><small>Activités récentes par entreprise</small></span><ChevronRight size={16} /></button>
          </article>
        </div>
      </section>

      {userModalOpen && (
        <div className="platform-admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setUserModalOpen(false); }}>
          <section className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-modal-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape" && !userSaving) setUserModalOpen(false); }}>
            <header className="platform-admin-modal-heading"><span className="platform-admin-modal-icon"><UserPlus size={19} /></span><div><p>NOUVEL ACCÈS ENTREPRISE</p><h2 id="platform-user-modal-title">Ajouter un utilisateur</h2></div><button type="button" onClick={() => setUserModalOpen(false)} disabled={userSaving} aria-label="Fermer"><X size={18} /></button></header>
            <form onSubmit={createPlatformUser} className="platform-admin-modal-form">
              <label>Entreprise<select required value={userDraft.companyId} onChange={(event) => setUserDraft({ ...userDraft, companyId: event.target.value })}><option value="" disabled>Sélectionner une entreprise</option>{(overview?.companies ?? []).filter((company) => company.isActive).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label>E-mail du compte<input required type="email" autoComplete="email" maxLength={160} value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} placeholder="nom@entreprise.cd" /></label>
              {knownCompanyUser ? <div className="platform-admin-modal-info"><Check size={16} /><span>Compte existant détecté ({knownCompanyUser.name}). Le mot de passe ne sera pas modifié; seul l’accès à l’entreprise sélectionnée sera ajouté.</span></div> : <label>Nom complet<input required minLength={2} maxLength={120} autoComplete="name" value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} placeholder="Prénom et nom" /></label>}
              <label>Rôle dans l’entreprise<select required value={userDraft.role} onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as PlatformUserRole })}>{platformUserRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
              {!knownCompanyUser && <label>Mot de passe provisoire<div className="platform-admin-password-field"><input required minLength={14} maxLength={200} autoComplete="new-password" type={showTemporaryPassword ? "text" : "password"} value={userDraft.password} onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })} placeholder="14 caractères minimum" /><button type="button" onClick={() => setShowTemporaryPassword((shown) => !shown)} aria-label={showTemporaryPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showTemporaryPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" onClick={() => { setUserDraft({ ...userDraft, password: temporaryPassword() }); setShowTemporaryPassword(true); }}><KeyRound size={15} /> Générer</button></div><small>Transmettez ce mot de passe en privé à la personne concernée.</small></label>}
              {userActionError && <p role="alert" className="platform-admin-modal-error">{userActionError}</p>}
              <div className="platform-admin-modal-actions"><button type="button" className="is-cancel" onClick={() => setUserModalOpen(false)} disabled={userSaving}>Annuler</button><button type="submit" disabled={userSaving}>{userSaving ? "Enregistrement…" : knownCompanyUser ? "Ajouter cet accès" : "Créer l’utilisateur"}</button></div>
            </form>
          </section>
        </div>
      )}

      {adminModalOpen && (
        <div className="platform-admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminModalOpen(false); }}>
          <section className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="platform-admin-modal-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape" && !userSaving) setAdminModalOpen(false); }}>
            <header className="platform-admin-modal-heading"><span className="platform-admin-modal-icon is-violet"><ShieldCheck size={19} /></span><div><p>CONTRÔLE GLOBAL</p><h2 id="platform-admin-modal-title">Ajouter un super-admin</h2></div><button type="button" onClick={() => setAdminModalOpen(false)} disabled={userSaving} aria-label="Fermer"><X size={18} /></button></header>
            <form onSubmit={createPlatformAdmin} className="platform-admin-modal-form">
              <label>E-mail du compte<input required type="email" autoComplete="email" maxLength={160} value={adminDraft.email} onChange={(event) => setAdminDraft({ ...adminDraft, email: event.target.value })} placeholder="nom@entreprise.cd" /></label>
              {knownAccount ? <div className="platform-admin-modal-info"><Check size={16} /><span>Compte existant détecté ({knownAccount.name}). Ses identifiants et ses accès entreprise restent inchangés; les droits super-admin seront ajoutés.</span></div> : <><label>Nom complet<input required minLength={2} maxLength={120} autoComplete="name" value={adminDraft.name} onChange={(event) => setAdminDraft({ ...adminDraft, name: event.target.value })} placeholder="Prénom et nom" /></label><label>Mot de passe provisoire<div className="platform-admin-password-field"><input required minLength={14} maxLength={200} autoComplete="new-password" type={showTemporaryPassword ? "text" : "password"} value={adminDraft.password} onChange={(event) => setAdminDraft({ ...adminDraft, password: event.target.value })} placeholder="14 caractères minimum" /><button type="button" onClick={() => setShowTemporaryPassword((shown) => !shown)} aria-label={showTemporaryPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showTemporaryPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" onClick={() => { setAdminDraft({ ...adminDraft, password: temporaryPassword() }); setShowTemporaryPassword(true); }}><KeyRound size={15} /> Générer</button></div><small>Le nouveau compte aura accès au tableau global et aux entreprises.</small></label></>}
              {userActionError && <p role="alert" className="platform-admin-modal-error">{userActionError}</p>}
              <div className="platform-admin-modal-actions"><button type="button" className="is-cancel" onClick={() => setAdminModalOpen(false)} disabled={userSaving}>Annuler</button><button type="submit" disabled={userSaving}>{userSaving ? "Enregistrement…" : knownAccount ? "Attribuer le rôle" : "Créer le super-admin"}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
