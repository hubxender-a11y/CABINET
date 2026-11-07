function safeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "facture";
}

function paintFooterText(context: CanvasRenderingContext2D, footer: HTMLElement) {
  const paragraphs = Array.from(footer.querySelectorAll(".document-footer-content p"));
  const custom = footer.querySelector(".invoice-template-footer-text");
  const lines = (custom ? [custom] : paragraphs).flatMap((paragraph) =>
    (paragraph.textContent ?? "").split("\n").map((text) => ({
      text,
      bold: paragraph.classList.contains("document-footer-legal"),
    })),
  );
  const fontSize = (Number.parseFloat(footer.style.fontSize) || 8) * 25.4 / 72;
  const lineHeight = fontSize * 1.4;
  const wrapped = lines.flatMap(({ text, bold }) => {
    const font = `${bold ? "bold " : ""}${fontSize}px Arial`;
    context.font = font;
    const rows = [""];
    for (const word of text.split(/\s+/)) {
      const row = rows.length - 1;
      const candidate = rows[row] ? `${rows[row]} ${word}` : word;
      if (rows[row] && context.measureText(candidate).width > 198) {
        rows.push(word);
      } else {
        rows[row] = candidate;
      }
    }
    return rows.map((row) => ({ text: row, font }));
  });
  const start = Math.max(19, 31 - (wrapped.length - 1) * lineHeight / 2);
  context.fillStyle = footer.style.color || "#fff";
  context.textAlign = "center";
  wrapped.forEach(({ text, font }, index) => {
    context.font = font;
    context.fillText(text, 105, start + index * lineHeight, 198);
  });
}

async function rasterizeInlineSvgs(root: HTMLElement) {
  const svgs = Array.from(root.querySelectorAll("svg"));

  await Promise.all(
    svgs.map(async (svg) => {
      const source = new XMLSerializer().serializeToString(svg);
      const imageUrl = URL.createObjectURL(
        new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
      );
      try {
        const image = new window.Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Un visuel de la facture n’a pas pu être converti."));
          image.src = imageUrl;
        });
        const viewBox = svg.viewBox.baseVal;
        const width = Math.max(1, Math.ceil(viewBox.width || svg.clientWidth || 256));
        const height = Math.max(1, Math.ceil(viewBox.height || svg.clientHeight || 256));
        const canvas = document.createElement("canvas");
        canvas.width = width * 3;
        canvas.height = height * 3;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Un visuel de la facture n’a pas pu être converti.");
        }
        context.scale(3, 3);
        context.drawImage(image, 0, 0, width, height);
        const footer = svg.closest<HTMLElement>(".invoice-document-footer");
        if (footer) paintFooterText(context, footer);
        const png = document.createElement("img");
        png.src = canvas.toDataURL("image/png");
        if (footer) {
          png.alt = footer.innerText || footer.textContent || "Pied de page";
          png.style.cssText = "display:block;width:210mm;height:51mm";
          footer.replaceChildren(png);
        } else {
          png.alt = svg.querySelector("title")?.textContent || "Code QR de la facture";
          png.style.cssText = "display:block;width:33mm;height:33mm";
          svg.replaceWith(png);
        }
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    }),
  );
}

async function embedImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      if (image.src.startsWith("data:")) return;
      const response = await fetch(image.currentSrc || image.src, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("Une image du modèle n’a pas pu être ajoutée au fichier Word.");
      }
      const imageData = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Une image du modèle n’a pas pu être convertie."));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () =>
          reject(new Error("Une image du modèle n’a pas pu être lue."));
        reader.readAsDataURL(imageData);
      });
      image.src = dataUrl;
      image.removeAttribute("srcset");
    }),
  );
}

function formatWordHeader(header: HTMLElement) {
  const logo = header.querySelector<HTMLElement>('[data-invoice-object="logo"]');
  const qr = header.querySelector<HTMLElement>(".invoice-document-qr");
  if (!logo || !qr) {
    throw new Error("Le logo ou le code QR du modèle n’a pas pu être préparé pour Word.");
  }

  const table = document.createElement("table");
  table.setAttribute("role", "presentation");
  table.border = "0";
  table.cellPadding = "0";
  table.cellSpacing = "0";
  table.style.cssText = "width:198mm;border-collapse:collapse;table-layout:fixed";
  const row = table.insertRow();
  const logoCell = row.insertCell();
  logoCell.style.cssText = "width:76%;padding:0 0 0 7mm;vertical-align:top";
  logoCell.append(logo);
  const qrCell = row.insertCell();
  qrCell.setAttribute("align", "right");
  qrCell.style.cssText = "width:24%;padding:0 10mm 0 0;vertical-align:top";
  qrCell.append(qr);
  header.replaceChildren(table);
  header.style.cssText =
    "width:198mm;height:33mm;margin:0;background:#fff";
  return header;
}

function formatWordDetails(invoice: HTMLElement) {
  const details = invoice.querySelector(".invoice-document-details");
  if (!details) return;

  const table = document.createElement("table");
  table.className = "invoice-document-details";
  table.setAttribute("role", "presentation");
  const row = table.insertRow();
  for (const id of ["client", "period"]) {
    const cell = row.insertCell();
    cell.style.width = id === "client" ? "54%" : "46%";
    const field = details.querySelector(`[data-invoice-object="${id}"]`);
    if (field) cell.append(field);
  }
  const concern = details.querySelector(".invoice-document-prestation");
  if (concern) {
    const cell = table.insertRow().insertCell();
    cell.colSpan = 2;
    cell.append(concern);
  }
  details.replaceWith(table);
}

