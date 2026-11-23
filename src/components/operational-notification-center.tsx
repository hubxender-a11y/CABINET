"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, FileText, Receipt, ScrollText, Sparkles } from "lucide-react";
import { useOperationalAlerts } from "@/lib/use-operational-alerts";

export function OperationalNotificationCenter() {
  const [open, setOpen] = useState(false);
  const { alerts, notificationCount, loading, hasLoadError } = useOperationalAlerts();

  return (
    <div className="operational-notifications">
      <button
        type="button"
        className={`operational-notifications-trigger ${notificationCount ? "has-alerts" : ""}`}
        aria-label={`Notifications${notificationCount ? `, ${notificationCount} éléments` : ""}`}
        aria-expanded={open}
        aria-controls="operational-notifications-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4 w-4" />
        <span className="operational-notifications-label">Notifications</span>
        {notificationCount > 0 && <span className="operational-notifications-count">{notificationCount > 99 ? "99+" : notificationCount}</span>}
      </button>
      {open && (
        <section id="operational-notifications-panel" className="operational-notifications-panel" aria-label="Notifications du cabinet">
          <header className="operational-notifications-heading">
            <span className="operational-notifications-heading-icon"><Sparkles className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <strong>À suivre au cabinet</strong>
              <small>{loading ? "Actualisation des données…" : `${notificationCount} élément${notificationCount === 1 ? "" : "s"} à consulter`}</small>
            </span>
            <button type="button" onClick={() => setOpen(false)} className="operational-notifications-close" aria-label="Fermer les notifications">×</button>
          </header>
          <div className="operational-notifications-list">
            {hasLoadError && (
              <div className="operational-notifications-warning" role="status">
                Certaines alertes n’ont pas pu être actualisées. Réessayez après quelques instants.
              </div>
            )}
            {alerts.length ? alerts.map((alert) => {
              const Icon = alert.kind === "order" ? ScrollText : alert.kind === "invoice" ? FileText : Receipt;
              return (
                <Link key={alert.id} href={alert.href} className={`operational-notification-item is-${alert.kind} ${alert.urgent ? "is-urgent" : ""}`} onClick={() => setOpen(false)}>
                  <span className="operational-notification-icon"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <strong>{alert.title}</strong>
                    <small>{alert.detail}</small>
                  </span>
                  <span className="operational-notification-dot" aria-hidden="true" />
                </Link>
              );
            }) : !hasLoadError ? (
              <div className="operational-notifications-empty">
                <span>✓</span>
                <strong>Tout est à jour</strong>
                <small>Les nouvelles OP, factures impayées et bons émis apparaîtront ici.</small>
              </div>
            ) : null}
          </div>
          <footer className="operational-notifications-footer">
            <Link href="/payment-orders" onClick={() => setOpen(false)}>Ouvrir le suivi du cabinet <span>→</span></Link>
          </footer>
        </section>
      )}
    </div>
  );
}
