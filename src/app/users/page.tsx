"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Search, ShieldCheck, UserRound, UserRoundX } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useNotifications } from "@/components/notification-provider";

type Role =
  | "COMPANY_ADMIN"
  | "FINANCE_MANAGER"
  | "ACCOUNTANT"
  | "CASHIER"
  | "SALES_MANAGER"
  | "STOCK_MANAGER"
  | "AUDITOR"
  | "VIEWER";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  joinedAt: string;
};

const roles: { value: Role; label: string }[] = [
  { value: "COMPANY_ADMIN", label: "Administrateur du cabinet" },
  { value: "FINANCE_MANAGER", label: "Responsable financier" },
  { value: "ACCOUNTANT", label: "Comptable" },
  { value: "CASHIER", label: "Caissier" },
  { value: "SALES_MANAGER", label: "Responsable commercial" },
  { value: "STOCK_MANAGER", label: "Gestionnaire de stock" },
  { value: "AUDITOR", label: "Auditeur" },
  { value: "VIEWER", label: "Lecture seule" },
];

export default function UsersPage() {
  const { notify } = useNotifications();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("ACCOUNTANT");
  const [query, setQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  const visibleMembers = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("fr");
    if (!search) return members;
    return members.filter((member) =>
      `${member.name} ${member.email} ${member.role}`
        .toLocaleLowerCase("fr")
        .includes(search),
    );
  }, [members, query]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    setAccessDenied(false);
    try {
      const [currentUser, team] = await Promise.all([
        apiRequest<{ id: string; role: Role }>("/auth/me"),
        apiRequest<TeamMember[]>("/users"),
      ]);
      setCurrentUserId(currentUser.id);
      setMembers(team);
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.message.includes("API 403")
      ) {
        setAccessDenied(true);
        setError("La gestion des utilisateurs est réservée à l’administrateur du cabinet.");
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Impossible de charger l’équipe.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadMembers);
  }, [loadMembers]);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<TeamMember>("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      setMessage("Le membre a été ajouté à l’équipe.");
      notify({
        type: "success",
        title: "Utilisateur créé",
        message: `${name.trim()} peut maintenant accéder à l’espace selon le rôle attribué.`,
      });
      await loadMembers();
    } catch (requestError) {
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’ajouter ce membre.";
      setError(reason);
      notify({ type: "error", title: "Utilisateur non créé", message: reason });
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(
    member: TeamMember,
    changes: Partial<Pick<TeamMember, "role" | "isActive">>,
  ) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<TeamMember>(`/users/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setMessage(`Les accès de ${member.name} ont été mis à jour.`);
      notify({
        type: "success",
        title: "Accès mis à jour",
        message: `Le rôle ou le statut de ${member.name} a bien été enregistré.`,
      });
      await loadMembers();
    } catch (requestError) {
      const reason =
        requestError instanceof Error
          ? requestError.message
          : "Impossible de modifier les accès.";
      setError(reason);
      notify({ type: "error", title: "Modification non enregistrée", message: reason });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Administration du cabinet</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Équipe & permissions</h1>
          <p className="mt-2 text-sm text-slate-500">Gérez les comptes, les rôles et les accès de votre équipe.</p>
        </div>
        {!loading && !accessDenied && (
          <button type="button" onClick={() => setShowForm((open) => !open)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Ajouter un membre
          </button>
        )}
      </header>

      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {!loading && !accessDenied && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Membres du cabinet</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{members.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-sm text-emerald-800">Comptes actifs</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-900">
              {members.filter((member) => member.isActive).length}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm text-amber-900">Accès suspendus</p>
            <p className="mt-2 text-2xl font-semibold text-amber-950">
              {members.filter((member) => !member.isActive).length}
            </p>
          </div>
        </section>
      )}

      {!loading && !accessDenied && showForm && (
        <form onSubmit={createMember} className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Nom complet
            <input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Adresse e-mail
            <input required type="email" maxLength={160} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Mot de passe provisoire
            <input required type="password" minLength={14} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
            <span className="block text-xs font-normal text-slate-500">14 caractères minimum. Transmettez-le au membre par un canal sûr.</span>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Rôle
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button disabled={saving} type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Créer le compte"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Annuler</button>
          </div>
        </form>
      )}

      {!loading && !accessDenied && (
      <label className="flex max-w-lg items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400">
        <Search className="h-4 w-4" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher par nom, adresse e-mail ou rôle…"
          className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none"
        />
      </label>
      )}

      {!accessDenied && (
      <section className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Membres du cabinet</h2>
            <p className="mt-1 text-sm text-slate-500">{members.length} compte(s)</p>
          </div>
          <button type="button" onClick={() => void loadMembers()} disabled={loading || saving} aria-label="Actualiser l’équipe" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {loading ? (
          <p role="status" className="p-6 text-sm text-slate-500">Chargement de l’équipe…</p>
        ) : visibleMembers.length ? (
          <div className="divide-y divide-slate-100">
            {visibleMembers.map((member) => (
              <article key={member.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700"><UserRound className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{member.name}</p>
                    <p className="truncate text-sm text-slate-500">{member.email}</p>
                    <p className="mt-1 text-xs text-slate-400">Membre depuis le {new Date(member.joinedAt).toLocaleDateString("fr-CD")}</p>
                  </div>
                </div>
                <label className="space-y-1 text-xs font-medium text-slate-500">
                  Rôle
                  <select value={member.role} disabled={saving} onChange={(event) => void updateMember(member, { role: event.target.value as Role })} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-50">
                    {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <button type="button" disabled={saving || member.id === currentUserId} title={member.id === currentUserId ? "Vous ne pouvez pas suspendre votre propre compte." : undefined} onClick={() => void updateMember(member, { isActive: !member.isActive })} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${member.isActive ? "border border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
                  {member.id === currentUserId
                    ? "Compte actuel"
                    : member.isActive
                      ? <><UserRoundX className="h-4 w-4" /> Désactiver</>
                      : <><ShieldCheck className="h-4 w-4" /> Réactiver</>}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-slate-500">Aucun membre ne correspond à cette recherche.</p>
        )}
      </section>
      )}
      <p className="text-xs text-slate-500">La gestion de l’équipe est réservée à l’administrateur du cabinet.</p>
    </div>
  );
}
