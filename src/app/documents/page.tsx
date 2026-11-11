"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  Archive,
  Download,
  Eye,
  FileText,
  FolderClosed,
  FolderPlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useWorkspaceStore } from "@/components/workspace-store";
import { apiRequest, apiRequestBlob } from "@/lib/api";
import { useKinshasaDate } from "@/lib/use-kinshasa-date";

const categories = [
  { value: "CLIENT", label: "Dossiers clients" },
  { value: "FISCAL", label: "Fiscalité" },
  { value: "ACCOUNTING", label: "Comptabilité" },
  { value: "LEGAL", label: "Juridique" },
  { value: "HR", label: "Ressources humaines" },
  { value: "HR_CV", label: "CV et autres" },
  { value: "INTERNAL", label: "Documents internes" },
] as const;

const acceptedFiles = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

type ArchiveDocument = {
  id: string;
  customerId: string | null;
  binderId: string | null;
  category: string;
  binder: string | null;
  personName: string | null;
  isPinned: boolean;
  fiscalYear: number;
  period: string | null;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  documentDate: string | null;
  description: string | null;
  deletedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string } | null;
  archiveBinder: {
    id: string;
    name: string;
    category: string;
    fiscalYear: number;
    period: string;
    personName: string | null;
  } | null;
};

type ArchiveBinder = {
  id: string;
  name: string;
  category: string;
  fiscalYear: number;
  period: string;
  createdAt: string;
  documentCount: number;
  personName: string | null;
};

