"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Database,
  Download,
  FileArchive,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { apiRequest, apiRequestBlob, apiRequestForm } from "@/lib/api";

type ClearableModule = {
  id: string;
  label: string;
};

type OperationResult = {
  success?: boolean;
  restoredRecords?: number;
  module?: string;
  counts?: Record<string, number>;
};

function humanSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DatabaseBackupPanel() {
  const [role, setRole] = useState<string | null>(null);
  const [modules, setModules] = useState<ClearableModule[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"export" | "restore" | "clear" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void apiRequest<{ role: string }>("/auth/me").then(async (user) => {
      if (!active) return;
      setRole(user.role);
      if (user.role === "COMPANY_ADMIN") {
        const availableModules = await apiRequest<ClearableModule[]>("/backups/modules");
        if (active) setModules(availableModules);
      }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Impossible de charger les outils de sauvegarde.");
    });
    return () => { active = false; };
  }, []);

  async function exportBackup() {
    setBusy("export");
    setError("");
    setMessage("");
    try {
      const backup = await apiRequestBlob("/backups/export");
      const url = URL.createObjectURL(backup);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cabinet-transparency-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("La sauvegarde du cabinet a été téléchargée.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de créer la sauvegarde.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup() {
    if (!file || restoreConfirmation !== "RESTAURER") return;
    setBusy("restore");
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("backup", file, file.name);
      form.set("confirmation", restoreConfirmation);
      const result = await apiRequestForm<OperationResult>("/backups/restore", form);
      setMessage(`Restauration terminée · ${result.restoredRecords ?? 0} enregistrement(s) restauré(s). Actualisation du logiciel…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La restauration a échoué.");
    } finally {
      setBusy(null);
    }
  }

  async function clearModule() {
    if (!moduleId || clearConfirmation !== "VIDER") return;
    setBusy("clear");
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<OperationResult>("/backups/clear-module", {
        method: "POST",
        body: JSON.stringify({ module: moduleId, confirmation: clearConfirmation }),
      });
      const removed = Object.values(result.counts ?? {}).reduce((sum, count) => sum + count, 0);
      setMessage(`${removed} enregistrement(s) supprimé(s) du module. Actualisation du logiciel…`);
      setClearConfirmation("");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de vider ce module.");
    } finally {
      setBusy(null);
    }
  }

  if (role && role !== "COMPANY_ADMIN") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p className="font-semibold">Accès réservé à l’administrateur</p>
        <p className="mt-1">Les opérations d’export, de restauration et de vidage ne sont disponibles que pour le compte administrateur du cabinet.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 p-5 text-white sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Database className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Sécurité des données</p>
              <h2 className="mt-1 text-xl font-semibold">Sauvegarde du cabinet</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">Exportez ou restaurez les données professionnelles et les pièces jointes du cabinet connecté. Les comptes utilisateurs, mots de passe, identifiants fiscaux secrets, notifications personnelles et journaux d’audit sont conservés séparément.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Download className="h-5 w-5" /></span>
              <div><h3 className="font-semibold text-slate-900">Exporter une sauvegarde</h3><p className="text-sm text-slate-500">Télécharger les données du cabinet en JSON</p></div>
            </div>
            <p className="text-sm leading-6 text-slate-600">La sauvegarde inclut les clients, factures, règlements, OP, caisse, archives, patrimoine, paramètres et pièces jointes. Elle est liée à ce cabinet et ne peut pas être restaurée dans un autre espace.</p>
            <button type="button" onClick={() => void exportBackup()} disabled={busy !== null || role === null} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "export" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} {busy === "export" ? "Préparation…" : "Télécharger la sauvegarde"}
            </button>
            <p className="text-xs text-slate-500">Taille maximale : 30 Mo. Conservez le fichier dans un emplacement sécurisé.</p>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ArchiveRestore className="h-5 w-5" /></span>
              <div><h3 className="font-semibold text-slate-900">Importer et restaurer</h3><p className="text-sm text-slate-500">Remplacer les données métier par une sauvegarde</p></div>
            </div>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              Fichier de sauvegarde Cabinet Transparency (.json)
              <input type="file" accept=".json,application/json" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRestoreConfirmation(""); setError(""); }} className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-800" />
            </label>
            {file && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{file.name} · {humanSize(file.size)}</p>}
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" />La restauration remplace les données métier actuelles.</p>
              <p className="mt-1">Téléchargez une sauvegarde récente avant de poursuivre. Les utilisateurs et les journaux d’audit restent en place.</p>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
              Pour confirmer, saisissez RESTAURER
              <input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value.toLocaleUpperCase("fr"))} autoComplete="off" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" placeholder="RESTAURER" />
            </label>
            <button type="button" onClick={() => void restoreBackup()} disabled={busy !== null || !file || restoreConfirmation !== "RESTAURER" || role === null} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "restore" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy === "restore" ? "Restauration…" : "Restaurer cette sauvegarde"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><Trash2 className="h-5 w-5" /></span>
          <div><h2 className="font-semibold text-slate-900">Vider un module</h2><p className="mt-1 text-sm leading-6 text-slate-600">Supprimez uniquement les données métier du module choisi. Les utilisateurs, les autres modules et les journaux d’audit sont préservés.</p></div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(220px,0.8fr)_auto] lg:items-end">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Module à vider
            <select value={moduleId} onChange={(event) => { setModuleId(event.target.value); setClearConfirmation(""); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              <option value="">Sélectionner un module</option>
              {modules.map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Saisissez VIDER pour confirmer
            <input value={clearConfirmation} onChange={(event) => setClearConfirmation(event.target.value.toLocaleUpperCase("fr"))} autoComplete="off" className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="VIDER" />
          </label>
          <button type="button" onClick={() => void clearModule()} disabled={busy !== null || !moduleId || clearConfirmation !== "VIDER" || role === null} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "clear" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {busy === "clear" ? "Suppression…" : "Vider le module"}
          </button>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />L’effacement est enregistré dans le journal d’audit. Les clients ne peuvent être supprimés que si aucun devis, facture ou règlement ne leur est encore lié.</p>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    </div>
  );
}
