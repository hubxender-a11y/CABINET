"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ReceiptText, Check, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { sessionRole, setSessionToken } from "@/lib/session";

type WorkspaceChoice = {
  id: string;
  name: string;
  role?: string;
  logoUrl?: string | null;
};

type LoginResponse = {
  accessToken?: string;
  requiresCompanySelection?: boolean;
  companies?: WorkspaceChoice[];
  user?: {
    companyName?: string;
    companyLogoUrl?: string | null;
    role?: string;
  };
};

type PendingSession = {
  accessToken: string;
  workspace: WorkspaceChoice;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceChoice[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find(({ id }) => id === selectedWorkspaceId) ?? workspaces[0],
    [selectedWorkspaceId, workspaces],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("reason") !== "session-expired") return;
    url.searchParams.delete("reason");
    window.history.replaceState(window.history.state, "", url);
    const timer = window.setTimeout(() => setSessionExpired(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_API_URL) return;
    const controller = new AbortController();
    void apiRequest("/auth/health", { signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await authenticate();
  }

  async function authenticate(companyId?: string) {
    setError("");
    setSaving(true);
    try {
      const result = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(companyId ? { companyId } : {}) }),
      });
      if (result.requiresCompanySelection) {
        const options = result.companies ?? [];
        if (!options.length) throw new Error("Aucun espace de travail n’est associé à ce compte.");
        setWorkspaces(options);
        setSelectedWorkspaceId(options[0].id);
        setPendingSession(null);
        return;
      }
      if (!result.accessToken) throw new Error("La session de travail n’a pas été créée.");

      if (
        result.user?.role === "PLATFORM_SUPER_ADMIN" ||
        sessionRole(result.accessToken) === "PLATFORM_SUPER_ADMIN"
      ) {
        setPassword("");
        setSessionToken(result.accessToken);
        router.replace("/platform-admin");
        return;
      }
      if (
        result.user?.role === "PLATFORM_MANAGING_PARTNER" ||
        sessionRole(result.accessToken) === "PLATFORM_MANAGING_PARTNER"
      ) {
        setPassword("");
        setSessionToken(result.accessToken);
        router.replace("/managing-partner");
        return;
      }

      const workspace = companyId
        ? selectedWorkspace
        : undefined;
      setPassword("");
      setWorkspaces([]);
      setPendingSession({
        accessToken: result.accessToken,
        workspace: {
          id: companyId ?? "current",
          name: result.user?.companyName || workspace?.name || "Entreprise",
          logoUrl: result.user?.companyLogoUrl || workspace?.logoUrl || null,
          role: result.user?.role || workspace?.role,
        },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connexion impossible. Vérifiez vos identifiants.",
      );
    } finally {
      setSaving(false);
    }
  }

  function enterWorkspace() {
    if (!pendingSession) return;
    setSessionToken(pendingSession.accessToken);
  }

  function changeAccount() {
    setWorkspaces([]);
    setSelectedWorkspaceId("");
    setPendingSession(null);
    setPassword("");
    setError("");
  }

  function companyLogo(logoUrl?: string | null, name = "Entreprise") {
    const source = safeWorkspaceLogo(logoUrl);
    return (
      <span className="login-workspace-logo">
        {source ? (
          <Image
            src={source}
            alt={`Logo ${name}`}
            width={160}
            height={70}
            unoptimized
            className="login-workspace-logo-image"
          />
        ) : (
          <ReceiptText aria-label={`Logo ${name}`} />
        )}
      </span>
    );
  }

  return (
    <main className="login-layout">
      <aside className="login-intro" aria-label="Espace professionnel">
        <div className="login-intro-copy">
          <p>VOTRE ESPACE DE GESTION</p>
          <h2>{workspaces.length ? "Choisissez votre entreprise." : pendingSession ? "Votre espace est prêt." : "La gestion de vos clients, simplement."}</h2>
          <p>Retrouvez vos clients, factures et règlements dans une plateforme sécurisée et facile à utiliser.</p>
        </div>
        <div className="login-intro-footer">
          <span className="login-status-dot" /> Accès sécurisé · République Démocratique du Congo
        </div>
      </aside>
      <section className="login-card" aria-live="polite">
        <div className="login-brand">
          <span className="login-brand-mark"><ReceiptText aria-hidden="true" /></span>
          <div>
            <p className="login-eyebrow">FACTURE CLIENT</p>
            <p className="login-brand-caption">Gestion de facturation</p>
          </div>
        </div>
        {!workspaces.length && !pendingSession ? (
          <form onSubmit={submit} className="login-form">
            <div className="login-heading">
              <p className="login-step-label">ESPACE CLIENT</p>
              <h1>Bienvenue</h1>
              <p>Connectez-vous avec les identifiants fournis par votre administrateur.</p>
            </div>
            {sessionExpired && (
              <p role="alert" className="login-alert login-alert-warning">
                Votre session a expiré. Reconnectez-vous pour reprendre votre travail.
              </p>
            )}
            <label className="login-field">
              <span>Adresse e-mail</span>
              <input required autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@entreprise.cd" />
            </label>
            <label className="login-field">
              <span>Mot de passe</span>
              <input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Votre mot de passe" />
            </label>
            {error && <p role="alert" className="login-alert login-alert-error">{error}</p>}
            <button type="submit" disabled={saving} className="login-submit">
              <span>{saving ? "Vérification…" : "Se connecter"}</span>
              {!saving && <ArrowRight aria-hidden="true" />}
            </button>
            <div className="login-security-note">
              <ShieldCheck aria-hidden="true" />
              <p>Connexion sécurisée · accès réservé aux utilisateurs autorisés.</p>
            </div>
          </form>
        ) : workspaces.length ? (
          <div className="login-form">
            <div className="login-heading">
              <p className="login-step-label">SÉLECTION DE L’ESPACE</p>
              <h1>Où souhaitez-vous travailler&nbsp;?</h1>
              <p>Votre compte peut accéder à plusieurs entreprises. Vérifiez le logo et le nom avant de continuer.</p>
            </div>
            <div className="login-workspace-list" role="radiogroup" aria-label="Choisir une entreprise">
              {workspaces.map((workspace) => {
                const selected = workspace.id === selectedWorkspaceId;
                return (
                  <button
                    type="button"
                    key={workspace.id}
                    role="radio"
                    aria-checked={selected}
                    className={`login-workspace-option${selected ? " is-selected" : ""}`}
                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                  >
                    {companyLogo(workspace.logoUrl, workspace.name)}
                    <span className="login-workspace-copy">
                      <strong>{workspace.name}</strong>
                      <small>{workspace.role ? formatRole(workspace.role) : "Espace autorisé"}</small>
                    </span>
                    <span className="login-workspace-check"><Check aria-hidden="true" /></span>
                  </button>
                );
              })}
            </div>
            {error && <p role="alert" className="login-alert login-alert-error">{error}</p>}
            <button type="button" disabled={saving || !selectedWorkspace} onClick={() => void authenticate(selectedWorkspace?.id)} className="login-submit">
              <span>{saving ? "Connexion…" : `Continuer vers ${selectedWorkspace?.name ?? "l’espace"}`}</span>
              {!saving && <ArrowRight aria-hidden="true" />}
            </button>
            <button type="button" onClick={changeAccount} className="login-back-link"><ArrowLeft aria-hidden="true" /> Changer de compte</button>
          </div>
        ) : pendingSession ? (
          <div className="login-form">
            <div className="login-heading">
              <p className="login-step-label">ESPACE CONFIRMÉ</p>
              <h1>Vous allez rejoindre&nbsp;:</h1>
              <p>Vérifiez l’entreprise avant d’ouvrir votre espace de travail.</p>
            </div>
            <div className="login-workspace-confirmation">
              {companyLogo(pendingSession.workspace.logoUrl, pendingSession.workspace.name)}
              <div>
                <span>ENTREPRISE</span>
                <strong>{pendingSession.workspace.name}</strong>
                {pendingSession.workspace.role && <small>{formatRole(pendingSession.workspace.role)}</small>}
              </div>
              <Check className="login-confirmation-check" aria-label="Entreprise confirmée" />
            </div>
            <button type="button" onClick={enterWorkspace} className="login-submit">
              <span>Accéder à {pendingSession.workspace.name}</span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={changeAccount} className="login-back-link"><ArrowLeft aria-hidden="true" /> Se connecter avec un autre compte</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function safeWorkspaceLogo(value?: string | null) {
  if (value && (/^\/[^/]/.test(value) || /^data:image\/(?:jpeg|png|webp);base64,/i.test(value))) {
    return value;
  }
  return null;
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    PLATFORM_SUPER_ADMIN: "Super-administrateur",
    COMPANY_ADMIN: "Administrateur",
    MANAGING_PARTNER: "Associé-gérant",
    FINANCE_MANAGER: "Responsable des finances",
    ACCOUNTANT: "Comptable",
    SECRETARY: "Secrétaire",
    CASHIER: "Caissier",
    AUDITOR: "Auditeur",
    VIEWER: "Consultation",
  };
  return labels[role] ?? "Espace autorisé";
}
