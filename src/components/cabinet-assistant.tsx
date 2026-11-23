"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  CircleHelp,
  FileText,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type Guide = {
  title: string;
  summary: string;
  steps: string[];
  keywords: string[];
  href: string;
  action: string;
  note?: string;
};

const guides: Guide[] = [
  {
    title: "Lire le tableau de bord",
    summary: "Le tableau de bord rassemble les indicateurs utiles, les dossiers récents et les actions à traiter.",
    steps: ["Vérifiez les montants par devise : les totaux USD et CDF restent séparés.", "Consultez les alertes d’OP, d’impayés et de caisse dans la zone de suivi.", "Ouvrez un indicateur pour poursuivre le traitement dans le module concerné."],
    keywords: ["tableau de bord", "dashboard", "accueil", "indicateur", "activité cabinet"],
    href: "/",
    action: "Revenir au tableau de bord",
  },
  {
    title: "Créer et envoyer une facture",
    summary: "Préparez une facture client, vérifiez ses lignes puis imprimez ou partagez le document.",
    steps: ["Ouvrez Factures clients et choisissez Nouvelle facture.", "Sélectionnez le client, la période et la devise, puis saisissez les prestations et leurs montants.", "Vérifiez l’aperçu, enregistrez la facture et utilisez les actions d’impression ou de téléchargement."],
    keywords: ["facture", "facturation", "honoraires", "client", "imprimer facture", "numero facture"],
    href: "/invoices",
    action: "Ouvrir les factures",
    note: "Le numéro de facture est attribué par le système. Vérifiez le client et la devise avant validation.",
  },
  {
    title: "Enregistrer un règlement client",
    summary: "Associez chaque encaissement à la facture concernée pour actualiser le solde et conserver une preuve.",
    steps: ["Ouvrez Règlements clients puis Nouveau règlement.", "Choisissez une facture encore due : le système affiche le montant déjà reçu et le solde.", "Saisissez le montant, le mode de paiement et la référence éventuelle, puis enregistrez.", "Imprimez le reçu client et le bon d’entrée du cabinet si nécessaire."],
    keywords: ["reglement", "règlement", "paiement client", "encaissement", "reçu", "caisse", "facture payee"],
    href: "/payments",
    action: "Ouvrir les règlements",
    note: "Un paiement client ne constitue pas l’approvisionnement des OP.",
  },
  {
    title: "Préparer un ordre de paiement",
    summary: "La secrétaire prépare le dossier avec son état de besoin ; l’Associé-Gérant l’examine et le vise.",
    steps: ["Ouvrez Ordres de paiement et sélectionnez le formulaire de nouvelle OP.", "Renseignez la demande et joignez l’état de besoin lisible.", "Enregistrez et transmettez le dossier pour examen.", "Après signature du Gérant, le bon de sortie approuvé apparaît automatiquement dans le registre de caisse. Le Secrétariat peut alors le payer et imprimer le bon."],
    keywords: ["op", "ordre de paiement", "ordre paiement", "etat de besoin", "état de besoin", "approbation", "visa", "associe gerant"],
    href: "/payment-orders",
    action: "Ouvrir les ordres de paiement",
    note: "Le visa du Gérant valide le bon, mais la caisse est débitée uniquement au paiement effectif.",
  },
  {
    title: "Émettre un bon de sortie de caisse",
    summary: "Le bon documente une sortie de fonds autorisée et garde sa trace dans le registre de caisse.",
    steps: ["Ouvrez Bons de sortie caisse puis Émettre un bon.", "Associez le bénéficiaire, le motif, le montant, la devise et l’OP approuvée si applicable.", "Enregistrez le bon en attente d’examen.", "Après approbation du Gérant, procédez au paiement et imprimez le bon."],
    keywords: ["bon de sortie", "sortie caisse", "bon caisse", "payer op", "payer ordre", "décaissement"],
    href: "/cash-vouchers",
    action: "Ouvrir les bons de caisse",
    note: "Un bon non approuvé ne doit pas diminuer les fonds disponibles.",
  },
  {
    title: "Suivre l’approvisionnement",
    summary: "Consignez séparément les fonds remis par l’Associé-Gérant pour financer les OP.",
    steps: ["Ouvrez le menu d’approvisionnement de caisse.", "Enregistrez la date, le montant, la devise et la référence de remise.", "Vérifiez que l’opération apparaît dans le journal des approvisionnements."],
    keywords: ["approvisionnement", "approvisionner", "fonds", "versement associe", "disponible op", "reapprovisionnement"],
    href: "/cash-vouchers",
    action: "Ouvrir la caisse",
    note: "Les factures réglées par les clients restent distinctes de ces fonds.",
  },
  {
    title: "Retrouver un dossier archivé",
    summary: "Recherchez dans les archives par classeur, famille ou nom de personne référencée.",
    steps: ["Ouvrez Archives et choisissez le classeur concerné.", "Utilisez la recherche ou les filtres de famille et de période.", "Ouvrez le document pour le consulter ou téléchargez-le selon les actions proposées."],
    keywords: ["archive", "archivage", "classeur", "document", "stagiaire", "agent", "cv", "fichier", "epingle"],
    href: "/documents",
    action: "Ouvrir les archives",
  },
  {
    title: "Préparer un rapport de période",
    summary: "Consultez les indicateurs puis produisez une vue imprimable pour le suivi du cabinet.",
    steps: ["Ouvrez Rapports et sélectionnez la période.", "Vérifiez les factures, règlements, dépenses et éléments en attente.", "Imprimez ou téléchargez la synthèse disponible et joignez les pièces utiles."],
    keywords: ["rapport", "rapports", "periode", "activité", "cloture", "synthese", "imprimer rapport"],
    href: "/reports",
    action: "Ouvrir les rapports",
    note: "Contrôlez les pièces et les rapprochements avant d’utiliser un rapport pour une clôture.",
  },
  {
    title: "Suivre les échéances fiscales",
    summary: "Consultez les obligations fiscales et repérez les échéances à traiter.",
    steps: ["Ouvrez Suivi fiscal.", "Vérifiez la période, l’échéance et le statut de chaque obligation.", "Mettez à jour le suivi après dépôt et conservez la preuve dans les archives."],
    keywords: ["fiscal", "fiscalite", "impot", "échéance", "obligation", "déclaration", "declaration"],
    href: "/fiscal",
    action: "Ouvrir le suivi fiscal",
  },
  {
    title: "Gérer le patrimoine du cabinet",
    summary: "Tenez l’inventaire des biens durables, leurs affectations, mouvements et états par période.",
    steps: ["Ouvrez Patrimoine et choisissez la période de suivi.", "Actualisez l’état des biens, leur emplacement, leur responsable et les mouvements.", "Ajoutez une note de synthèse puis transmettez le rapport au Gérant si demandé."],
    keywords: ["patrimoine", "immobilisation", "materiel", "matériel", "inventaire", "affectation", "etat des materiels"],
    href: "/patrimoine",
    action: "Ouvrir le patrimoine",
  },
  {
    title: "Gérer les accès des utilisateurs",
    summary: "L’administrateur peut créer les comptes, affecter les rôles et gérer les accès.",
    steps: ["Ouvrez Utilisateurs & accès.", "Vérifiez l’identité, l’adresse e-mail et le rôle attribué.", "Pour les mots de passe et les droits sensibles, confirmez l’utilisateur avant d’enregistrer."],
    keywords: ["utilisateur", "utilisateurs", "role", "rôle", "accès", "mot de passe", "compte", "administrateur"],
    href: "/users",
    action: "Ouvrir les utilisateurs",
    note: "N’envoyez jamais un mot de passe en clair dans une note ou une pièce jointe.",
  },
  {
    title: "Corriger les coordonnées du cabinet",
    summary: "Le profil du cabinet est utilisé dans les documents et les impressions.",
    steps: ["Ouvrez Paramètres du cabinet.", "Mettez à jour le nom légal, l’adresse, les contacts et les informations bancaires.", "Contrôlez ensuite un aperçu de facture ou de reçu."],
    keywords: ["parametre", "paramètres", "coordonnées", "adresse", "cabinet", "profil", "logo"],
    href: "/settings",
    action: "Ouvrir les paramètres",
  },
  {
    title: "Retrouver les notifications",
    summary: "Les validations attendues et les mouvements importants sont regroupés dans la cloche en haut de page.",
    steps: ["Ouvrez la cloche de notifications.", "Sélectionnez une notification pour accéder au dossier concerné.", "Marquez les éléments examinés comme lus afin de garder une liste à jour."],
    keywords: ["notification", "notifications", "alerte", "op en attente", "impayé", "impayee", "rapport transmis"],
    href: "/",
    action: "Voir le tableau de bord",
  },
];

