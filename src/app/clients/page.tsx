"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";

export default function ClientsPage() {
  const { clients, addClient, databaseConnected } = useWorkspaceStore();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    if (!normalizedQuery) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.sector} ${client.contact}`.toLocaleLowerCase("fr").includes(normalizedQuery),
    );
  }, [clients, query]);

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim() || !sector.trim()) {
      setError("Le nom du dossier et son secteur sont obligatoires.");
      return;
    }

    try {
      await addClient({
        name: name.trim(),
        sector: sector.trim(),
        contact: contact.trim() || "Contact à renseigner",
        status: "À jour",
      });
      setMessage(
        databaseConnected
          ? `Le dossier ${name.trim()} a été enregistré dans la base du cabinet.`
          : `Le dossier ${name.trim()} a été ajouté à cette démonstration locale.`,
      );
      setName("");
      setSector("");
      setContact("");
      setShowForm(false);
    } catch (requestError) {
      console.error("Création du dossier client impossible.", requestError);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d'enregistrer ce dossier client.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Portefeuille du cabinet</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Dossiers clients</h1>
          <p className="mt-2 text-sm text-slate-500">{clients.length} dossier(s) suivis par votre équipe.</p>
        </div>
        <button onClick={() => setShowForm((open) => !open)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Nouveau dossier
        </button>
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      {showForm && (
        <form onSubmit={createClient} className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 md:grid-cols-3">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Nom de l’entreprise *
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Société ABC" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Secteur d’activité *
            <input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Ex. Commerce" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Contact principal
            <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Nom ou service" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Créer le dossier</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Annuler</button>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          </div>
        </form>
      )}

      <label className="flex max-w-lg items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400">
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client, secteur, contact..." className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none" />
      </label>

      {filteredClients.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <article key={client.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">{client.name.slice(0, 2).toLocaleUpperCase("fr")}</div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${client.status === "À jour" ? "bg-emerald-100 text-emerald-700" : client.status === "En retard" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{client.status}</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{client.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{client.sector}</p>
              <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                <Users className="h-4 w-4 text-slate-400" /> {client.contact}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <p className="font-medium text-slate-800">Aucun dossier ne correspond à cette recherche.</p>
          <p className="mt-1 text-sm text-slate-500">Essayez un autre terme ou créez un nouveau dossier.</p>
        </div>
      )}
    </div>
  );
}
