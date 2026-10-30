"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BriefcaseBusiness, FileText, LayoutDashboard, Receipt, Settings, Users, Wallet, BarChart3, ShieldCheck, ChevronDown, Search, BookOpenCheck, Files, Coins } from "lucide-react";
import { AUTH_TOKEN_KEY } from "@/lib/api";

const navItems = [
  { href: "/", label: "Vue du cabinet", icon: LayoutDashboard },
  { href: "/clients", label: "Dossiers clients", icon: Users },
  { href: "/sales", label: "Missions comptables", icon: BriefcaseBusiness },
  { href: "/invoices", label: "Factures d’honoraires", icon: Receipt },
  { href: "/quotes", label: "Devis & lettres de mission", icon: FileText },
  { href: "/documents", label: "Pièces comptables", icon: Files },
  { href: "/payments", label: "Trésorerie & règlements", icon: Wallet },
  { href: "/expenses", label: "Charges du cabinet", icon: Coins },
  { href: "/reports", label: "États & rapports", icon: BarChart3 },
  { href: "/fiscal", label: "Fiscalité & échéances", icon: BookOpenCheck },
  { href: "/users", label: "Équipe & permissions", icon: ShieldCheck },
  { href: "/settings", label: "Paramètres du cabinet", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-sm print:hidden lg:hidden">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-200">FACTURA</p>
            <p className="font-semibold">Cabinet Transparency</p>
          </div>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium">
              Menu
            </summary>
            <nav className="absolute right-0 z-30 mt-2 max-h-[75vh] w-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    pathname === href
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </details>
          {pathname !== "/login" && (
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm"
            >
              Quitter
            </button>
          )}
        </header>
        <aside className="hidden w-72 shrink-0 rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-100 shadow-xl print:hidden lg:block">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 font-semibold">F</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-200">FACTURA</p>
              <h1 className="text-lg font-semibold">Transparency SARL</h1>
            </div>
          </div>

          <button className="mb-6 flex w-full items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-left">
            <span>
              <span className="block text-[10px] uppercase tracking-[0.15em] text-slate-400">Espace de travail</span>
              <span className="mt-1 block text-sm font-medium">Cabinet Transparency</span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-400">
            <Search className="h-3.5 w-3.5" />
            <span>Rechercher un dossier...</span>
            <kbd className="ml-auto rounded border border-slate-700 px-1.5 py-0.5">⌘ K</kbd>
          </div>

          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Gestion comptable</p>
          <nav className="space-y-2">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:bg-white print:p-0 print:shadow-none lg:p-7">
          {pathname !== "/login" && (
            <div className="mb-5 hidden justify-end print:hidden lg:flex">
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Se déconnecter
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
