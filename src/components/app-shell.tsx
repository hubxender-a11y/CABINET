"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Paintbrush,
  RefreshCw,
  Receipt,
  Settings,
  Users,
  Wallet,
  ScrollText,
  X,
} from "lucide-react";
import { getSessionToken, setSessionToken } from "@/lib/session";
import { apiRequest } from "@/lib/api";
import {
  companyDisplayName,
  companyLocation,
  useCompanyProfile,
} from "@/components/company-profile";

const navigationGroups = [
  {
    label: "Espace cabinet",
    icon: BriefcaseBusiness,
    items: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/clients", label: "Dossiers clients", icon: Users },
      { href: "/invoices", label: "Factures clients", icon: Receipt },
      { href: "/payments", label: "Règlements clients", icon: Wallet },
      { href: "/purchases", label: "Bons de commande", icon: Receipt },
      { href: "/funding", label: "Approvisionnements", icon: Wallet },
      { href: "/cash-vouchers", label: "Bons de sortie caisse", icon: Receipt },
      { href: "/payment-orders", label: "Ordres de paiement", icon: ScrollText },
      { href: "/recouvrement", label: "Recouvrement", icon: CalendarClock },
      { href: "/expenses", label: "Dépenses", icon: Receipt },
      { href: "/fiscal", label: "Suivi fiscal", icon: Landmark },
      { href: "/reports", label: "Rapports", icon: BarChart3 },
    ],
  },
  {
    label: "Patrimoine",
    icon: Building2,
    items: [
      { href: "/stocks", label: "Stocks", icon: Boxes },
      { href: "/patrimoine", label: "Patrimoine", icon: Building2 },
    ],
  },
  {
    label: "Archivage",
    icon: Archive,
    items: [{ href: "/documents", label: "Archives", icon: Archive }],
  },
  {
    label: "Configuration",
    icon: Settings,
    items: [
      { href: "/settings", label: "Paramètres du cabinet", icon: Settings },
      {
        href: "/settings/invoice-template",
        label: "Modèle de facture",
        icon: Paintbrush,
      },
      { href: "/users", label: "Utilisateurs & accès", icon: Users },
    ],
  },
];

const allNavigationItems = navigationGroups.flatMap((group) => group.items);
const managingPartnerPaths = ["/payment-orders", "/funding", "/cash-vouchers", "/documents", "/reports"];
const managingPartnerNavigation = [
  { href: "/payment-orders", label: "Ordres de paiement", icon: ScrollText, paths: ["/payment-orders"] },
  { href: "/funding", label: "Approvisionnements", icon: Wallet, paths: ["/funding"] },
  { href: "/cash-vouchers", label: "Bons de sortie", icon: Receipt, paths: ["/cash-vouchers"] },
  { href: "/documents", label: "Archivage", icon: Archive, paths: ["/documents"] },
  { href: "/reports", label: "Rapports", icon: BarChart3, paths: ["/reports"] },
];
const globalManagingPartnerPaths = ["/managing-partner", "/", "/clients", "/invoices", "/payments", "/purchases", "/funding", "/payment-orders", "/cash-vouchers", "/expenses", "/fiscal", "/patrimoine", "/reports", "/notifications", "/documents"];
const globalManagingPartnerNavigation = [
  { label: "Pilotage global", icon: LayoutDashboard, items: [{ href: "/managing-partner", label: "Toutes les entreprises", icon: Building2 }] },
  { label: "Finance & trésorerie", icon: Wallet, items: [
    { href: "/payment-orders", label: "Ordres de paiement", icon: ScrollText },
    { href: "/funding", label: "Approvisionnements", icon: Wallet },
    { href: "/cash-vouchers", label: "Bons de sortie caisse", icon: Receipt },
    { href: "/invoices", label: "Factures", icon: Receipt },
    { href: "/payments", label: "Règlements", icon: Wallet },
    { href: "/purchases", label: "Bons de commande", icon: Receipt },
  ] },
  { label: "Suivi", icon: BarChart3, items: [
    { href: "/clients", label: "Dossiers clients", icon: Users },
    { href: "/reports", label: "Rapports", icon: BarChart3 },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/documents", label: "Archives", icon: Archive },
    { href: "/expenses", label: "Dépenses", icon: Receipt },
    { href: "/fiscal", label: "Suivi fiscal", icon: Landmark },
    { href: "/patrimoine", label: "Patrimoine", icon: Building2 },
  ] },
];

