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
  const { profile } = useCompanyProfile();
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [userRole, setUserRole] = useState("");
  const mobileMenuOpen = mobileMenuPath === pathname;
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const companyName = companyDisplayName(profile);
  const location = companyLocation(profile);
  const activePage =
    allNavigationItems.find((item) => pathname === item.href) ??
    allNavigationItems.find((item) => isActiveRoute(pathname, item.href));
  const activeHref = activePage?.href;
  const visibleNavigationGroups = userRole === "MANAGING_PARTNER"
    ? navigationGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => managingPartnerPaths.includes(item.href)),
      })).filter((group) => group.items.length > 0)
    : navigationGroups;
  const visiblePrimaryNavigation = userRole === "MANAGING_PARTNER"
    ? managingPartnerNavigation
    : primaryNavigation;

  useEffect(() => {
    if (userRole !== "MANAGING_PARTNER") return;
    const isAllowed = managingPartnerPaths.some((path) => isActiveRoute(pathname, path)) || pathname === "/notifications";
    if (!isAllowed) router.replace("/payment-orders");
  }, [pathname, router, userRole]);

  useEffect(() => {
    if (!getSessionToken()) return;
    let active = true;
    const refreshNotifications = () => {
      void apiRequest<{ unreadCount: number }>("/notifications")
        .then((data) => {
          if (active) setUnreadNotifications(data.unreadCount);
        })
        .catch(() => undefined);
    };
    void apiRequest<{ role: string }>("/auth/me")
      .then((user) => { if (active) setUserRole(user.role); })
      .catch(() => undefined);
    refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
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
    <div className="app-frame">
      <div className="app-layout">
        <aside className="app-sidebar print:hidden">
          <Link href="/settings" className="app-workspace-card">
            <span className="app-workspace-avatar">
              {companyName.slice(0, 1).toLocaleUpperCase("fr")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="app-workspace-label">Cabinet comptable</span>
              <span className="app-workspace-name">{companyName}</span>
              <span className="app-workspace-location">{location}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>

          <nav className="app-navigation" aria-label="Navigation principale">
            <p className="app-navigation-overline">Menu principal</p>
            {visibleNavigationGroups.map((group) => {
              const groupActive = group.items.some(({ href }) =>
                isActiveRoute(pathname, href),
              );
              const expanded = expandedGroups[group.label] ?? groupActive;
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
              Devise principale
              <strong>{profile?.currencyCode ?? "CDF"}</strong>
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
              href="/"
              className="app-shell-brand"
              aria-label="Cabinet Transparency, accueil"
            >
              <Image
                src="/branding/ctrs-logo.jpg"
                alt="Cabinet Transparency"
                width={369}
                height={85}
                priority
                className="app-brand-logo"
              />
            </Link>
            <div className="app-mobile-brand">
              <Link href="/" aria-label="Cabinet Transparency, accueil">
                <Image
                  src="/branding/ctrs-logo.jpg"
                  alt="Cabinet Transparency"
                  width={369}
                  height={85}
                  priority
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
              {visiblePrimaryNavigation.map(({ href, label, icon: Icon, paths }) => {
                const active = isActiveModule(pathname, paths);
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
              <Link
                href="/settings"
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
                    src="/branding/ctrs-logo.jpg"
                    alt="Cabinet Transparency"
                    width={369}
                    height={85}
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
                      Cabinet comptable
                    </span>
                    <span className="app-workspace-name">{companyName}</span>
                    <span className="app-workspace-location">{location}</span>
                  </span>
                  <span className="app-mobile-currency">
                    {profile?.currencyCode ?? "CDF"}
                  </span>
                </div>
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
                  {visibleNavigationGroups.map((group) => {
                    const groupActive = group.items.some(({ href }) =>
                      isActiveRoute(pathname, href),
                    );
                    const expanded = expandedGroups[group.label] ?? groupActive;
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