const suggestions = [
  "Comment créer une facture ?",
  "Comment suivre une OP ?",
  "Comment enregistrer un règlement ?",
  "Où retrouver les archives ?",
];

const stopWords = new Set(["dans", "pour", "avec", "comment", "faire", "une", "des", "les", "est", "que", "mon", "ma", "mes", "du", "de", "la", "le", "un", "au", "aux"]);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function findGuides(question: string, pathname: string) {
  const normalized = normalize(question.trim());
  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stopWords.has(token));
  const ranked = guides.map((guide) => {
    const keywords = guide.keywords.map(normalize);
    const searchable = normalize(`${guide.title} ${guide.summary} ${guide.steps.join(" ")} ${guide.keywords.join(" ")}`);
    let score = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) score += keyword.includes(" ") ? 5 : 3;
    }
    for (const token of tokens) {
      if (searchable.includes(token)) score += 1;
    }
    if (pathname.startsWith(guide.href) && score > 0) score += 1;
    return { guide, score };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score);
  return ranked.slice(0, 3).map(({ guide }) => guide);
}

function currentGuide(pathname: string) {
  if (pathname === "/") return guides.find((guide) => guide.title === "Lire le tableau de bord");
  return guides.find((guide) => pathname === guide.href || (guide.href !== "/" && pathname.startsWith(`${guide.href}/`)));
}