const primaryNavigation = [
  {
    href: "/clients",
    label: "Dossiers",
    icon: Users,
    paths: ["/clients"],
  },
  {
    href: "/invoices",
    label: "Gestion",
    icon: Receipt,
    paths: ["/invoices", "/payments", "/funding", "/cash-vouchers", "/payment-orders", "/recouvrement", "/expenses", "/fiscal", "/reports"],
  },
  {
    href: "/patrimoine",
    label: "Patrimoine",
    icon: Building2,
    paths: ["/stocks", "/patrimoine"],
  },
  {
    href: "/documents",
    label: "Archivage",
    icon: Archive,
    paths: ["/documents"],
  },
];

const platformNavigationGroups = [
  {
    label: "Tableau de bord",
    icon: LayoutDashboard,
    items: [
      { href: "/platform-admin#overview", label: "Vue globale", icon: LayoutDashboard },
    ],
  },
  {
    label: "Configuration",
    icon: Settings,
    items: [
      { href: "/platform-admin#companies", label: "Gestion des entreprises", icon: Building2 },
      { href: "/platform-admin#users", label: "Gestion des utilisateurs", icon: Users },
      { href: "/platform-admin#themes", label: "Thèmes & identité", icon: Paintbrush },
      { href: "/platform-admin#reports", label: "Rapports des entreprises", icon: BarChart3 },
    ],
  },
];

const platformPrimaryNavigation = [
  { href: "/platform-admin#overview", label: "Vue globale", icon: LayoutDashboard, paths: ["/platform-admin"] },
  { href: "/platform-admin#companies", label: "Entreprises", icon: Building2, paths: ["/platform-admin"] },
  { href: "/platform-admin#reports", label: "Rapports", icon: BarChart3, paths: ["/platform-admin"] },
];

