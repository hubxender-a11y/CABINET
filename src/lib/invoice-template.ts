export type InvoiceTemplateElementKind =
  | "builtin"
  | "text"
  | "image"
  | "shape"
  | "line";

export type InvoiceTemplateElement = {
  id: string;
  name: string;
  kind: InvoiceTemplateElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  fill: string;
  visible: boolean;
  content: string;
};

export type InvoiceTemplateConfiguration = {
  version: 1;
  elements: InvoiceTemplateElement[];
};

export const invoiceTemplateDraftStorageKey = (profileId: string) =>
  `factura-invoice-template-draft:${profileId}`;

const legacyBuiltinElements: InvoiceTemplateElement[] = [
  { id: "logo", name: "Logo du cabinet", kind: "builtin", x: 10, y: 14, width: 100, height: 25, fontSize: 14, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "qr", name: "Code QR", kind: "builtin", x: 166, y: 16, width: 26, height: 26, fontSize: 10, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "title", name: "Titre et numéro", kind: "builtin", x: 10, y: 54, width: 145, height: 12, fontSize: 19, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "date", name: "Lieu et date", kind: "builtin", x: 110, y: 68, width: 90, height: 12, fontSize: 10, color: "#334155", fill: "#ffffff", visible: true, content: "" },
  { id: "client", name: "Client", kind: "builtin", x: 10, y: 84, width: 90, height: 14, fontSize: 11, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "period", name: "Période", kind: "builtin", x: 105, y: 84, width: 90, height: 14, fontSize: 11, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "prestation", name: "Concerne", kind: "builtin", x: 10, y: 100, width: 190, height: 14, fontSize: 11, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "items", name: "Tableau des rubriques", kind: "builtin", x: 10, y: 120, width: 190, height: 50, fontSize: 10, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "total", name: "Total général", kind: "builtin", x: 110, y: 173, width: 90, height: 14, fontSize: 13, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "amount-words", name: "Montant en lettres", kind: "builtin", x: 10, y: 190, width: 190, height: 12, fontSize: 9, color: "#111827", fill: "#ffffff", visible: true, content: "" },
  { id: "payment-terms", name: "Modalités de paiement", kind: "builtin", x: 10, y: 232, width: 105, height: 23, fontSize: 9, color: "#111827", fill: "#ffffff", visible: true, content: "" },
  { id: "signature", name: "Signature", kind: "builtin", x: 128, y: 222, width: 68, height: 35, fontSize: 10, color: "#17243b", fill: "#ffffff", visible: true, content: "" },
  { id: "footer", name: "Pied de page", kind: "builtin", x: 0, y: 247, width: 210, height: 50, fontSize: 8, color: "#ffffff", fill: "#142b48", visible: true, content: "" },
];

const referenceLayout: Record<string, [number, number, number, number, number]> = {
  logo: [13, 18, 128, 32, 14],
  qr: [161, 16, 33, 33, 10],
  title: [6, 58, 198, 13, 20],
  date: [104, 207, 100, 11, 9],
  client: [6, 81, 101, 20, 14],
  period: [111, 81, 93, 20, 10],
  prestation: [6, 101, 198, 10, 10],
  items: [6, 110, 198, 39, 10],
  total: [6, 149, 198, 15, 13],
  "amount-words": [6, 166, 198, 13, 12],
  "payment-terms": [6, 183, 198, 19, 8],
  signature: [121, 219, 83, 24, 11],
  footer: [0, 246, 210, 51, 8],
};

const builtinElements = legacyBuiltinElements.map((element) => {
  const [x, y, width, height, fontSize] = referenceLayout[element.id];
  return {
    ...element,
    x,
    y,
    width,
    height,
    fontSize,
    color: element.id === "footer" ? "#ffffff" : "#081f4b",
    fill: element.id === "footer" ? "#003367" : element.fill,
  };
});

export const defaultInvoiceTemplate: InvoiceTemplateConfiguration = {
  version: 1,
  elements: builtinElements,
};

function isInvoiceTemplateElement(
  value: unknown,
): value is InvoiceTemplateElement {
  if (!value || typeof value !== "object") return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "kind" in value &&
    ["builtin", "text", "image", "shape", "line"].includes(
      String(value.kind),
    ) &&
    "x" in value &&
    typeof value.x === "number" &&
    "y" in value &&
    typeof value.y === "number" &&
    "width" in value &&
    typeof value.width === "number" &&
    "height" in value &&
    typeof value.height === "number" &&
    "fontSize" in value &&
    typeof value.fontSize === "number" &&
    "color" in value &&
    typeof value.color === "string" &&
    "fill" in value &&
    typeof value.fill === "string" &&
    "visible" in value &&
    typeof value.visible === "boolean" &&
    "content" in value &&
    typeof value.content === "string"
  );
}

export function createInvoiceTemplateElement(
  kind: Exclude<InvoiceTemplateElementKind, "builtin">,
  id: string,
): InvoiceTemplateElement {
  const defaults = {
    text: { name: "Texte", width: 60, height: 12, fontSize: 12, content: "Nouveau texte" },
    image: { name: "Image", width: 40, height: 25, fontSize: 10, content: "" },
    shape: { name: "Rectangle", width: 40, height: 20, fontSize: 10, content: "" },
    line: { name: "Ligne", width: 60, height: 1, fontSize: 10, content: "" },
  }[kind];

  return {
    id,
    name: defaults.name,
    kind,
    x: 75,
    y: 145,
    width: defaults.width,
    height: defaults.height,
    fontSize: defaults.fontSize,
    color: "#17243b",
    fill: kind === "shape" ? "#e8eef6" : "transparent",
    visible: true,
    content: defaults.content,
  };
}

export function normalizeInvoiceTemplate(value: unknown): InvoiceTemplateConfiguration {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    !("elements" in value) ||
    value.version !== 1 ||
    !Array.isArray(value.elements)
  ) {
    return defaultInvoiceTemplate;
  }

  const savedElements = value.elements.filter(isInvoiceTemplateElement);
  const elements = defaultInvoiceTemplate.elements.map((base, index) => {
    const saved = savedElements.find(
      (element) => element && element.id === base.id && element.kind === "builtin",
    );
    if (!saved) return base;
    const legacy = legacyBuiltinElements[index];
    const hasLegacyGeometry =
      (saved.x === legacy.x && saved.y === legacy.y &&
        saved.width === legacy.width && saved.height === legacy.height) ||
      (
      base.id === "footer" &&
      saved.x === 0 &&
      saved.width === 210 &&
      ((saved.y === 269 && saved.height === 28) ||
        (saved.y === 237 && saved.height === 60) ||
        (saved.y === 270 && saved.height === 20)));
    return {
      ...base,
      ...saved,
      ...(hasLegacyGeometry
        ? { x: base.x, y: base.y, width: base.width, height: base.height }
        : {}),
      fontSize: hasLegacyGeometry && saved.fontSize === legacy.fontSize
        ? base.fontSize : saved.fontSize,
      color: hasLegacyGeometry && saved.color === legacy.color ? base.color : saved.color,
      fill: hasLegacyGeometry && saved.fill === legacy.fill ? base.fill : saved.fill,
      name:
        base.id === "prestation" && saved.name === "Prestation"
          ? base.name
          : saved.name,
    };
  });

  return {
    version: 1,
    elements: [
      ...elements,
      ...savedElements.filter(
        (element) =>
          element &&
          element.kind !== "builtin" &&
          typeof element.id === "string" &&
          !elements.some((base) => base.id === element.id),
      ),
    ],
  };
}