export function CabinetAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [searching, setSearching] = useState(false);
  const contextGuide = useMemo(() => currentGuide(pathname), [pathname]);
  const results = useMemo(
    () => submittedQuestion ? findGuides(submittedQuestion, pathname) : [],
    [submittedQuestion, pathname],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function ask(event: FormEvent<HTMLFormElement>, prompt = question) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || searching) return;
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setSearching(true);
    window.setTimeout(() => setSearching(false), 120);
  }

  function askSuggestion(prompt: string) {
    setQuestion(prompt);
    setSubmittedQuestion(prompt);
    setSearching(true);
    window.setTimeout(() => setSearching(false), 120);
  }

  return (
    <div className="fixed bottom-5 right-5 z-[70] print:hidden">
      {open && (
        <section id="cabinet-assistant-panel" className="mb-3 flex h-[min(690px,calc(100dvh-112px))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.24)]" role="dialog" aria-modal="false" aria-labelledby="cabinet-assistant-title">
          <header className="relative overflow-hidden bg-gradient-to-br from-[#052b58] via-[#06447c] to-[#087a91] px-5 pb-5 pt-5 text-white">
            <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-white/10" />
            <div className="absolute -right-1 -top-3 h-24 w-24 rounded-full border border-white/10" />
            <div className="relative flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Sparkles className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-blue-100">CABINET TRANSPARENCY</p>
                    <h2 id="cabinet-assistant-title" className="mt-0.5 text-lg font-semibold">Assistant du cabinet</h2>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Fermer l’assistant" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"><ChevronDown className="h-5 w-5" /></button>
                </div>
                <p className="mt-2 text-xs leading-5 text-blue-50">Guides pratiques pour les factures, la caisse, les OP, les archives et le suivi du cabinet.</p>
              </div>
            </div>
            <div className="relative mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-blue-50 ring-1 ring-white/10">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Aide interne · vos données restent dans le logiciel
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 p-4">
            {!submittedQuestion ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Bot className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Bonjour, comment puis-je vous aider ?</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Posez une question sur une procédure ou choisissez un guide. Je vous indique les étapes et le bon écran.</p>
                    </div>
                  </div>
                </div>
                {contextGuide && (
                  <div>
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Aide pour cet écran</p>
                    <button type="button" onClick={() => askSuggestion(contextGuide.title)} className="group w-full rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50">
                      <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-blue-950">{contextGuide.title}</span><ArrowRight className="h-4 w-4 shrink-0 text-blue-700 transition group-hover:translate-x-0.5" /></span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">{contextGuide.summary}</span>
                    </button>
                  </div>
                )}
                <div>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Questions fréquentes</p>
                  <div className="space-y-2">
                    {suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => askSuggestion(suggestion)} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-800">
                        <MessageCircle className="h-4 w-4 shrink-0 text-slate-400" />{suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="ml-8 rounded-2xl rounded-tr-md bg-blue-700 px-4 py-3 text-sm leading-6 text-white shadow-sm">{submittedQuestion}</div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800"><Bot className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1 space-y-3">
                    {searching ? (
                      <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white p-4 text-sm text-slate-600">Je cherche le guide le plus utile…</div>
                    ) : results.length ? (
                      <>
                        <p className="px-1 text-sm leading-6 text-slate-700">Voici les étapes conseillées dans le logiciel :</p>
                        {results.map((guide) => (
                          <article key={guide.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h3 className="text-sm font-semibold text-slate-900">{guide.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{guide.summary}</p>
                            <ol className="mt-3 space-y-2">
                              {guide.steps.map((step, index) => <li key={step} className="flex gap-2 text-xs leading-5 text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-800">{index + 1}</span><span>{step}</span></li>)}
                            </ol>
                            {guide.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{guide.note}</p>}
                            <Link href={guide.href} onClick={() => setOpen(false)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">{guide.action}<ArrowRight className="h-3.5 w-3.5" /></Link>
                          </article>
                        ))}
                      </>
                    ) : (
                      <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                        <p className="font-semibold text-slate-900">Je n’ai pas trouvé de guide correspondant.</p>
                        <p className="mt-1">Essayez avec un mot comme « facture », « OP », « caisse », « archives », « rapport » ou « utilisateur ». Vous pouvez aussi consulter le guide utilisateur du cabinet.</p>
                        <a href="/guide-utilisation-cabinet-transparency.pdf" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700"><FileText className="h-4 w-4" /> Ouvrir le guide utilisateur</a>
                      </div>
                    )}
                    {!searching && <button type="button" onClick={() => { setQuestion(""); setSubmittedQuestion(""); }} className="inline-flex items-center gap-1 px-1 text-xs font-medium text-slate-500 hover:text-slate-800"><Search className="h-3.5 w-3.5" /> Poser une autre question</button>}
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={ask} className="border-t border-slate-200 bg-white p-3">
            <label htmlFor="cabinet-assistant-question" className="sr-only">Votre question</label>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-slate-50 p-1.5 pl-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
              <textarea id="cabinet-assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={600} rows={1} placeholder="Écrivez votre question…" className="max-h-24 min-h-10 flex-1 resize-y bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              <button type="submit" disabled={!question.trim() || searching} aria-label="Envoyer la question" className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Send className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">Réponses issues des procédures du logiciel · ne remplace pas la validation comptable</p>
          </form>
        </section>
      )}

      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="cabinet-assistant-panel" aria-label={open ? "Fermer l’assistant" : "Ouvrir l’assistant du cabinet"} className={`group flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/25 transition hover:-translate-y-0.5 hover:shadow-xl ${open ? "bg-slate-800 hover:bg-slate-900" : "bg-gradient-to-r from-blue-800 to-cyan-700 hover:from-blue-900 hover:to-cyan-800"}`}>
        {open ? <X className="h-4 w-4" /> : <CircleHelp className="h-5 w-5" />}
        <span>{open ? "Fermer" : "Besoin d’aide ?"}</span>
        {!open && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20"><Sparkles className="h-3 w-3" /></span>}
      </button>
    </div>
  );
}