function isActiveRoute(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function isActiveModule(pathname: string, paths: string[]) {
  return paths.some((path) => isActiveRoute(pathname, path));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, refreshProfile } = useCompanyProfile();
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [userRole, setUserRole] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string; role: string }[]>([]);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [companySwitchError, setCompanySwitchError] = useState("");
  const isPlatformAdmin = userRole === "PLATFORM_SUPER_ADMIN";
  const isGlobalManagingPartner = userRole === "PLATFORM_MANAGING_PARTNER";
  const isPlatformConsole = isPlatformAdmin && pathname === "/platform-admin";
  const mobileMenuOpen = mobileMenuPath === pathname;
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const companyName = isPlatformConsole ? "Administration globale" : companyDisplayName(profile);
  const location = isPlatformConsole ? "Toutes les entreprises" : companyLocation(profile);
  const workspaceLogo = !isPlatformConsole && profile?.logoUrl
    ? profile.logoUrl
    : "/branding/ctrs-logo.jpg";
  const activePage = isPlatformConsole
    ? { href: "/platform-admin", label: "Vue globale", icon: LayoutDashboard }
    : isGlobalManagingPartner
      ? globalManagingPartnerNavigation.flatMap((group) => group.items).find((item) => isActiveRoute(pathname, item.href))
      : allNavigationItems.find((item) => pathname === item.href) ??
      allNavigationItems.find((item) => isActiveRoute(pathname, item.href));
  const activeHref = isPlatformConsole ? "/platform-admin" : activePage?.href;
  const visibleNavigationGroups = isGlobalManagingPartner
    ? globalManagingPartnerNavigation
    : userRole === "MANAGING_PARTNER"
    ? navigationGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => managingPartnerPaths.includes(item.href)),
      })).filter((group) => group.items.length > 0)
    : navigationGroups;
  const visiblePrimaryNavigation = isGlobalManagingPartner
    ? globalManagingPartnerNavigation.flatMap((group) => group.items.map((item) => ({ ...item, paths: [item.href] })))
    : userRole === "MANAGING_PARTNER"
    ? managingPartnerNavigation
    : primaryNavigation;
  const currentNavigationGroups = isPlatformConsole
    ? platformNavigationGroups
    : visibleNavigationGroups;
  const currentPrimaryNavigation = isPlatformConsole
    ? platformPrimaryNavigation
    : visiblePrimaryNavigation;

  useEffect(() => {
    if (isGlobalManagingPartner) {
      const allowed = globalManagingPartnerPaths.some((path) => isActiveRoute(pathname, path));
      if (!allowed) router.replace("/managing-partner");
      return;
    }
    if (userRole !== "MANAGING_PARTNER") return;
    const isAllowed = managingPartnerPaths.some((path) => isActiveRoute(pathname, path)) || pathname === "/notifications";
    if (!isAllowed) router.replace("/payment-orders");
  }, [isGlobalManagingPartner, pathname, router, userRole]);

  useEffect(() => {
    if (!getSessionToken()) return;
    let active = true;
    let timer: number | undefined;
    const refreshNotifications = () => {
      void apiRequest<{ unreadCount: number }>("/notifications")
        .then((data) => {
          if (active) setUnreadNotifications(data.unreadCount);
        })
        .catch(() => undefined);
    };
    void apiRequest<{ role: string }>("/auth/me")
      .then((user) => {
        if (!active) return;
        setUserRole(user.role);
        if (user.role === "PLATFORM_SUPER_ADMIN") {
          setUnreadNotifications(0);
          return;
        }
        refreshNotifications();
        timer = window.setInterval(refreshNotifications, 30_000);
      })
      .catch(() => undefined);
    void apiRequest<{ id: string; name: string; role: string }[]>("/auth/companies")
      .then((available) => { if (active) setCompanies(available); })
      .catch(() => undefined);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [pathname]);

  function toggleNavigationGroup(label: string, expanded: boolean) {
    setExpandedGroups((current) => ({
      ...current,
      [label]: !expanded,
    }));
  }
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const menuTrigger = mobileMenuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileMenuCloseButtonRef.current?.focus();

    const desktopViewport = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuPath(null);
    };
    desktopViewport.addEventListener("change", closeOnDesktop);

    return () => {
      document.body.style.overflow = previousOverflow;
      desktopViewport.removeEventListener("change", closeOnDesktop);
      menuTrigger?.focus();
    };
  }, [mobileMenuOpen]);

  function logout() {
    setSessionToken(null);
    router.replace("/login");
  }

  async function switchCompany(companyId: string) {
    if (!companyId || switchingCompany) return;
    setSwitchingCompany(true);
    setCompanySwitchError("");
    try {
      const session = await apiRequest<{ accessToken: string }>("/auth/switch-company", {
        method: "POST",
        body: JSON.stringify({ companyId }),
      });
      setSessionToken(session.accessToken);
      await refreshProfile();
      router.replace("/");
    } catch (caught) {
      setCompanySwitchError(caught instanceof Error ? caught.message : "Changement d’entreprise impossible.");
      setSwitchingCompany(false);
    }
  }

  function handleMobileMenuKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      setMobileMenuPath(null);
      return;
    }

    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      "a[href], button:not(:disabled)",
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement?.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement?.focus();
    }
  }

  if (pathname === "/login") {
    return <div className="app-login">{children}</div>;
  }

  return (
    <div
      className="app-frame"
      style={{
        "--brand": profile?.primaryColor ?? "#e60000",
        "--brand-deep": profile?.primaryColor ?? "#a90000",
        "--brand-gold": profile?.accentColor ?? "#ffcc00",
        "--brand-blue-600": profile?.primaryColor ?? "#e60000",
        "--brand-blue-700": profile?.primaryColor ?? "#c40000",
        "--brand-blue-800": profile?.primaryColor ?? "#a90000",
      } as React.CSSProperties}
    >
      <div className="app-layout">
        <aside className="app-sidebar print:hidden">
          {companies.length > 1 && !isPlatformAdmin && (
            <div className="px-3 pt-3">
              <label className="sr-only" htmlFor="active-company">Entreprise active</label>
              <select
                id="active-company"
                value={profile?.id ?? ""}
                disabled={switchingCompany}
                onChange={(event) => void switchCompany(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-500 disabled:opacity-60"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
              {companySwitchError && <p role="alert" className="px-1 pt-1 text-xs text-rose-700">{companySwitchError}</p>}
            </div>
          )}
          <Link href={isPlatformConsole ? "/platform-admin#settings" : "/settings"} className="app-workspace-card">
            <span className="app-workspace-avatar">
              {companyName.slice(0, 1).toLocaleUpperCase("fr")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="app-workspace-label">{isPlatformConsole ? "CONSOLE SUPER-ADMIN" : isPlatformAdmin ? "EXPLORATION SUPER-ADMIN" : isGlobalManagingPartner ? "ASSOCIÉ-GÉRANT GLOBAL" : "Cabinet comptable"}</span>
              <span className="app-workspace-name">{companyName}</span>
              <span className="app-workspace-location">{location}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>
          {isPlatformAdmin && !isPlatformConsole && (
            <Link href="/platform-admin" className="mx-3 mb-2 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100">
              <LayoutDashboard className="h-4 w-4" /> Retour au tableau global
            </Link>
          )}

          <nav className="app-navigation" aria-label="Navigation principale">
            <p className="app-navigation-overline">Menu principal</p>
            {currentNavigationGroups.map((group) => {
              const groupActive = group.items.some(({ href }) =>
                isActiveRoute(pathname, href),
              );
              const expanded = expandedGroups[group.label] ?? (isPlatformConsole || groupActive);
              return (
                <div key={group.label} className="app-navigation-group">
                  <button
                    type="button"
                    className={`app-navigation-heading ${groupActive ? "is-active" : ""}`}
                    aria-expanded={expanded}
                    onClick={() => toggleNavigationGroup(group.label, expanded)}
                  >
                    <group.icon
                      className="app-navigation-heading-icon"
                      aria-hidden="true"
                    />
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`app-navigation-chevron ${expanded ? "is-expanded" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {expanded && (
                    <div className="app-navigation-items space-y-1">
                      {group.items.map(({ href, label, icon: Icon }) => {
                        const active = activeHref
                          ? activeHref === href
                          : isActiveRoute(pathname, href);
                        return (
                          <Link
                            key={href}
                            href={href}
                            className={`app-navigation-link ${active ? "is-active" : ""}`}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon
                              className="h-[18px] w-[18px] shrink-0"
                              strokeWidth={active ? 2.2 : 1.8}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {label}
                            </span>
                            {active && (
                              <span className="app-navigation-indicator" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="app-sidebar-footer">
            <div className="app-currency-chip">
              <span className="app-live-dot" />
              {isPlatformConsole ? "Périmètre" : "Devise principale"}
              <strong>{isPlatformConsole ? "Global" : profile?.currencyCode ?? "CDF"}</strong>
            </div>
            <button type="button" onClick={logout} className="app-logout-link">
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </button>
            <a
              href="/guide-utilisation-cabinet-transparency.pdf"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <BookOpen className="h-4 w-4" />
              Guide utilisateur
            </a>
            <p className="app-sidebar-version">Gestion professionnelle · RDC</p>
          </div>
        </aside>

        <div className="app-content">
          <header className="app-topbar print:hidden">
            <Link
              href={isPlatformConsole ? "/platform-admin" : "/"}
              className="app-shell-brand"
              aria-label="Cabinet Transparency, accueil"
            >
              <Image
                src={workspaceLogo}
                alt={isPlatformConsole ? "Cabinet Transparency" : companyName}
                width={369}
                height={85}
                priority
                unoptimized={workspaceLogo.startsWith("data:")}
                className="app-brand-logo"
              />
            </Link>
            <div className="app-mobile-brand">
              <Link href={isPlatformConsole ? "/platform-admin" : "/"} aria-label="Cabinet Transparency, accueil">
                <Image
                  src={workspaceLogo}
                  alt={isPlatformConsole ? "Cabinet Transparency" : companyName}
                  width={369}
                  height={85}
                  priority
                  unoptimized={workspaceLogo.startsWith("data:")}
                  className="app-brand-logo"
                />
              </Link>
            </div>
            <button
              type="button"
              ref={mobileMenuButtonRef}
              onClick={() =>
                setMobileMenuPath(mobileMenuOpen ? null : pathname)
              }
              className="app-mobile-menu-button"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <nav
              className="app-primary-navigation"
              aria-label="Modules principaux"
            >
              {currentPrimaryNavigation.map(({ href, label, icon: Icon, paths }) => {
                const active = isPlatformConsole ? label === "Vue globale" : isActiveModule(pathname, paths);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`app-primary-link app-module-link ${active ? "is-active" : ""}`}
                    aria-current={active ? "true" : undefined}
                    title={label}
                  >
                    <Icon className="app-module-icon" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="app-topbar-actions">
              <span className="app-location-pill">
                {activePage?.label ?? location}
              </span>
              {!isPlatformConsole && (
                <Link
                  href="/notifications"
                  className={`app-icon-action relative app-notification-bell ${unreadNotifications ? "has-unread" : ""}`}
                  aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} non lue(s)` : "Notifications"}
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifications > 0 && (
                    <span className="app-notification-count absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {unreadNotifications > 99 ? "99+" : unreadNotifications}
                    </span>
                  )}
                </Link>
              )}
              <Link
                href={isPlatformConsole ? "/platform-admin#settings" : "/settings"}
                className="app-icon-action"
                aria-label="Paramètres"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="app-icon-action"
                aria-label="Actualiser"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </header>

          {mobileMenuOpen && (
            <div className="app-mobile-menu-backdrop print:hidden">
              <button
                type="button"
                className="app-mobile-menu-overlay"
                aria-label="Fermer le menu"
                onClick={() => setMobileMenuPath(null)}
              />
              <aside
                className="app-mobile-navigation"
                id="mobile-navigation"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-navigation-title"
                onKeyDown={handleMobileMenuKeyDown}
              >
                <div className="app-mobile-navigation-header">
                  <Image
                    src={workspaceLogo}
                    alt={isPlatformConsole ? "Cabinet Transparency" : companyName}
                    width={369}
                    height={85}
                    unoptimized={workspaceLogo.startsWith("data:")}
                    className="app-brand-logo"
                  />
                  <button
                    type="button"
                    ref={mobileMenuCloseButtonRef}
                    onClick={() => setMobileMenuPath(null)}
                    className="app-mobile-menu-close"
                    aria-label="Fermer le menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="app-mobile-navigation-profile">
                  <span className="app-workspace-avatar">
                    {companyName.slice(0, 1).toLocaleUpperCase("fr")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="app-workspace-label">
                      {isPlatformConsole ? "CONSOLE SUPER-ADMIN" : isPlatformAdmin ? "EXPLORATION SUPER-ADMIN" : isGlobalManagingPartner ? "ASSOCIÉ-GÉRANT GLOBAL" : "Cabinet comptable"}
                    </span>
                    <span className="app-workspace-name">{companyName}</span>
                    <span className="app-workspace-location">{location}</span>
                  </span>
                  <span className="app-mobile-currency">
                    {isPlatformConsole ? "Global" : profile?.currencyCode ?? "CDF"}
                  </span>
                </div>
                {isPlatformAdmin && !isPlatformConsole && (
                  <Link href="/platform-admin" onClick={() => setMobileMenuPath(null)} className="mx-3 mt-2 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
                    <LayoutDashboard className="h-4 w-4" /> Retour au tableau global
                  </Link>
                )}
                {!isPlatformConsole && (
                  <Link
                    href="/notifications"
                    onClick={() => setMobileMenuPath(null)}
                    className="app-mobile-notifications-link"
                  >
                    <Bell className="h-4 w-4" />
                    <span>Notifications</span>
                    {unreadNotifications > 0 && (
                      <strong>{unreadNotifications > 99 ? "99+" : unreadNotifications}</strong>
                    )}
                  </Link>
                )}
                <h2
                  className="app-mobile-navigation-title"
                  id="mobile-navigation-title"
                >
                  Navigation
                </h2>
                <nav
                  className="app-mobile-navigation-content"
                  aria-label="Navigation principale"
                >
                  {currentNavigationGroups.map((group) => {
                    const groupActive = group.items.some(({ href }) =>
                      isActiveRoute(pathname, href),
                    );
                    const expanded = expandedGroups[group.label] ?? (isPlatformConsole || groupActive);
                    return (
                      <section
                        key={group.label}
                        className="app-mobile-navigation-group"
                      >
                        <button
                          type="button"
                          className={`app-navigation-heading ${groupActive ? "is-active" : ""}`}
                          aria-expanded={expanded}
                          onClick={() =>
                            toggleNavigationGroup(group.label, expanded)
                          }
                        >
                          <group.icon
                            className="app-navigation-heading-icon"
                            aria-hidden="true"
                          />
                          <span>{group.label}</span>
                          <ChevronDown
                            className={`app-navigation-chevron ${expanded ? "is-expanded" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                        {expanded &&
                          group.items.map(({ href, label, icon: Icon }) => {
                            const active = activeHref === href;
                            return (
                              <Link
                                key={href}
                                href={href}
                                onClick={() => setMobileMenuPath(null)}
                                className={`app-navigation-link ${active ? "is-active" : ""}`}
                                aria-current={active ? "page" : undefined}
                              >
                                <Icon className="h-[18px] w-[18px]" />
                                <span className="flex-1">{label}</span>
                                <ChevronRight className="h-4 w-4 app-mobile-link-chevron" />
                              </Link>
                            );
                          })}
                      </section>
                    );
                  })}
                </nav>
                <div className="app-mobile-navigation-footer">
                  <button
                    type="button"
                    onClick={logout}
                    className="app-logout-link"
                  >
                    <LogOut className="h-4 w-4" />
                    Se déconnecter
                  </button>
                  <a
                    href="/guide-utilisation-cabinet-transparency.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <BookOpen className="h-4 w-4" />
                    Guide utilisateur
                  </a>
                  <p className="app-sidebar-version">
                    Cabinet Transparency · Gestion du cabinet
                  </p>
                </div>
              </aside>
            </div>
          )}

          <main className="app-main">
            <div className="app-page-content">{children}</div>
            <footer className="app-page-footer print:hidden">
              <span>{companyName}</span>
              <span>·</span>
              <span>{location}</span>
              <span className="ml-auto">Cabinet Transparency · Gestion du cabinet</span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
