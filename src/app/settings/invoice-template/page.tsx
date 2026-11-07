"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Grid3X3,
  ImagePlus,
  Layers,
  Minus,
  MousePointer2,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCompanyProfile } from "@/components/company-profile";
import { DocumentFooterWave, DocumentLetterhead } from "@/components/document-letterhead";
import { useNotifications } from "@/components/notification-provider";
import {
  createInvoiceTemplateElement,
  defaultInvoiceTemplate,
  invoiceTemplateDraftStorageKey,
  normalizeInvoiceTemplate,
  type InvoiceTemplateConfiguration,
  type InvoiceTemplateElement,
  type InvoiceTemplateElementKind,
} from "@/lib/invoice-template";

type SaveState = "saved" | "saving" | "error" | "local-only";
type DragState = {
  id: string;
  mode: "move" | "resize";
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  initialLayout: InvoiceTemplateConfiguration;
};

function editorPreview(element: InvoiceTemplateElement) {
  if (element.content && element.kind !== "image") return element.content;
  switch (element.id) {
    case "logo":
      return "Cabinet Transparency";
    case "qr":
      return "QR";
    case "title":
      return "FACTURE N° 001/2026";
    case "date":
      return "Fait à Kinshasa, le 3 novembre 2026";
    case "client":
      return "CLIENT\nECONOMAT";
    case "period":
      return "PÉRIODE :";
    case "prestation":
      return "Concerne";
    case "items":
      return "Rubriques";
    case "total":
      return "TOTAL GÉNÉRAL";
    case "amount-words":
      return "SEPT MILLE DOLLARS AMÉRICAINS";
    case "payment-terms":
      return "Modalités de Paiement :\nNos factures sont payables dans nos comptes bancaires ouverts.";
    case "signature":
      return "Samy LIGBAKELO\nAssocié Gérant";
    case "footer":
      return "CABINET TRANSPARENCY SARL · RCCM CD/KNG/RCCM/21-B-00920\nAv. Boulevard du 30 juin, Immeuble MAYUMBE · Gombe · Kinshasa\n+243 98 00 69 950 · contact@ctrs.cd · www.ctrs.cd";
    default:
      return element.name;
  }
}

const maxTemplateElements = 40;
const maxTemplateBytes = 1_800_000;
const maxImportedLayerBytes = 65_000;

function optimizeImage(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return Promise.reject(
      new Error("Choisissez un fichier image matriciel (PNG, JPEG ou WebP)."),
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("L’image ne peut pas dépasser 5 Mo."));
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire l’image."));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Le fichier image est invalide."));
      image.onload = () => {
        if (
          !image.width ||
          !image.height ||
          image.width * image.height > 20_000_000
        ) {
          reject(new Error("Les dimensions de l’image sont trop importantes."));
          return;
        }
        try {
          const baseScale = Math.min(1, 1400 / image.width, 1400 / image.height);
          for (const reduction of [1, 0.8, 0.65, 0.5, 0.4]) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(
              1,
              Math.round(image.width * baseScale * reduction),
            );
            canvas.height = Math.max(
              1,
              Math.round(image.height * baseScale * reduction),
            );
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context) {
              reject(new Error("Impossible de préparer l’image."));
              return;
            }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const png = canvas.toDataURL("image/png");
            if (png.length <= maxImportedLayerBytes) {
              resolve(png);
              return;
            }

            const pixels = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            let hasTransparency = false;
            for (let index = 3; index < pixels.length; index += 4) {
              if (pixels[index] < 255) {
                hasTransparency = true;
                break;
              }
            }

            if (hasTransparency) {
              for (const quality of [0.85, 0.7, 0.55, 0.4]) {
                const webp = canvas.toDataURL("image/webp", quality);
                if (
                  webp.startsWith("data:image/webp") &&
                  webp.length <= maxImportedLayerBytes
                ) {
                  resolve(webp);
                  return;
                }
              }
            } else {
              context.fillStyle = "#ffffff";
              context.globalCompositeOperation = "destination-over";
              context.fillRect(0, 0, canvas.width, canvas.height);
              for (const quality of [0.85, 0.7, 0.55, 0.4]) {
                const jpeg = canvas.toDataURL("image/jpeg", quality);
                if (jpeg.length <= maxImportedLayerBytes) {
                  resolve(jpeg);
                  return;
                }
              }
            }
          }
          reject(
            new Error(
              "Cette image reste trop volumineuse après compression. Choisissez une image plus petite.",
            ),
          );
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Impossible de préparer l’image."),
          );
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function encodePsdLayer(
  source: HTMLCanvasElement,
  opacity: number,
): string {
  const baseScale = Math.min(1, 900 / source.width, 900 / source.height);
  for (const reduction of [1, 0.75, 0.55, 0.4]) {
    const width = Math.max(1, Math.round(source.width * baseScale * reduction));
    const height = Math.max(1, Math.round(source.height * baseScale * reduction));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Impossible de préparer un calque Photoshop.");
    context.globalAlpha = Math.max(0, Math.min(1, opacity));
    context.drawImage(source, 0, 0, width, height);

    const png = canvas.toDataURL("image/png");
    if (png.length <= maxImportedLayerBytes) return png;

    const pixels = context.getImageData(0, 0, width, height).data;
    let hasTransparency = false;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 255) {
        hasTransparency = true;
        break;
      }
    }

    if (!hasTransparency) {
      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const jpeg = canvas.toDataURL("image/jpeg", quality);
        if (jpeg.length <= maxImportedLayerBytes) return jpeg;
      }
    }
  }
  throw new Error(
    "Un calque dépasse la taille permise même après compression. Réduisez sa taille ou sa résolution dans Photoshop, puis réessayez.",
  );
}

