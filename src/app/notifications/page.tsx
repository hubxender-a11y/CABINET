"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck, ClipboardList, FileText, Receipt, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

type NotificationResponse = { notifications: NotificationItem[]; unreadCount: number };

function destination(title: string) {
  if (title.startsWith("Facture impayée")) return "/recouvrement";
  if (title.startsWith("OP à examiner") || title.startsWith("OP rejetée")) return "/payment-orders";
  if (title.startsWith("OP approuvée") || title.startsWith("Bon de sortie")) return "/cash-vouchers";
  if (title.startsWith("Rapport à vérifier")) return "/reports";
  return "/notifications";
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kinshasa",
  }).format(date);
}

function iconFor(title: string) {
  if (title.startsWith("Facture impayée")) return FileText;
  if (title.startsWith("OP")) return ClipboardList;
  if (title.startsWith("Bon de sortie")) return Receipt;
  if (title.startsWith("Rapport")) return FileText;
  return Bell;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try {
      setData(await apiRequest<NotificationResponse>("/notifications"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de charger les notifications.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function markAllRead() {
    setBusy(true);
    try {
      await apiRequest("/notifications/read-all", { method: "PATCH" });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La mise à jour a échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id: string) {
    try {
      await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      setData((current) => current ? {
        ...current,
        unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === id && !item.read) ? 1 : 0)),
        notifications: current.notifications.map((item) => item.id === id ? { ...item, read: true } : item),
      } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La notification n’a pas pu être marquée comme lue.");
    }
  }

  async function openNotification(event: React.MouseEvent<HTMLAnchorElement>, item: NotificationItem) {
    event.preventDefault();
    if (!item.read) await markRead(item.id);
    router.push(destination(item.title));
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Suivi des validations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Notifications</h1>
          <p className="mt-2 text-sm text-slate-600">Les OP à examiner, factures impayées, bons de sortie caisse et rapports transmis au Gérant apparaissent ici.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
          <button type="button" onClick={() => void markAllRead()} disabled={busy || !data?.unreadCount} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            <CheckCheck className="h-4 w-4" /> Tout marquer comme lu
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Historique des notifications">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Historique récent</h2>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{data?.unreadCount ?? 0} non lue(s)</span>
        </div>
        {!data ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Chargement des notifications…</p>
        ) : data.notifications.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">Aucune notification pour le moment</p>
            <p className="mt-1 text-sm text-slate-500">Une alerte apparaîtra ici lorsqu’une OP, une facture, un bon de sortie ou un rapport nécessitera un suivi.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.notifications.map((item) => {
              const Icon = iconFor(item.title);
              return (
                <li key={item.id} className={`flex gap-4 px-5 py-4 ${item.read ? "bg-white" : "bg-amber-50/60"}`}>
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.read ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      {!item.read && <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Nouvelle</span>}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                      <time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time>
                      <Link href={destination(item.title)} onClick={(event) => void openNotification(event, item)} className="font-semibold text-blue-800 hover:underline">Ouvrir le dossier</Link>
                      {!item.read && <button type="button" onClick={() => void markRead(item.id)} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"><Check className="h-3.5 w-3.5" /> Marquer comme lue</button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
