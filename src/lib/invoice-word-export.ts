function safeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "facture";
}

function documentStyles() {
  return Array.from(document.styleSheets)
    .map((stylesheet) => {
      try {
        return Array.from(stylesheet.cssRules, (rule) => rule.cssText).join("\n");
      } catch {
        throw new Error(
          "Les styles du modèle ne sont pas accessibles pour préparer le fichier Word.",
        );
      }
    })
    .join("\n");
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
            reject(new Error("Le code QR de la facture n’a pas pu être converti."));
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
          throw new Error("Le code QR de la facture n’a pas pu être converti.");
        }
        context.scale(3, 3);
        context.drawImage(image, 0, 0, width, height);
        const png = document.createElement("img");
        png.src = canvas.toDataURL("image/png");
        png.alt =
          svg.querySelector("title")?.textContent || "Code QR de la facture";
        png.style.cssText = "display:block;width:100%;height:auto";
        svg.replaceWith(png);
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
  table.style.cssText = "width:188mm;border-collapse:collapse;table-layout:fixed";
  const row = table.insertRow();
  const logoCell = row.insertCell();
  logoCell.style.cssText = "width:78%;padding:0;vertical-align:middle";
  logoCell.append(logo);
  const qrCell = row.insertCell();
  qrCell.setAttribute("align", "right");
  qrCell.style.cssText = "width:22%;padding:0;vertical-align:middle";
  qrCell.append(qr);
  header.replaceChildren(table);
  header.style.cssText =
    "position:relative;width:188mm;height:30mm;margin:0;background:#fff";
  return header;
}

function createWordBottom(invoice: HTMLElement) {
  const bottom = invoice.querySelector<HTMLElement>(".invoice-document-bottom");
  if (!bottom) return null;

  const terms = bottom.querySelector<HTMLElement>(".invoice-payment-terms");
  const approval = bottom.querySelector<HTMLElement>(".invoice-document-approval");
  const table = document.createElement("table");
  table.className = "invoice-word-bottom";
  table.setAttribute("role", "presentation");
  table.border = "0";
  table.cellPadding = "0";
  table.cellSpacing = "0";
  table.style.cssText =
    "width:100%;border-collapse:collapse;table-layout:fixed;margin-top:42mm";
  const row = table.insertRow();
  const termsCell = row.insertCell();
  termsCell.style.cssText = "width:62%;padding:0;vertical-align:top";
  if (terms) termsCell.append(terms);
  const approvalCell = row.insertCell();
  approvalCell.style.cssText = "width:38%;padding:0;vertical-align:top";
  if (approval) approvalCell.append(approval);
  bottom.remove();
  return table;
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
  const wordBottom = createWordBottom(invoice);

  const imagesToEmbed = [invoice, header, footer, wordBottom].filter(
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
<meta name="Generator" content="FACTURA RDC">
<title>Facture ${invoiceId}</title>
<style>
${documentStyles()}
@page WordSection1 {
  size: A4;
  margin: 48mm 11mm 65mm;
  mso-header-margin: 14mm;
  mso-footer-margin: 0mm;
  mso-header: h1;
  ${wordFooter ? "mso-footer: f1;" : ""}
}
div.WordSection1 { page: WordSection1; }
body { background: #fff; }
.WordSection1 .invoice-document {
  box-sizing: border-box;
  display: block !important;
  width: auto !important;
  min-height: 0 !important;
  max-width: none !important;
  margin: 0 !important;
  border: 0 !important;
  padding: 0 !important;
  box-shadow: none !important;
}
.WordSection1 .invoice-document-top {
  position: relative !important;
  top: auto !important;
  right: auto !important;
  left: auto !important;
  z-index: auto !important;
  width: 188mm !important;
  height: 30mm !important;
  margin: 0 !important;
  background: #fff !important;
}
.WordSection1 .invoice-document-top table {
  width: 188mm;
  border-collapse: collapse;
}
.WordSection1 .invoice-document-top .document-letterhead-logo {
  width: 98.5mm;
}
.WordSection1 .invoice-document-top [data-invoice-object],
.WordSection1 .invoice-document-footer {
  transform: none !important;
}
.WordSection1 .invoice-document-heading { margin-top: 0; }
.WordSection1 .invoice-document-accent-rule {
  height: 1.4mm;
  background: linear-gradient(to bottom, #f3b51b 0 45%, #fff 45% 58%, #073b70 58% 100%);
}
.WordSection1 .invoice-document-qr { width: 25mm; }
.WordSection1 .invoice-document-table-wrap { overflow: visible; }
.WordSection1 .invoice-document-table { width: 100%; min-width: 0; font-size: 9pt; }
.WordSection1 .invoice-document-table th {
  background: #073b70 !important;
  color: #fff !important;
}
.WordSection1 .invoice-document-table th,
.WordSection1 .invoice-document-table td { border-color: #164b80; }
.WordSection1 .invoice-document-total {
  width: 100%;
  background: #dceaf8;
}
.WordSection1 .invoice-document-table thead { display: table-header-group; }
.WordSection1 .invoice-document-table tfoot { display: table-footer-group; }
.WordSection1 .invoice-document-table tr,
.WordSection1 .invoice-document-total,
.WordSection1 .invoice-document-bottom,
.WordSection1 .invoice-document-approval,
.WordSection1 .document-signature {
  break-inside: avoid;
  page-break-inside: avoid;
}
.WordSection1 .invoice-document-footer {
  position: relative !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: -11mm !important;
  z-index: auto !important;
  width: 210mm !important;
  height: 60mm !important;
  margin: 0 !important;
  overflow: hidden !important;
  background: transparent !important;
}
.WordSection1 .invoice-document-footer .invoice-document-footer-art {
  position: absolute !important;
  inset: 0 !important;
  width: 210mm !important;
  height: 60mm !important;
}
.WordSection1 .invoice-document-footer .document-footer,
.WordSection1 .invoice-document-footer .invoice-template-footer-text {
  position: relative !important;
  z-index: 1 !important;
  box-sizing: border-box;
  width: 100% !important;
  min-height: 0 !important;
  margin: 0;
  border: 0 !important;
  background: transparent !important;
  padding: 27mm 4mm 2mm !important;
  color: #fff !important;
  font-size: 7pt;
  line-height: 1.45;
  text-align: center;
}
.WordSection1 .invoice-word-bottom {
  width: 100%;
  margin-top: 42mm;
  border-collapse: collapse;
  table-layout: fixed;
}
.WordSection1 .invoice-word-bottom td {
  border: 0;
  vertical-align: top;
}
.WordSection1 .invoice-document-approval { padding-top: 17mm; }
.WordSection1 .invoice-document-approval .document-signature {
  min-height: 20mm;
  margin: 0;
  padding: 0;
}
.WordSection1 .invoice-document .document-signature-image,
.WordSection1 .invoice-document .document-signature-space { height: 14mm; }
</style>
</head>
<body>
<div class="WordSection1">
${wordHeader}
${wordFooter}
${invoice.outerHTML}
${wordBottom?.outerHTML ?? ""}
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