type Preview = { url: string; name: string; mimeType: string };

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} Ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire ce fichier."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Le contenu du fichier est invalide."));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPage() {
  const { clients } = useWorkspaceStore();
  const currentYear = useKinshasaDate()?.slice(0, 4) ?? "";
  const latestDocumentRequest = useRef(0);
  const [documents, setDocuments] = useState<ArchiveDocument[]>([]);
  const [binders, setBinders] = useState<ArchiveBinder[]>([]);
  const [category, setCategory] = useState("CLIENT");
  const [binder, setBinder] = useState("");
  const [uploadBinderId, setUploadBinderId] = useState("");
  const [filterBinderId, setFilterBinderId] = useState("");
  const [binderName, setBinderName] = useState("");
  const [binderPersonName, setBinderPersonName] = useState("");
  const [binderPeriod, setBinderPeriod] = useState("");
  const [binderCategory, setBinderCategory] = useState("CLIENT");
  const [chosenBinderYear, setBinderFiscalYear] = useState<string | null>(null);
  const [chosenFiscalYear, setFiscalYear] = useState<string | null>(null);
  const binderFiscalYear = chosenBinderYear ?? currentYear;
  const fiscalYear = chosenFiscalYear ?? currentYear;
  const [period, setPeriod] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [documentPersonName, setDocumentPersonName] = useState("");
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterPinned, setFilterPinned] = useState(false);
  const [documentPage, setDocumentPage] = useState(1);
  const documentsPerPage = 10;
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showBinderForm, setShowBinderForm] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBinder, setSavingBinder] = useState(false);
  const [savingPins, setSavingPins] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDocuments = useCallback(async () => {
    const requestId = ++latestDocumentRequest.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterYear) params.set("fiscalYear", filterYear);
      if (filterCategory) params.set("category", filterCategory);
      if (filterBinderId) params.set("binderId", filterBinderId);
      if (filterPinned) params.set("pinnedOnly", "true");
      if (search.trim()) params.set("q", search.trim());
      const query = params.size ? `?${params.toString()}` : "";
      const result = await apiRequest<ArchiveDocument[]>(
        `/archives${showTrash ? "/trash" : ""}${query}`,
      );
      if (requestId === latestDocumentRequest.current) {
        setDocuments(result);
        setSelectedDocumentIds((current) =>
          current.filter((id) => result.some((document) => document.id === id)),
        );
      }
    } catch (requestError) {
      if (requestId !== latestDocumentRequest.current) return;
      setDocuments([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger les archives du cabinet.",
      );
    } finally {
      if (requestId === latestDocumentRequest.current) setLoading(false);
    }
  }, [
    filterBinderId,
    filterCategory,
    filterPinned,
    filterYear,
    search,
    showTrash,
  ]);

  const loadBinders = useCallback(async () => {
    try {
      const result = await apiRequest<ArchiveBinder[]>("/archives/binders");
      setBinders(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de charger les classeurs du cabinet.",
      );
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadDocuments);
  }, [loadDocuments]);

  useEffect(() => {
    void Promise.resolve().then(loadBinders);
  }, [loadBinders]);

  useEffect(() => {
    void apiRequest<{ role: string }>("/auth/me")
      .then((user) => setUserRole(user.role))
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Impossible de vérifier les accès du compte.",
        );
      });
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const visibleDocuments = useMemo(
    () =>
      filterCategory
        ? documents.filter((document) => document.category === filterCategory)
        : documents,
    [documents, filterCategory],
  );
  const pageCount = Math.max(1, Math.ceil(visibleDocuments.length / documentsPerPage));
  const pageDocuments = useMemo(
    () =>
      visibleDocuments.slice(
        (documentPage - 1) * documentsPerPage,
        documentPage * documentsPerPage,
      ),
    [documentPage, visibleDocuments],
  );
  const visibleBinders = useMemo(
    () =>
      binders.filter(
        (item) =>
          (!filterCategory || item.category === filterCategory) &&
          (!filterYear || item.fiscalYear === Number(filterYear)),
      ),
    [binders, filterCategory, filterYear],
  );
  const filterYears = [
    ...new Set([
      ...binders.map((item) => item.fiscalYear),
      ...documents.map((item) => item.fiscalYear),
      ...(currentYear
        ? Array.from({ length: 10 }, (_, index) => Number(currentYear) - index)
        : []),
      ...(filterYear ? [Number(filterYear)] : []),
    ]),
  ].sort((left, right) => right - left);
  const uploadBinders = useMemo(
    () =>
      binders.filter(
        (item) =>
          item.category === category && item.fiscalYear === Number(fiscalYear),
      ),
    [binders, category, fiscalYear],
  );
  const selectedUploadBinder = uploadBinders.find(
    (item) => item.id === uploadBinderId,
  );
  const canManageArchive = [
    "COMPANY_ADMIN",
    "ACCOUNTANT",
    "FINANCE_MANAGER",
  ].includes(userRole);
  const selectedVisibleDocuments = pageDocuments.filter((document) =>
    selectedDocumentIds.includes(document.id),
  );

  useEffect(() => {
    setDocumentPage(1);
  }, [filterCategory, filterYear, filterBinderId, filterPinned, search, showTrash]);

  useEffect(() => {
    if (documentPage > pageCount) setDocumentPage(pageCount);
  }, [documentPage, pageCount]);

  async function saveBinder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBinder(true);
    setError("");
    setMessage("");
    try {
      const created = await apiRequest<ArchiveBinder>("/archives/binders", {
        method: "POST",
        body: JSON.stringify({
          name: binderName.trim(),
          category: binderCategory,
          fiscalYear: Number(binderFiscalYear),
          ...(binderCategory === "HR_CV"
            ? { personName: binderPersonName.trim() }
            : {}),
          ...(binderPeriod.trim() ? { period: binderPeriod.trim() } : {}),
        }),
      });
      setBinderName("");
      setBinderPersonName("");
      setBinderPeriod("");
      setShowBinderForm(false);
      setCategory(created.category);
      setFiscalYear(String(created.fiscalYear));
      setFilterCategory(created.category);
      setFilterYear(String(created.fiscalYear));
      setFilterBinderId(created.id);
      setUploadBinderId(created.id);
      setDocumentPersonName(created.personName ?? "");
      setMessage(`Le classeur « ${created.name} » a été créé.`);
      await loadBinders();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de créer ce classeur.",
      );
    } finally {
      setSavingBinder(false);
    }
  }

  async function deleteBinder(item: ArchiveBinder) {
    if (item.documentCount > 0) return;
    if (
      !window.confirm(
        `Supprimer le classeur vide « ${item.name} » ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await apiRequest(`/archives/binders/${item.id}`, { method: "DELETE" });
      if (filterBinderId === item.id) setFilterBinderId("");
      if (uploadBinderId === item.id) setUploadBinderId("");
      setMessage(`Le classeur « ${item.name} » a été supprimé.`);
      await loadBinders();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de supprimer ce classeur.",
      );
    }
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choisissez le document à classer.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Chaque document ne peut pas dépasser 10 Mo.");
      return;
    }
    if (!file.type || !acceptedFiles.split(",").includes(file.type)) {
      setError(
        "Format non pris en charge. Utilisez PDF, JPG, PNG, DOCX ou XLSX.",
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await fileToBase64(file);
      await apiRequest("/archives", {
        method: "POST",
        body: JSON.stringify({
          category,
          fiscalYear: Number(fiscalYear),
          ...(uploadBinderId ? { binderId: uploadBinderId } : {}),
          ...(category === "HR_CV"
            ? {
                personName:
                  selectedUploadBinder?.personName ?? documentPersonName.trim(),
              }
            : {}),
          title: title.trim(),
          originalName: file.name,
          mimeType: file.type,
          data,
          ...(binder.trim() ? { binder: binder.trim() } : {}),
          ...(period.trim() ? { period: period.trim() } : {}),
          ...(customerId ? { customerId } : {}),
          ...(documentDate ? { documentDate } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      setFile(null);
      setFileInputKey((key) => key + 1);
      setTitle("");
      setBinder("");
      setDocumentPersonName("");
      setUploadBinderId("");
      setDescription("");
      setShowUploadForm(false);
      setMessage("Le document a été classé dans l’archive du cabinet.");
      await loadDocuments();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’enregistrer ce document.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setPinned(documentIds: string[], isPinned: boolean) {
    if (!documentIds.length || !canManageArchive) return;
    setSavingPins(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/archives/pins", {
        method: "PATCH",
        body: JSON.stringify({ documentIds, isPinned }),
      });
      setSelectedDocumentIds([]);
      setMessage(
        documentIds.length === 1
          ? isPinned
            ? "Le fichier a été épinglé."
            : "Le fichier a été désépinglé."
          : `${documentIds.length} fichiers ${isPinned ? "épinglés" : "désépinglés"}.`,
      );
      await loadDocuments();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de modifier l’épinglage.",
      );
    } finally {
      setSavingPins(false);
    }
  }

  function toggleDocumentSelection(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  function toggleVisibleSelection() {
    const allSelected = pageDocuments.every((document) =>
      selectedDocumentIds.includes(document.id),
    );
    setSelectedDocumentIds((current) => {
      const visibleIds = new Set(
        pageDocuments.map((document) => document.id),
      );
      const remaining = current.filter((id) => !visibleIds.has(id));
      return allSelected
        ? remaining
        : [...remaining, ...pageDocuments.map((document) => document.id)];
    });
  }

  async function viewDocument(document: ArchiveDocument) {
    setError("");
    try {
      const blob = await apiRequestBlob(`/archives/${document.id}/content`);
      setPreview({
        url: URL.createObjectURL(blob),
        name: document.originalName,
        mimeType: document.mimeType,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’ouvrir ce document.",
      );
    }
  }

  async function updateDocument(
    document: ArchiveDocument,
    action: "delete" | "restore" | "purge",
  ) {
    if (
      action !== "restore" &&
      !window.confirm(
        action === "purge"
          ? `Supprimer définitivement « ${document.title} » ? Cette action est irréversible.`
          : `Placer « ${document.title} » dans la corbeille ?`,
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await apiRequest(
        `/archives/${document.id}${action === "purge" ? "/permanent" : action === "restore" ? "/restore" : ""}`,
        {
          method:
            action === "delete"
              ? "DELETE"
              : action === "purge"
                ? "DELETE"
                : "POST",
        },
      );
      setMessage(
        action === "restore"
          ? "Document restauré."
          : action === "purge"
            ? "Document supprimé définitivement."
            : "Document déplacé dans la corbeille.",
      );
      await Promise.all([loadDocuments(), loadBinders()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de modifier ce document.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <header className="archive-page-header">
        <div>
          <p className="archive-page-eyebrow">
            Gestion des dossiers · classeurs numériques
          </p>
          <h1>Archives du cabinet</h1>
          <p>
            Retrouvez et classez les pièces par famille, exercice, période et
            client.
          </p>
        </div>
        <div className="archive-page-actions">
          <button
            type="button"
            onClick={() => void Promise.all([loadDocuments(), loadBinders()])}
            disabled={loading}
            aria-label="Actualiser les archives"
            className="archive-refresh-button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
            userRole,
          ) && (
            <>
              <button
                type="button"
                onClick={() => setShowBinderForm((open) => !open)}
                className="archive-add-button"
              >
                <FolderPlus className="h-4 w-4" />{" "}
                {showBinderForm ? "Fermer" : "Nouveau classeur"}
              </button>
              <button
                type="button"
                onClick={() => setShowUploadForm((open) => !open)}
                className="archive-add-button"
              >
                <Plus className="h-4 w-4" />{" "}
                {showUploadForm ? "Fermer" : "Nouveau document"}
              </button>
            </>
          )}
        </div>
      </header>

      {message && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Mes classeurs</h2>
            <p className="mt-1 text-xs text-slate-500">
              {filterCategory || filterYear
                ? "Classeurs filtrés par famille et exercice."
                : "Seuls les classeurs que vous créez apparaissent ici."}
            </p>
          </div>
          {filterBinderId && (
            <button
              type="button"
              onClick={() => setFilterBinderId("")}
              className="text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              Retirer le filtre du classeur
            </button>
          )}
        </div>
        {visibleBinders.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleBinders.map((item) => (
              <div key={item.id} className="flex min-w-0 items-stretch gap-2">
                <button
                  type="button"
                  aria-pressed={filterBinderId === item.id}
                  onClick={() => {
                    setFilterBinderId(item.id);
                    setFilterCategory(item.category);
                    setFilterYear(String(item.fiscalYear));
                  }}
                  className={`archive-binder-card min-w-0 flex-1 ${filterBinderId === item.id ? "is-selected" : ""}`}
                >
                  <span className="archive-binder-icon">
                    <FolderClosed className="h-5 w-5" />
                  </span>
                  <span className="archive-binder-copy">
                    <span className="archive-binder-title">{item.name}</span>
                    <span className="archive-binder-detail">
                      {categories.find(
                        (candidate) => candidate.value === item.category,
                      )?.label ?? item.category}{" "}
                      · {item.fiscalYear}
                      {item.period ? ` · ${item.period}` : ""}
                      {item.personName ? ` · ${item.personName}` : ""}
                    </span>
                  </span>
                  <span className="archive-binder-count">
                    {item.documentCount}
                  </span>
                </button>
                {["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
                  userRole,
                ) && (
                  <button
                    type="button"
                    disabled={item.documentCount > 0}
                    onClick={() => void deleteBinder(item)}
                    aria-label={`Supprimer le classeur ${item.name}`}
                    title={
                      item.documentCount > 0
                        ? "Impossible : le classeur contient des documents, y compris dans la corbeille"
                        : "Supprimer le classeur vide"
                    }
                    className="self-center rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
            <FolderClosed className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Aucun classeur dans cette sélection
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Créez un classeur pour commencer à classer vos pièces.
            </p>
          </div>
        )}
      </section>

      {["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(userRole) &&
        showBinderForm && (
          <form
            onSubmit={saveBinder}
            className="grid gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <h2 className="font-semibold text-slate-900 sm:col-span-2 xl:col-span-4">
              Créer un classeur d’archives
            </h2>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Nom du classeur *
              <input
                required
                minLength={2}
                maxLength={120}
                value={binderName}
                onChange={(event) => setBinderName(event.target.value)}
                placeholder="Ex. Déclarations fiscales"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Famille *
              <select
                required
                value={binderCategory}
                onChange={(event) => {
                  setBinderCategory(event.target.value);
                  if (event.target.value !== "HR_CV") {
                    setBinderPersonName("");
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {binderCategory === "HR_CV" && (
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Nom de l’agent ou du stagiaire *
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={binderPersonName}
                  onChange={(event) => setBinderPersonName(event.target.value)}
                  placeholder="Ex. Jean Mukendi"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                />
              </label>
            )}
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Exercice *
              <input
                required
                type="number"
                min="1900"
                max="2200"
                value={binderFiscalYear}
                onChange={(event) => setBinderFiscalYear(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Période
              <input
                maxLength={40}
                value={binderPeriod}
                onChange={(event) => setBinderPeriod(event.target.value)}
                placeholder="Ex. T1, janvier, annuel"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <div className="flex items-end sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={savingBinder}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <FolderPlus className="h-4 w-4" />{" "}
                {savingBinder ? "Création…" : "Créer le classeur"}
              </button>
            </div>
          </form>
        )}

      {["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(userRole) &&
        showUploadForm && (
          <form
            onSubmit={saveDocument}
            className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <h2 className="font-semibold text-slate-900 sm:col-span-2 xl:col-span-4">
              Classer un nouveau document
            </h2>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Famille *
              <select
                required
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setUploadBinderId("");
                  setDocumentPersonName("");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {category === "HR_CV" && (
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Nom de l’agent ou du stagiaire *
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={selectedUploadBinder?.personName ?? documentPersonName}
                  readOnly={Boolean(selectedUploadBinder?.personName)}
                  onChange={(event) =>
                    setDocumentPersonName(event.target.value)
                  }
                  placeholder="Ex. Jean Mukendi"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 read-only:bg-slate-100"
                />
              </label>
            )}
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Exercice *
              <input
                required
                type="number"
                min="1900"
                max="2200"
                value={fiscalYear}
                onChange={(event) => {
                  setFiscalYear(event.target.value);
                  setUploadBinderId("");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Titre *
              <input
                required
                maxLength={180}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Déclaration de TVA — T1"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Classeur
              <select
                value={uploadBinderId}
                onChange={(event) => {
                  setUploadBinderId(event.target.value);
                  setDocumentPersonName(
                    uploadBinders.find((item) => item.id === event.target.value)
                      ?.personName ?? "",
                  );
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <option value="">Aucun classeur lié</option>
                {uploadBinders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.period ? ` · ${item.period}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Sous-classeur / précision
              <input
                maxLength={120}
                value={binder}
                onChange={(event) => setBinder(event.target.value)}
                placeholder="Ex. Déclarations périodiques"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Période
              <input
                maxLength={40}
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder="Ex. T1, janvier, 2026-03"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Dossier client
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <option value="">Aucun client lié</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Date du document
              <input
                type="date"
                value={documentDate}
                onChange={(event) => setDocumentDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
              Fichier *{" "}
              <span className="font-normal text-slate-500">
                (PDF, JPG, PNG, DOCX, XLSX — 10 Mo max.)
              </span>
              <input
                key={fileInputKey}
                required
                type="file"
                accept={acceptedFiles}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700"
              />
              {file && (
                <span className="block text-xs text-slate-500">
                  {file.name} · {formatBytes(file.size)}
                </span>
              )}
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
              Description
              <input
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Informations complémentaires"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>
            <div className="flex items-end sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <UploadCloud className="h-4 w-4" />{" "}
                {saving ? "Enregistrement…" : "Classer le document"}
              </button>
            </div>
          </form>
        )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">
              {showTrash ? "Corbeille des archives" : "Documents classés"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {visibleDocuments.length ? (documentPage - 1) * documentsPerPage + 1 : 0}–
              {Math.min(documentPage * documentsPerPage, visibleDocuments.length)} sur {visibleDocuments.length} document(s) · conservés sur le serveur du cabinet
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                aria-label="Rechercher dans les archives"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Titre, agent, stagiaire…"
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
              />
            </label>
            <select
              aria-label="Filtrer par famille"
              value={filterCategory}
              onChange={(event) => {
                setFilterCategory(event.target.value);
                setFilterBinderId("");
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Toutes les familles</option>
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrer par exercice"
              value={filterYear}
              onChange={(event) => {
                setFilterYear(event.target.value);
                setFilterBinderId("");
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Tous les exercices</option>
              {filterYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {!showTrash && (
              <button
                type="button"
                aria-pressed={filterPinned}
                onClick={() => setFilterPinned((current) => !current)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${filterPinned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}
              >
                <Star className="h-4 w-4" />
                {filterPinned ? "Tous les fichiers" : "Épinglés"}
              </button>
            )}
            {["COMPANY_ADMIN", "ACCOUNTANT", "FINANCE_MANAGER"].includes(
              userRole,
            ) && (
              <button
                type="button"
                onClick={() => {
                  setShowTrash((value) => !value);
                  setSelectedDocumentIds([]);
                  setFilterPinned(false);
                }}
                className={`rounded-xl border px-3 py-2 text-sm ${showTrash ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}
              >
                {showTrash ? "Voir les classeurs" : "Corbeille"}
              </button>
            )}
          </div>
        </div>
        {!showTrash && canManageArchive && visibleDocuments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <button
              type="button"
              onClick={toggleVisibleSelection}
              disabled={savingPins}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              {pageDocuments.every((document) =>
                selectedDocumentIds.includes(document.id),
              )
                ? "Désélectionner cette page"
                : "Sélectionner cette page"}
            </button>
            <span className="mr-auto text-xs text-slate-500">
              {selectedVisibleDocuments.length} sélectionné(s)
            </span>
            {selectedVisibleDocuments.some(
              (document) => !document.isPinned,
            ) && (
              <button
                type="button"
                disabled={savingPins || selectedVisibleDocuments.length === 0}
                onClick={() =>
                  void setPinned(
                    selectedVisibleDocuments
                      .filter((document) => !document.isPinned)
                      .map((document) => document.id),
                    true,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Star className="h-3.5 w-3.5" /> Épingler la sélection
              </button>
            )}
            {selectedVisibleDocuments.some((document) => document.isPinned) && (
              <button
                type="button"
                disabled={savingPins || selectedVisibleDocuments.length === 0}
                onClick={() =>
                  void setPinned(
                    selectedVisibleDocuments
                      .filter((document) => document.isPinned)
                      .map((document) => document.id),
                    false,
                  )
                }
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
              >
                Désépingler la sélection
              </button>
            )}
          </div>
        )}
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chargement des archives…
          </p>
        ) : visibleDocuments.length ? (
          <ul className="divide-y divide-slate-100">
            {pageDocuments.map((document) => (
              <li
                key={document.id}
                className="grid min-h-[92px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 transition-colors hover:bg-slate-50 sm:gap-6 sm:px-7"
              >
                {canManageArchive && !showTrash && (
                  <input
                    type="checkbox"
                    checked={selectedDocumentIds.includes(document.id)}
                    onChange={() => toggleDocumentSelection(document.id)}
                    aria-label={`Sélectionner ${document.title}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-blue-700"
                  />
                )}
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {document.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {document.originalName} · {formatBytes(document.size)} ·{" "}
                      {categories.find(
                        (item) => item.value === document.category,
                      )?.label ?? document.category}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {document.fiscalYear}
                      {document.period ? ` · ${document.period}` : ""}
                      {document.archiveBinder
                        ? ` · ${document.archiveBinder.name}`
                        : ""}
                      {document.personName
                        ? ` · Agent / stagiaire : ${document.personName}`
                        : ""}
                      {document.binder ? ` · ${document.binder}` : ""}
                      {document.customer ? ` · ${document.customer.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!showTrash && (
                    <>
                      {canManageArchive && (
                        <button
                          type="button"
                          onClick={() =>
                            void setPinned([document.id], !document.isPinned)
                          }
                          disabled={savingPins}
                          aria-pressed={document.isPinned}
                          aria-label={`${document.isPinned ? "Désépingler" : "Épingler"} ${document.title}`}
                          title={document.isPinned ? "Désépingler" : "Épingler"}
                          className={`rounded-lg p-2 ${document.isPinned ? "text-amber-600 hover:bg-amber-50" : "text-slate-400 hover:bg-amber-50 hover:text-amber-600"}`}
                        >
                          <Star
                            className="h-4 w-4"
                            fill={document.isPinned ? "currentColor" : "none"}
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void viewDocument(document)}
                        aria-label={`Aperçu de ${document.title}`}
                        title="Aperçu / ouvrir"
                        className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {showTrash ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void updateDocument(document, "restore")}
                        aria-label={`Restaurer ${document.title}`}
                        title="Restaurer"
                        className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      {userRole === "COMPANY_ADMIN" && (
                        <button
                          type="button"
                          onClick={() => void updateDocument(document, "purge")}
                          aria-label={`Supprimer définitivement ${document.title}`}
                          title="Supprimer définitivement"
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void updateDocument(document, "delete")}
                      aria-label={`Mettre ${document.title} à la corbeille`}
                      title="Mettre à la corbeille"
                      className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-10 text-center">
            <Archive className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {showTrash ? "La corbeille est vide" : "Aucun document classé"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Utilisez le formulaire pour déposer et organiser les pièces du
              cabinet.
            </p>
          </div>
        )}
        {!loading && visibleDocuments.length > 0 && (
          <nav
            aria-label="Pagination des documents archivés"
            className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"
          >
            <p className="text-sm text-slate-500">
              Page <strong className="text-slate-800">{documentPage}</strong> sur {pageCount}
            </p>
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setDocumentPage((page) => Math.max(1, page - 1))}
                disabled={documentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Précédent
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  aria-current={documentPage === page ? "page" : undefined}
                  onClick={() => setDocumentPage(page)}
                  className={`h-9 min-w-9 rounded-lg px-2 text-sm font-semibold ${documentPage === page ? "bg-blue-700 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-800"}`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDocumentPage((page) => Math.min(pageCount, page + 1))}
                disabled={documentPage === pageCount}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </nav>
        )}
      </section>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Aperçu de ${preview.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-8"
        >
          <section className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <h2 className="truncate font-semibold text-slate-900">
                {preview.name}
              </h2>
              <div className="flex items-center gap-2">
                <a
                  href={preview.url}
                  download={preview.name}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <Download className="h-4 w-4" /> Télécharger
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="Fermer l’aperçu"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>
            {preview.mimeType === "application/pdf" ? (
              <iframe
                title={`Aperçu de ${preview.name}`}
                src={preview.url}
                className="min-h-[65vh] w-full flex-1"
              />
            ) : preview.mimeType.startsWith("image/") ? (
              <div className="relative flex min-h-[65vh] flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
                <Image
                  src={preview.url}
                  alt={preview.name}
                  fill
                  unoptimized
                  className="object-contain p-4"
                />
              </div>
            ) : (
              <p className="p-10 text-center text-sm text-slate-600">
                Ce format ne peut pas être affiché dans l’aperçu. Téléchargez le
                document pour le consulter.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