export async function downloadInvoiceWord(invoiceId: string, source: HTMLElement) {
  const invoice = source.cloneNode(true) as HTMLElement;
  const originalHeader = invoice.querySelector<HTMLElement>(".invoice-document-top");
  if (!originalHeader) {
    throw new Error("L’en-tête du modèle de facture est introuvable.");
  }
  const footer = invoice.querySelector<HTMLElement>(".invoice-document-footer");
  originalHeader.remove();
  footer?.remove();
  const header = formatWordHeader(originalHeader);
  formatWordDetails(invoice);
  invoice.querySelector(".invoice-document-status")?.remove();

  const imagesToEmbed = [invoice, header, footer].filter(
    (element): element is HTMLElement => element !== null,
  );
  await Promise.all(imagesToEmbed.map(rasterizeInlineSvgs));
  await Promise.all(imagesToEmbed.map(embedImages));

  const wordHeader = `<div id="h1" style="mso-element:header">${header.outerHTML}</div>`;
  const wordFooter =
    footer && footer.style.display !== "none"
      ? `<div id="f1" style="mso-element:footer">${footer.outerHTML}</div>`
      : "";

  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="fr">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Cabinet Transparency">
<title>Facture</title>
<style>
@page WordSection1 {
  size: 210mm 297mm;
  margin: 58mm 6mm 54mm;
  mso-header-margin: 16mm;
  mso-footer-margin: 0mm;
  mso-header: h1;
  ${wordFooter ? "mso-footer: f1;" : ""}
}
div.WordSection1 { page: WordSection1; }
body { background: #fff; color: #081f4b; font: 10pt Arial, sans-serif; }
p, h2, h3 { margin: 0; }
.invoice-document { position: relative; }
.document-letterhead-logo { width: 128mm; height: auto; }
.invoice-document-title-row h2 { font-size: inherit; font-weight: bold; text-transform: uppercase; }
.invoice-document-title-row h2 span { font-size: 76%; }
.invoice-document-accent-rule { height: 1mm; margin: 4mm 0 5mm; border-top: 1pt solid #ffae00; border-bottom: 1pt solid #214f8d; }
.invoice-document-details { width: 100%; border-collapse: collapse; border-bottom: 1pt solid #214f8d; }
.invoice-document-details td { height: 18mm; padding: 0 0 4mm; vertical-align: top; }
.invoice-document-details td[colspan] { height: auto; }
.invoice-document-label { color: #003367; font: bold 10pt Arial, sans-serif; text-transform: uppercase; }
[data-invoice-object="client"] { font-weight: bold; text-transform: uppercase; }
.invoice-document-table-wrap { margin-top: 7mm; }
.invoice-document-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: inherit; }
.invoice-column-number { width: 6%; }
.invoice-column-rubric { width: 36%; }
.invoice-column-quantity { width: 15%; }
.invoice-column-price { width: 23%; }
.invoice-column-total { width: 20%; }
.invoice-document-table thead { display: table-header-group; }
.invoice-document-table tfoot { display: table-row-group; }
.invoice-document-table th, .invoice-document-table td { border: 0.8pt solid #214f8d; padding: 2.5mm 1.8mm; text-align: center; vertical-align: top; }
.invoice-document-table thead th { background: #003367; color: #fff; font-size: 9pt; text-transform: uppercase; }
.invoice-document-table tbody td:nth-child(2) { text-align: left; }
.invoice-document-table tfoot th, .invoice-document-table tfoot td, .invoice-document-total { background: #d1e7f7; font-weight: bold; text-transform: uppercase; }
.invoice-document-table tfoot th, .invoice-document-total { text-align: right; }
.invoice-document-total { border: 0.8pt solid #214f8d; padding: 3mm 2mm; }
.invoice-document-total strong { margin-left: 4mm; }
.invoice-document-amount-words { padding: 4mm 0 2mm; border-bottom: 1pt solid #214f8d; font-weight: bold; }
.invoice-document-exchange { margin-top: 2mm; text-align: right; font-size: 7pt; color: #52627a; }
.invoice-document-bottom { margin-top: 6mm; page-break-inside: avoid; }
.invoice-payment-terms { width: 184mm; }
.invoice-payment-terms h3 { font-size: 12pt; }
.invoice-document-approval { margin-top: 8mm; text-align: right; }
.document-signature { width: 83mm; margin: 3mm 0 0 auto; text-align: center; }
.document-signature-label { display: none; }
.document-signature-image, .document-signature-space { width: 58mm; height: 11mm; }
.document-signature-name { padding-top: 1mm; border-top: 1pt solid #214f8d; font-weight: bold; }
.document-signature-title { color: #003367; font-size: 83%; }
.invoice-document-footer { margin-left: -6mm; width: 210mm; }
.invoice-template-custom-object { position: absolute; white-space: pre-wrap; overflow: hidden; }
.invoice-template-custom-object img { width: 100%; height: 100%; }
.invoice-document-table tr { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="WordSection1">
${wordHeader}
${wordFooter}
${invoice.outerHTML}
</div>
</body>
</html>`;
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(invoiceId)}.doc`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
