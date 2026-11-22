"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Link2, LoaderCircle, Mail, Send, ShieldCheck, Unlink } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { sessionRole } from "@/lib/session";

type MailStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  recipient: string;
};

export function MailSettingsPanel() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"connect" | "test" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [canConfigure, setCanConfigure] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<MailStatus>("/mail-settings");
      setStatus(result);
      const params = new URLSearchParams(window.location.search);
      if (params.get("mail") === "connected") {
        setMessage({ kind: "success", text: `Gmail ${result.email ?? ""} est connecté.` });
        params.delete("mail");
        const query = params.toString();
        const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", next);
      } else if (params.get("mail") === "error") {
        setMessage({ kind: "error", text: "Google n’a pas terminé la connexion. Vérifiez les paramètres OAuth puis réessayez." });
        params.delete("mail");
        const query = params.toString();
        const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", next);
      }
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Impossible de charger la configuration e-mail." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = sessionRole(window.localStorage.getItem("factura-access-token"));
    const canManageCompanyMail = role === "COMPANY_ADMIN" || role === "PLATFORM_SUPER_ADMIN";
    setCanConfigure(canManageCompanyMail);
    if (canManageCompanyMail) void refresh();
    else setLoading(false);
  }, [refresh]);

  async function connect() {
    setBusy("connect");
    setMessage(null);
    try {
      const result = await apiRequest<{ authorizationUrl: string }>("/mail-settings/google/connect", { method: "POST" });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Impossible de démarrer la connexion Google." });
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setMessage(null);
    try {
      const result = await apiRequest<{ sent: boolean; recipient: string }>("/mail-settings/test", { method: "POST" });
      setMessage({ kind: "success", text: `E-mail de test envoyé à ${result.recipient}. Vérifiez sa boîte de réception.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "L’envoi du test a échoué." });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Déconnecter ce compte Gmail ? Les prochaines notifications d’OP de cette société ne pourront plus être envoyées.")) return;
    setBusy("disconnect");
    setMessage(null);
    try {
      await apiRequest("/mail-settings/google", { method: "DELETE" });
      await refresh();
      setMessage({ kind: "success", text: "Le compte Gmail a été déconnecté." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "La déconnexion a échoué." });
    } finally {
      setBusy(null);
    }
  }

  if (!canConfigure) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="mail-settings-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><Mail size={20} /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Notifications des OP</p>
            <h2 id="mail-settings-heading" className="mt-1 text-lg font-semibold text-slate-900">Connexion Gmail</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Les ordres de paiement transmis seront envoyés à l’Associé-Gérant avec l’OP et l’état de besoin en pièces jointes.</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${status?.connected ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          <span className={`h-2 w-2 rounded-full ${status?.connected ? "bg-emerald-500" : "bg-amber-500"}`} />
          {loading ? "Vérification…" : status?.connected ? "Connecté" : "Non connecté"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          {status?.connected ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} />
              <div><p className="font-medium text-slate-900">{status.email}</p><p className="mt-1 text-sm text-slate-600">Destinataire des OP : {status.recipient}</p></div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={19} />
              <div><p className="font-medium text-slate-900">Autorisation Google sécurisée</p><p className="mt-1 text-sm leading-6 text-slate-600">La connexion s’effectue chez Google. Si une vérification en deux étapes est demandée, saisissez le code uniquement sur la page Google. Facture Client ne reçoit ni ne conserve ce code.</p></div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.connected ? <>
            <button type="button" onClick={() => void test()} disabled={Boolean(busy) || loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {busy === "test" ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} Envoyer un test
            </button>
            <button type="button" onClick={() => void disconnect()} disabled={Boolean(busy) || loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === "disconnect" ? <LoaderCircle className="animate-spin" size={16} /> : <Unlink size={16} />} Déconnecter
            </button>
          </> : <button type="button" onClick={() => void connect()} disabled={Boolean(busy) || loading || !status?.configured} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {busy === "connect" ? <LoaderCircle className="animate-spin" size={16} /> : <Link2 size={16} />} Connecter Gmail
          </button>}
        </div>
      </div>

      {!status?.configured && !loading && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">La connexion Google doit d’abord être configurée sur le serveur par l’administrateur technique.</p>}
      {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.kind === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{message.text}</p>}
    </section>
  );
}