export default function InvoiceTemplatePage() {
  const {
    profile,
    loading,
    error: profileError,
    saveInvoiceTemplate,
  } = useCompanyProfile();
  const { notify } = useNotifications();
  const [layout, setLayout] = useState<InvoiceTemplateConfiguration>(
    defaultInvoiceTemplate,
  );
  const [selectedId, setSelectedId] = useState<string | null>("title");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [isDirty, setIsDirty] = useState(false);
  const [history, setHistory] = useState<InvoiceTemplateConfiguration[]>([]);
  const [future, setFuture] = useState<InvoiceTemplateConfiguration[]>([]);
  const [tool, setTool] = useState<"select" | "text" | "shape" | "line">("select");
  const [profileReady, setProfileReady] = useState(false);
  const [isImportingPsd, setIsImportingPsd] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(100);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editVersionRef = useRef(0);

  useEffect(() => {
    if (loading || profileReady) return;
    if (profile) {
      const timer = window.setTimeout(() => {
        const draftKey = invoiceTemplateDraftStorageKey(profile.id);
        const savedDraft = window.localStorage.getItem(draftKey);
        if (savedDraft) {
          try {
            setLayout(normalizeInvoiceTemplate(JSON.parse(savedDraft)));
            setIsDirty(true);
            setSaveState("local-only");
          } catch (error) {
            console.error("Lecture de la copie locale du modèle impossible.", error);
            window.localStorage.removeItem(draftKey);
            setLayout(normalizeInvoiceTemplate(profile.invoiceTemplate));
          }
        } else {
          setLayout(normalizeInvoiceTemplate(profile.invoiceTemplate));
        }
        setProfileReady(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loading, profile, profileReady]);

  const selectedElement = useMemo(
    () => layout.elements.find((element) => element.id === selectedId) ?? null,
    [layout.elements, selectedId],
  );

  const persist = useCallback(
    (snapshot: InvoiceTemplateConfiguration, version: number) => {
      setSaveState("saving");
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await saveInvoiceTemplate(snapshot);
          if (editVersionRef.current === version) {
            const profileId = profile?.id;
            if (profileId) {
              window.localStorage.removeItem(invoiceTemplateDraftStorageKey(profileId));
            }
            setIsDirty(false);
            setSaveState("saved");
          }
        })
        .catch((error: unknown) => {
          console.error("Enregistrement du modèle de facture impossible.", error);
          const message =
            error instanceof Error
              ? error.message
              : "Impossible d’enregistrer le modèle de facture.";
          let localCopySaved = false;
          if (profile) {
            try {
              window.localStorage.setItem(
                invoiceTemplateDraftStorageKey(profile.id),
                JSON.stringify(snapshot),
              );
              localCopySaved = true;
            } catch (storageError) {
              console.error(
                "Copie locale du modèle de facture impossible.",
                storageError,
              );
            }
          }
          setSaveState(localCopySaved ? "local-only" : "error");
          notify({
            type: "error",
            title: localCopySaved
              ? "Modèle conservé sur cet appareil"
              : "Modèle non enregistré",
            message: localCopySaved
              ? `${message} Une copie est conservée dans ce navigateur, mais le modèle n’est pas encore enregistré dans le cabinet.`
              : message,
          });
        });
      return saveQueueRef.current;
    },
    [notify, profile, saveInvoiceTemplate],
  );

  useEffect(() => {
    if (!profileReady || !isDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const version = editVersionRef.current;
    saveTimerRef.current = setTimeout(() => void persist(layout, version), 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirty, layout, persist, profileReady]);

  function commit(next: InvoiceTemplateConfiguration) {
    setHistory((previous) => [...previous.slice(-29), layout]);
    setFuture([]);
    setLayout(next);
    editVersionRef.current += 1;
    setIsDirty(true);
  }

  function updateElement(id: string, changes: Partial<InvoiceTemplateElement>) {
    commit({
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === id ? { ...element, ...changes } : element,
      ),
    });
  }

  function addElement(kind: Exclude<InvoiceTemplateElementKind, "builtin">) {
    const id = `${kind}-${crypto.randomUUID()}`;
    const element = createInvoiceTemplateElement(kind, id);
    commit({ ...layout, elements: [...layout.elements, element] });
    setSelectedId(id);
    setTool("select");
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [...current, layout]);
    setLayout(previous);
    editVersionRef.current += 1;
    setIsDirty(true);
  }

  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setFuture((current) => current.slice(0, -1));
    setHistory((current) => [...current, layout]);
    setLayout(next);
    editVersionRef.current += 1;
    setIsDirty(true);
  }

  function duplicateElement(element: InvoiceTemplateElement) {
    if (element.kind === "builtin") return;
    if (layout.elements.length >= maxTemplateElements) {
      notify({
        type: "error",
        title: "Limite de calques atteinte",
        message: `Un modèle peut contenir au maximum ${maxTemplateElements} calques.`,
      });
      return;
    }
    const id = `${element.kind}-${crypto.randomUUID()}`;
    const copy = {
      ...element,
      id,
      name: `${element.name} (copie)`.slice(0, 80),
      x: Math.min(210 - element.width, element.x + 5),
      y: Math.min(297 - element.height, element.y + 5),
    };
    const next = { ...layout, elements: [...layout.elements, copy] };
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > maxTemplateBytes) {
      notify({
        type: "error",
        title: "Modèle trop volumineux",
        message: "Retirez un calque ou importez une image plus légère avant de dupliquer cet objet.",
      });
      return;
    }
    commit(next);
    setSelectedId(id);
  }

  function moveLayer(id: string, direction: -1 | 1) {
    const index = layout.elements.findIndex((element) => element.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= layout.elements.length) return;
    const elements = [...layout.elements];
    [elements[index], elements[target]] = [elements[target], elements[index]];
    commit({ ...layout, elements });
  }

  function removeElement(element: InvoiceTemplateElement) {
    if (element.kind === "builtin") {
      updateElement(element.id, { visible: false });
      return;
    }

    commit({
      ...layout,
      elements: layout.elements.filter((item) => item.id !== element.id),
    });
    setSelectedId(null);
  }

  function clearTemplate() {
    if (
      !window.confirm(
        "Vider la page du modèle ? Les objets de facture seront masqués et les objets personnalisés retirés. Les informations des factures enregistrées ne seront pas modifiées. Vous pourrez annuler cette action.",
      )
    ) {
      return;
    }

    commit({
      ...layout,
      elements: layout.elements
        .filter((element) => element.kind === "builtin")
        .map((element) => ({ ...element, visible: false })),
    });
    setSelectedId(null);
  }

  function startDrag(
    event: PointerEvent<HTMLDivElement>,
    element: InvoiceTemplateElement,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    setSelectedId(element.id);
    if (tool !== "select") return;
    dragRef.current = {
      id: element.id,
      mode: "move",
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      fontSize: element.fontSize,
      initialLayout: layout,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startResize(
    event: PointerEvent<HTMLButtonElement>,
    element: InvoiceTemplateElement,
    corner: NonNullable<DragState["corner"]>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    setSelectedId(element.id);
    dragRef.current = {
      id: element.id,
      mode: "resize",
      corner,
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      fontSize: element.fontSize,
      initialLayout: layout,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragElement(event: PointerEvent) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    const mmPerPixel = 210 / bounds.width;
    const deltaX = (event.clientX - drag.pointerX) * mmPerPixel;
    const deltaY = (event.clientY - drag.pointerY) * mmPerPixel;
    const element = drag.initialLayout.elements.find((item) => item.id === drag.id);
    if (!element) return;
    let changes: Partial<InvoiceTemplateElement>;
    if (drag.mode === "move") {
      changes = {
        x: Math.max(0, Math.min(210 - drag.width, drag.x + deltaX)),
        y: Math.max(0, Math.min(297 - drag.height, drag.y + deltaY)),
      };
    } else {
      const growsLeft = drag.corner?.endsWith("left") ?? false;
      const growsTop = drag.corner?.startsWith("top") ?? false;
      const right = drag.x + drag.width;
      const bottom = drag.y + drag.height;
      const width = Math.max(
        1,
        Math.min(
          growsLeft ? right : 210 - drag.x,
          drag.width + (growsLeft ? -deltaX : deltaX),
        ),
      );
      const height = Math.max(
        1,
        Math.min(
          growsTop ? bottom : 297 - drag.y,
          drag.height + (growsTop ? -deltaY : deltaY),
        ),
      );
      changes = {
        x: growsLeft ? right - width : drag.x,
        y: growsTop ? bottom - height : drag.y,
        width,
        height,
        ...(element.kind === "text"
          ? {
              fontSize: Math.max(
                1,
                Math.min(96, drag.fontSize * (height / drag.height)),
              ),
            }
          : {}),
      };
    }
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((item) =>
        item.id === drag.id ? { ...item, ...changes } : item,
      ),
    }));
  }

  function finishDrag() {
    const drag = dragRef.current;
    const movedElement = drag
      ? layout.elements.find((element) => element.id === drag.id)
      : undefined;
    if (
      drag &&
      movedElement &&
      (movedElement.x !== drag.x ||
        movedElement.y !== drag.y ||
        movedElement.width !== drag.width ||
        movedElement.height !== drag.height)
    ) {
      setHistory((previous) => [...previous.slice(-29), drag.initialLayout]);
      setFuture([]);
      editVersionRef.current += 1;
      setIsDirty(true);
    }
    dragRef.current = null;
  }

  function resetTemplate() {
    if (!window.confirm("Restaurer le modèle de facture par défaut ?")) return;
    commit(defaultInvoiceTemplate);
    setSelectedId("title");
  }

  async function saveNow() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await persist(layout, editVersionRef.current);
  }

  async function handleImageUpload(
    file: File | undefined,
    position?: { x: number; y: number },
  ) {
    if (!file) return;
    try {
      const content = await optimizeImage(file);
      const selectedImage =
        !position && selectedElement?.kind === "image" ? selectedElement : null;
      if (!selectedImage && layout.elements.length >= maxTemplateElements) {
        throw new Error(
          `Un modèle peut contenir au maximum ${maxTemplateElements} calques.`,
        );
      }
      const nextElements = selectedImage
        ? layout.elements.map((element) =>
            element.id === selectedImage.id ? { ...element, content } : element,
          )
        : [
            ...layout.elements,
            {
              ...createInvoiceTemplateElement(
                "image",
                `image-${crypto.randomUUID()}`,
              ),
              ...(position
                ? {
                    x: Math.max(0, Math.min(170, position.x - 20)),
                    y: Math.max(0, Math.min(272, position.y - 12.5)),
                  }
                : {}),
              content,
            },
          ];
      const nextLayout = { ...layout, elements: nextElements };
      if (
        new TextEncoder().encode(JSON.stringify(nextLayout)).byteLength >
        maxTemplateBytes
      ) {
        throw new Error(
          "Le modèle est trop volumineux pour cette image. Réduisez la taille de l’image ou retirez un autre calque.",
        );
      }
      commit(nextLayout);
      const nextSelectedId =
        selectedImage?.id ?? nextElements[nextElements.length - 1].id;
      setSelectedId(nextSelectedId);
      window.requestAnimationFrame(() => {
        document
          .getElementById(`invoice-editor-object-${nextSelectedId}`)
          ?.focus({ preventScroll: true });
      });
      setTool("select");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de charger l’image.";
      notify({ type: "error", title: "Image refusée", message });
    }
  }

  function handleImageDragOver(event: DragEvent<HTMLDivElement>) {
    if (
      !Array.from(event.dataTransfer.items).some((item) =>
        item.type.startsWith("image/"),
      )
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingImage(true);
  }

  function handleImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingImage(false);
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (!file) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    void handleImageUpload(file, {
      x: ((event.clientX - bounds.left) / bounds.width) * 210,
      y: ((event.clientY - bounds.top) / bounds.height) * 297,
    });
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.isContentEditable ||
      target.matches("input, textarea, select, [role='textbox']")
    ) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      if (selectedElement?.kind === "builtin") return;
      event.preventDefault();
      if (selectedElement) duplicateElement(selectedElement);
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedElement
    ) {
      event.preventDefault();
      removeElement(selectedElement);
      return;
    }
    if (selectedElement && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      const deltaX =
        event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const deltaY =
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      updateElement(selectedElement.id, {
        x: Math.max(
          0,
          Math.min(210 - selectedElement.width, selectedElement.x + deltaX),
        ),
        y: Math.max(
          0,
          Math.min(297 - selectedElement.height, selectedElement.y + deltaY),
        ),
      });
    }
  }

  async function handlePsdImport(file: File | undefined) {
    if (!file) return;
    setIsImportingPsd(true);
    try {
      if (file.size > 12 * 1024 * 1024) {
        throw new Error("Le fichier Photoshop ne peut pas dépasser 12 Mo.");
      }
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength < 26) {
        throw new Error("Le fichier Photoshop est incomplet ou invalide.");
      }
      const header = new DataView(buffer);
      if (
        header.getUint32(0, false) !== 0x38425053 ||
        header.getUint16(4, false) !== 1
      ) {
        throw new Error("Choisissez un fichier Photoshop PSD (PSB non pris en charge).");
      }
      const height = header.getUint32(14, false);
      const width = header.getUint32(18, false);
      if (
        !width ||
        !height ||
        width > 20_000 ||
        height > 20_000 ||
        width * height > 14_000_000
      ) {
        throw new Error(
          "Les dimensions du document Photoshop sont trop grandes. Limite : 14 millions de pixels.",
        );
      }

      const { readPsd } = await import("ag-psd");
      const psd = readPsd(buffer, {
        skipCompositeImageData: true,
        skipThumbnail: true,
        skipLinkedFilesData: true,
        totalMemoryLimit: 128 * 1024 * 1024,
      });
      const sourceLayers: {
        layer: import("ag-psd").Layer;
        groupNames: string[];
        opacity: number;
      }[] = [];

      function collectLayers(
        layers: import("ag-psd").Layer[],
        groupNames: string[] = [],
        parentOpacity = 1,
      ) {
        for (const layer of layers) {
          if (layer.hidden) continue;
          const opacity = parentOpacity * (layer.opacity ?? 1);
          if (layer.children) {
            collectLayers(layer.children, [...groupNames, layer.name ?? ""], opacity);
          } else if (
            layer.canvas &&
            layer.canvas.width > 0 &&
            layer.canvas.height > 0
          ) {
            sourceLayers.push({ layer, groupNames, opacity });
          }
        }
      }

      collectLayers(psd.children ?? []);
      if (!sourceLayers.length) {
        throw new Error("Aucun calque visible avec une image n’a été trouvé dans ce PSD.");
      }
      const availableSlots = maxTemplateElements - layout.elements.length;
      if (sourceLayers.length > availableSlots) {
        throw new Error(
          `Le modèle peut contenir ${maxTemplateElements} calques au maximum. Il reste ${availableSlots} place(s), mais ce PSD en contient ${sourceLayers.length} de visibles.`,
        );
      }

      const fitScale = Math.min(210 / psd.width, 297 / psd.height);
      const offsetX = (210 - psd.width * fitScale) / 2;
      const offsetY = (297 - psd.height * fitScale) / 2;
      const imported = sourceLayers.map(({ layer, groupNames, opacity }) => {
        const source = layer.canvas;
        if (!source) return null;
        const left = layer.left ?? 0;
        const top = layer.top ?? 0;
        const cropLeft = Math.max(0, -left);
        const cropTop = Math.max(0, -top);
        const cropRight = Math.min(source.width, psd.width - left);
        const cropBottom = Math.min(source.height, psd.height - top);
        const cropWidth = cropRight - cropLeft;
        const cropHeight = cropBottom - cropTop;
        if (cropWidth <= 0 || cropHeight <= 0) return null;

        const canvas = document.createElement("canvas");
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Impossible de préparer les calques du PSD.");
        context.drawImage(
          source,
          cropLeft,
          cropTop,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight,
        );

        const name = [...groupNames, layer.name || "Calque Photoshop"]
          .filter(Boolean)
          .join(" / ")
          .slice(0, 80);
        const id = `psd-${crypto.randomUUID()}`;
        return {
          ...createInvoiceTemplateElement("image", id),
          name,
          x: Math.max(0, offsetX + (left + cropLeft) * fitScale),
          y: Math.max(0, offsetY + (top + cropTop) * fitScale),
          width: Math.min(210, cropWidth * fitScale),
          height: Math.min(297, cropHeight * fitScale),
          content: encodePsdLayer(canvas, opacity),
        };
      }).filter((element): element is InvoiceTemplateElement => element !== null);

      if (!imported.length) {
        throw new Error("Les calques visibles sont en dehors de la page Photoshop.");
      }
      const next: InvoiceTemplateConfiguration = {
        ...layout,
        elements: [...imported.reverse(), ...layout.elements],
      };
      if (new TextEncoder().encode(JSON.stringify(next)).byteLength > maxTemplateBytes) {
        throw new Error(
          "Le modèle importé est trop volumineux pour être sauvegardé. Réduisez le nombre ou la résolution des calques.",
        );
      }

      commit(next);
      setSelectedId(imported.at(-1)?.id ?? null);
      setTool("select");
      notify({
        type: "success",
        title: "Calques Photoshop importés",
        message: `${imported.length} calque(s) visible(s) ajouté(s) séparément sous les éléments de facture. Vous pouvez les déplacer, redimensionner, masquer ou supprimer. Le texte devient une image et les effets ou modes de fusion complexes peuvent différer : vérifiez l’aperçu.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible d’importer les calques Photoshop.";
      console.error("Import des calques Photoshop impossible.", error);
      notify({ type: "error", title: "Import PSD impossible", message });
    } finally {
      setIsImportingPsd(false);
    }
  }

  return (
    <div className="invoice-editor-page" onKeyDown={handleEditorKeyDown}>
      <header className="invoice-editor-header">
        <div>
          <Link href="/settings" className="invoice-editor-back">
            <ArrowLeft className="h-4 w-4" />
            Paramètres du cabinet
          </Link>
          <h1>Configuration du modèle de facture</h1>
          <p>Modifiez chaque calque comme dans un studio graphique : déplacez et redimensionnez les éléments, puis remplacez, masquez ou retirez leur contenu. Importez aussi les calques visibles d’un fichier Photoshop PSD. Les données de facture restent intactes.</p>
        </div>
        <div className="invoice-editor-header-actions">
          <span className={`invoice-editor-save-state is-${saveState}`} role="status">
            {saveState === "saving"
              ? "Enregistrement…"
              : saveState === "local-only"
                ? "Copie locale — serveur à mettre à jour"
                : saveState === "error"
                  ? "Échec de l’enregistrement"
                  : "Modifications enregistrées"}
          </span>
          <button type="button" onClick={() => void saveNow()} className="invoice-editor-save-button" disabled={saveState === "saving" || !profileReady}>
            <Save className="h-4 w-4" />
            Enregistrer
          </button>
        </div>
      </header>

      {!profile && !loading ? (
        <div className="invoice-editor-unavailable">
          {profileError || "Le profil du cabinet n’est pas chargé. Vérifiez la connexion au serveur avant de modifier le modèle."}
        </div>
      ) : !profileReady ? (
        <div className="invoice-editor-unavailable">
          Chargement du modèle de facture…
        </div>
      ) : (
        <div className="invoice-editor-workspace">
          <aside className="invoice-editor-toolbar" aria-label="Outils du modèle">
            <div className="invoice-editor-tool-group">
              <button type="button" onClick={() => setTool("select")} className={tool === "select" ? "is-active" : ""} title="Sélectionner et déplacer" aria-label="Sélectionner et déplacer">
                <MousePointer2 />
              </button>
              <button type="button" onClick={() => addElement("text")} title="Ajouter un texte" aria-label="Ajouter un texte">
                <Type />
              </button>
              <button type="button" onClick={() => addElement("shape")} title="Ajouter un rectangle" aria-label="Ajouter un rectangle">
                <Square />
              </button>
              <button type="button" onClick={() => addElement("line")} title="Ajouter une ligne" aria-label="Ajouter une ligne">
                <Minus />
              </button>
              <label
                className="invoice-editor-tool-upload"
                title={selectedElement?.kind === "image" ? "Remplacer l’image sélectionnée" : "Importer une image"}
                aria-label={selectedElement?.kind === "image" ? "Remplacer l’image sélectionnée" : "Importer une image"}
              >
                <ImagePlus />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  aria-label="Importer ou remplacer une image"
                  onChange={(event) => {
                    void handleImageUpload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label
                className={`invoice-editor-tool-upload ${isImportingPsd ? "is-active" : ""}`}
                title="Importer les calques d’un fichier Photoshop PSD"
                aria-label="Importer les calques d’un fichier Photoshop PSD"
              >
                <Layers />
                <input
                  type="file"
                  accept=".psd,image/vnd.adobe.photoshop"
                  aria-label="Importer les calques d’un fichier Photoshop PSD"
                  disabled={isImportingPsd}
                  onChange={(event) => {
                    void handlePsdImport(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div className="invoice-editor-tool-group">
              <button type="button" disabled={!history.length} onClick={undo} title="Annuler" aria-label="Annuler">
                <Undo2 />
              </button>
              <button type="button" disabled={!future.length} onClick={redo} title="Rétablir" aria-label="Rétablir">
                <Redo2 />
              </button>
              <button type="button" onClick={resetTemplate} title="Restaurer le modèle" aria-label="Restaurer le modèle">
                <RotateCcw />
              </button>
              <button type="button" onClick={clearTemplate} className="is-danger" title="Vider la page du modèle" aria-label="Vider la page du modèle">
                <Trash2 />
              </button>
            </div>
          </aside>

          <main className="invoice-editor-canvas-area">
            <div className="invoice-editor-ruler">
              <span>A4 · 210 × 297 mm</span>
              <span className="invoice-editor-import-status">
                {isImportingPsd
                  ? "Import et compression des calques Photoshop…"
                  : "Glissez une image sur la page · flèches pour déplacer · Maj + flèche : 5 mm"}
              </span>
              <div className="invoice-editor-view-controls">
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.max(60, current - 10))}
                  disabled={zoom <= 60}
                  title="Réduire le zoom"
                  aria-label="Réduire le zoom"
                >
                  <ZoomOut />
                </button>
                <button
                  type="button"
                  className="invoice-editor-zoom-value"
                  onClick={() => setZoom(100)}
                  title="Rétablir le zoom à 100 %"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.min(140, current + 10))}
                  disabled={zoom >= 140}
                  title="Agrandir le zoom"
                  aria-label="Agrandir le zoom"
                >
                  <ZoomIn />
                </button>
                <button
                  type="button"
                  className={showGrid ? "is-active" : ""}
                  onClick={() => setShowGrid((current) => !current)}
                  aria-pressed={showGrid}
                  title={showGrid ? "Masquer la grille" : "Afficher la grille"}
                  aria-label={showGrid ? "Masquer la grille" : "Afficher la grille"}
                >
                  <Grid3X3 />
                </button>
              </div>
            </div>
            <div
              ref={stageRef}
              className={`invoice-editor-canvas ${showGrid ? "has-grid" : ""} ${isDraggingImage ? "is-drop-target" : ""}`}
              style={{ zoom: zoom / 100 }}
              onPointerMove={dragElement}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onClick={() => setSelectedId(null)}
              onDragOver={handleImageDragOver}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDraggingImage(false);
                }
              }}
              onDrop={handleImageDrop}
            >
              {layout.elements.filter((element) => element.visible).map((element) => {
                const custom = element.kind !== "builtin";
                const style: CSSProperties = {
                  left: `${(element.x / 210) * 100}%`,
                  top: `${(element.y / 297) * 100}%`,
                  width: `${(element.width / 210) * 100}%`,
                  height: `${(element.height / 297) * 100}%`,
                  color: element.color,
                  fontSize: `${((element.fontSize * 96) / 72 / 793) * 100}cqw`,
                  backgroundColor:
                    element.kind === "shape" ? element.fill : undefined,
                };
                return (
                  <div
                    key={element.id}
                    id={`invoice-editor-object-${element.id}`}
                    className={`invoice-editor-object is-${element.kind} ${selectedId === element.id ? "is-selected" : ""} ${custom ? "is-custom" : ""}`}
                    style={style}
                    role="group"
                    tabIndex={0}
                    aria-label={`${element.name}${selectedId === element.id ? ", sélectionné" : ""}`}
                    onPointerDown={(event) => startDrag(event, element)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(element.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(element.id);
                      }
                    }}
                  >
                    {element.kind === "image" ? (
                      element.content ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={element.content} alt={element.name} draggable={false} />
                      ) : (
                        <span className="invoice-editor-placeholder">Image</span>
                      )
                    ) : element.kind === "shape" || element.kind === "line" ? null : (
                      element.kind === "builtin" &&
                      element.id === "logo" &&
                      !element.content ? (
                        <DocumentLetterhead />
                      ) : element.kind === "builtin" && element.id === "qr" && !element.content ? (
                        <QRCodeSVG className="invoice-editor-qr" value="Cabinet Transparency — aperçu du modèle" includeMargin aria-hidden="true" />
                      ) : element.kind === "builtin" && element.id === "items" && !element.content ? (
                        <table className="invoice-editor-sample-table">
                          <colgroup>
                            <col className="invoice-column-number" />
                            <col className="invoice-column-rubric" />
                            <col className="invoice-column-quantity" />
                            <col className="invoice-column-price" />
                            <col className="invoice-column-total" />
                          </colgroup>
                          <thead><tr><th>N°</th><th>Rubrique</th><th>Nombre</th><th>Prix unitaire</th><th>Prix total</th></tr></thead>
                          <tbody><tr><td>1</td><td>Honoraires pour les travaux de contrôle de la paie et audit organisationnel</td><td>1</td><td>7 000 USD</td><td>7 000 USD</td></tr></tbody>
                        </table>
                      ) : element.kind === "builtin" && element.id === "total" && !element.content ? (
                        <div className="invoice-editor-sample-total"><span>Total général</span><strong>7 000 USD</strong></div>
                      ) : element.kind === "builtin" &&
                        element.id === "footer" ? (
                        <>
                          <DocumentFooterWave fill={element.fill} />
                          <span className="invoice-editor-object-content is-footer">
                            {editorPreview(element)}
                          </span>
                        </>
                      ) : (
                        <span className={`invoice-editor-object-content is-${element.id}`}>
                          {editorPreview(element)}
                        </span>
                      )
                    )}
                    {selectedId === element.id && (
                      <>
                        {(
                          ["top-left", "top-right", "bottom-left", "bottom-right"] as const
                        ).map((corner) => (
                          <button
                            key={corner}
                            type="button"
                            className={`invoice-editor-resize-handle is-${corner}`}
                            aria-label={`Redimensionner ${element.name} depuis le coin ${
                              {
                                "top-left": "supérieur gauche",
                                "top-right": "supérieur droit",
                                "bottom-left": "inférieur gauche",
                                "bottom-right": "inférieur droit",
                              }[corner]
                            }`}
                            title="Tirer pour redimensionner"
                            onPointerDown={(event) =>
                              startResize(event, element, corner)
                            }
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </main>

          <aside className="invoice-editor-properties">
            {selectedElement ? (
              <>
                <div className="invoice-editor-panel-heading">
                  <div>
                    <p>Propriétés</p>
                    <h2>{selectedElement.name}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateElement(selectedElement.id, { visible: !selectedElement.visible })}
                    aria-label={selectedElement.visible ? "Masquer l’objet" : "Afficher l’objet"}
                    title={selectedElement.visible ? "Masquer l’objet" : "Afficher l’objet"}
                  >
                    {selectedElement.visible ? <Eye /> : <EyeOff />}
                  </button>
                </div>
                <label className="invoice-editor-field">
                  Nom du calque
                  <input value={selectedElement.name} maxLength={80} onChange={(event) => updateElement(selectedElement.id, { name: event.target.value })} />
                </label>
                {selectedElement.kind === "image" && (
                  <>
                    <button
                      type="button"
                      className="invoice-editor-image-replace"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImagePlus />
                      Remplacer l’image
                    </button>
                    <label className="invoice-editor-field">
                      Adresse de l’image
                      <input value={selectedElement.content} maxLength={2_000} placeholder="https://… ou importer une image" onChange={(event) => updateElement(selectedElement.id, { content: event.target.value })} />
                    </label>
                  </>
                )}
                {(selectedElement.kind === "text" || selectedElement.kind === "builtin") && (
                  <label className="invoice-editor-field">
                    Texte personnalisé
                    <textarea
                      value={selectedElement.content}
                      maxLength={2_000}
                      rows={4}
                      placeholder={selectedElement.kind === "builtin" ? "Laisser vide pour conserver le contenu automatique." : "Votre texte"}
                      onChange={(event) => updateElement(selectedElement.id, { content: event.target.value })}
                    />
                    {selectedElement.kind === "builtin" && (
                      <span className="invoice-editor-help">
                          Remplace le contenu automatique sur la facture. Variables : {"{{numero}}"}, {"{{client}}"}, {"{{periode}}"}, {"{{concerne}}"} (ou {"{{prestation}}"}), {"{{date}}"}, {"{{lieu}}"}, {"{{total}}"}.
                      </span>
                    )}
                  </label>
                )}
                <div className="invoice-editor-field-grid">
                  <label className="invoice-editor-field">
                    Position X (mm)
                    <input type="number" min="0" max={210 - selectedElement.width} step="1" value={Math.round(selectedElement.x)} onChange={(event) => updateElement(selectedElement.id, { x: Number(event.target.value) })} />
                  </label>
                  <label className="invoice-editor-field">
                    Position Y (mm)
                    <input type="number" min="0" max={297 - selectedElement.height} step="1" value={Math.round(selectedElement.y)} onChange={(event) => updateElement(selectedElement.id, { y: Number(event.target.value) })} />
                  </label>
                  <label className="invoice-editor-field">
                    Largeur (mm)
                    <input type="number" min="1" max={210 - selectedElement.x} step="1" value={Math.round(selectedElement.width)} onChange={(event) => {
                      const width = Number(event.target.value);
                      if (Number.isFinite(width)) updateElement(selectedElement.id, { width: Math.max(1, Math.min(210 - selectedElement.x, width)) });
                    }} />
                  </label>
                  <label className="invoice-editor-field">
                    Hauteur (mm)
                    <input type="number" min="1" max={297 - selectedElement.y} step="1" value={Math.round(selectedElement.height)} onChange={(event) => {
                      const height = Number(event.target.value);
                      if (Number.isFinite(height)) updateElement(selectedElement.id, { height: Math.max(1, Math.min(297 - selectedElement.y, height)) });
                    }} />
                  </label>
                  <label className="invoice-editor-field">
                    Taille du texte
                    <input type="number" min="1" max="96" step="1" value={selectedElement.fontSize} onChange={(event) => updateElement(selectedElement.id, { fontSize: Number(event.target.value) })} />
                  </label>
                  <label className="invoice-editor-field">
                    Couleur du texte
                    <input type="color" value={selectedElement.color} onChange={(event) => updateElement(selectedElement.id, { color: event.target.value })} />
                  </label>
                  {(selectedElement.kind === "shape" || selectedElement.kind === "builtin") && (
                    <label className="invoice-editor-field">
                      Couleur de fond
                      <input type="color" value={selectedElement.fill === "transparent" ? "#ffffff" : selectedElement.fill} onChange={(event) => updateElement(selectedElement.id, { fill: event.target.value })} />
                    </label>
                  )}
                </div>
                <div className="invoice-editor-layer-actions">
                  {selectedElement.kind !== "builtin" && (
                    <button
                      type="button"
                      onClick={() => duplicateElement(selectedElement)}
                      title="Dupliquer le calque"
                    >
                      <Copy />
                      Dupliquer
                    </button>
                  )}
                  <button type="button" onClick={() => moveLayer(selectedElement.id, -1)} title="Reculer le calque"><ArrowDown />Reculer</button>
                  <button type="button" onClick={() => moveLayer(selectedElement.id, 1)} title="Avancer le calque"><ArrowUp />Avancer</button>
                  <button
                    type="button"
                    onClick={() => removeElement(selectedElement)}
                    className="is-danger"
                  >
                    <Trash2 />
                    {selectedElement.kind === "builtin"
                      ? "Retirer de la facture"
                      : "Supprimer l’objet"}
                  </button>
                </div>
                {selectedElement.kind === "builtin" && (
                  <p className="invoice-editor-help">
                    Les champs retirés restent dans les calques masqués et peuvent être réaffichés avec l’icône en forme d’œil.
                  </p>
                )}
              </>
            ) : (
              <div className="invoice-editor-empty-selection">
                <Circle />
                <h2>Sélectionnez un objet</h2>
                <p>Choisissez un calque sur la page ou dans la liste pour modifier son texte et son apparence, ou le retirer de la facture.</p>
              </div>
            )}

            <section className="invoice-editor-layers">
              <h2>Calques <span>{layout.elements.length}</span></h2>
              <div className="invoice-editor-layer-list">
                {[...layout.elements].reverse().map((element) => (
                  <button
                    type="button"
                    key={element.id}
                    onClick={() => setSelectedId(element.id)}
                    className={selectedId === element.id ? "is-active" : ""}
                  >
                    <span className="invoice-editor-layer-icon">
                      {element.kind === "image" ? <ImagePlus /> : element.kind === "shape" ? <Square /> : element.kind === "line" ? <Minus /> : <Type />}
                    </span>
                    <span>{element.name}</span>
                    {!element.visible && <EyeOff className="invoice-editor-hidden-icon" />}
                    {element.visible && <Check className="invoice-editor-visible-icon" />}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
