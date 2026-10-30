"use client";

import { useState } from "react";
import { Files, Trash2, UploadCloud } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";

type LocalDocument = {
  id: string;
  name: string;
  client: string;
  size: number;
};

export default function DocumentsPage() {
  const { clients } = useWorkspaceStore();
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const client = clients.find((candidate) => candidate.id === clientId);

  function addFiles(files: FileList | null) {
    setError("");
    if (!client) {
      setError("Choisissez d’abord le dossier client auquel rattacher ces pièces.");
      return;
    }
    if (!files?.length) return;

    setDocuments((current) => [
      ...Array.from(files).map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        client: client.name,
        size: file.size,
      })),
      ...current,
    ]);
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Gestion des dossiers</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Pièces comptables</h1>
        <p className="mt-2 text-sm text-slate-500">Classez les justificatifs par client avant leur traitement par le cabinet.</p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-[1fr_2fr] md:items-end">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Dossier client
          <select value={clientId} onChange={(event) => setClientId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <option value="">Choisir un dossier...</option>
            {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-blue-300 bg-white px-4 py-5 text-sm font-medium text-blue-800 hover:bg-blue-50">
          <UploadCloud className="h-5 w-5" />
          <span>Choisir des justificatifs à classer</span>
          <input type="file" multiple className="sr-only" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{error}</p>}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h2 className="font-semibold text-slate-900">Pièces ajoutées à cette session</h2>
            <p className="mt-1 text-xs text-slate-500">Aucun fichier n’est envoyé ni conservé sur un serveur.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{documents.length}</span>
        </div>
        {documents.length ? (
          <ul className="divide-y divide-slate-100">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Files className="h-5 w-5 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{document.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{document.client} · {(document.size / 1024).toFixed(0)} Ko · À classer</p>
                  </div>
                </div>
                <button aria-label={`Retirer ${document.name}`} onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-10 text-center">
            <Files className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">Aucune pièce dans cette session</p>
            <p className="mt-1 text-xs text-slate-500">Sélectionnez un dossier puis ajoutez des pièces justificatives.</p>
          </div>
        )}
      </div>
    </div>
  );
}
