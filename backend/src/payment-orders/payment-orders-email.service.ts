import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailSettingsService } from '../mail-settings/mail-settings.service';

export type PaymentOrderEmailStatus = 'sent' | 'not_configured' | 'failed';

function pdfEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrap(value: string, width = 78) {
  const words = pdfText(value).split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function makeOrderPdf(order: {
  orderNumber: string;
  date: Date;
  requestingService: string;
  beneficiary: string;
  amount: string;
  currency: string;
  amountInWords: string;
  reason: string;
  companyName: string;
  statusLabel?: string;
}) {
  const date = order.date.toISOString().slice(0, 10).split('-').reverse().join('/');
  const content: string[] = [
    '0.02 0.18 0.36 rg 48 790 499 4 re f',
    '0 0 0 rg',
    `BT /F2 18 Tf 48 756 Td (${pdfEscape(pdfText(order.companyName).slice(0, 58))}) Tj ET`,
    '0.02 0.18 0.36 rg',
    `BT /F2 15 Tf 48 721 Td (ORDRE DE PAIEMENT N. ${pdfEscape(pdfText(order.orderNumber))}) Tj ET`,
    '0 0 0 rg',
    `BT /F1 10 Tf 48 699 Td (Kinshasa, le ${date}     |     STATUT : ${pdfEscape(pdfText(order.statusLabel ?? 'EN ATTENTE D EXAMEN'))}) Tj ET`,
    '0.02 0.18 0.36 RG 48 680 m 547 680 l S',
  ];
  const rows: [string, string][] = [
    ['Date de la demande', date],
    ['Service demandeur', order.requestingService],
    ['Beneficiaire', order.beneficiary],
    ['Montant sollicite', `${order.currency} ${order.amount}`],
    ['Montant en lettres', order.amountInWords],
    ['Motif detaille', order.reason],
  ];
  let y = 654;
  for (const [label, value] of rows) {
    const lines = wrap(value, label === 'Motif detaille' ? 82 : 76);
    content.push(`0.94 0.96 0.98 rg 48 ${y - 7} 499 ${Math.max(28, lines.length * 14 + 14)} re f`);
    content.push(`0.02 0.18 0.36 rg BT /F2 9 Tf 59 ${y} Td (${pdfEscape(pdfText(label).toUpperCase())}) Tj ET`);
    content.push(`0 0 0 rg BT /F1 10 Tf 59 ${y - 15} Td (${pdfEscape(lines[0] ?? '')}) Tj ET`);
    for (let index = 1; index < lines.length; index++) {
      content.push(`BT /F1 10 Tf 59 ${y - 15 - index * 13} Td (${pdfEscape(lines[index])}) Tj ET`);
    }
    y -= Math.max(39, lines.length * 14 + 26);
  }
  const controlTop = Math.max(235, y - 8);
  content.push(`0.02 0.18 0.36 rg BT /F2 10 Tf 48 ${controlTop} Td (CONTROLE AUTOMATIQUE DES FONDS OP) Tj ET`);
  const tableTop = controlTop - 12;
  const columnWidth = 499 / 5;
  const headers = ['SOURCE DES FONDS', 'APPROVISIONNE', 'SOLDE DISPO (1)', 'ENCOURS', 'SOLDE DISPO (2)'];
  headers.forEach((header, index) => {
    const x = 48 + index * columnWidth;
    content.push(`0.02 0.18 0.36 rg ${x} ${tableTop - 31} ${columnWidth} 31 re f`);
    content.push(`1 1 1 rg BT /F2 6 Tf ${x + 4} ${tableTop - 12} Td (${pdfEscape(header)}) Tj ET`);
    content.push(`1 1 1 RG ${x} ${tableTop - 31} m ${x + columnWidth} ${tableTop - 31} l S`);
    content.push(`0.02 0.18 0.36 RG ${x} ${tableTop - 51} m ${x + columnWidth} ${tableTop - 51} l S`);
    content.push(`0.02 0.18 0.36 RG ${x} ${tableTop - 31} m ${x} ${tableTop - 51} l S`);
  });
  content.push(`0.02 0.18 0.36 RG ${547} ${tableTop - 31} m ${547} ${tableTop - 51} l S`);
  y = Math.max(150, tableTop - 76);
  content.push('0.02 0.18 0.36 rg');
  content.push(`BT /F2 10 Tf 48 ${y} Td (VISA DE L ASSOCIE-GERANT) Tj ET`);
  content.push(`0 0 0 RG 48 ${y - 26} m 280 ${y - 26} l S`);
  content.push(`BT /F1 9 Tf 48 ${y - 43} Td (Approbation ou rejet a enregistrer dans la plateforme.) Tj ET`);
  content.push(`BT /F1 9 Tf 48 ${y - 57} Td (Etat de besoin transmis en piece jointe au courriel.) Tj ET`);
  content.push('0.02 0.18 0.36 rg 48 72 499 3 re f');
  content.push(`BT /F1 8 Tf 48 56 Td (Document transmis pour examen. Le fonds ne sera decaisse qu apres approbation.) Tj ET`);
  const stream = content.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'ascii');
}

@Injectable()
export class PaymentOrdersEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailSettingsService,
  ) {}

  async sendSubmissionNotice(
    id: string,
    submittedBy: string,
    attempt = 'initial',
  ): Promise<PaymentOrderEmailStatus> {
    let status: PaymentOrderEmailStatus = 'not_configured';
    let failure: string | null = null;

    try {
      const order = await this.prisma.paymentOrder.findUnique({
        where: { id },
        include: {
          company: { select: { legalName: true, tradeName: true } },
          attachment: { select: { fileName: true, mimeType: true, data: true } },
        },
      });
      if (!order) throw new Error('Ordre de paiement introuvable pour l’envoi e-mail.');
      if (!(await this.mail.isConnected(order.companyId))) {
        status = 'not_configured';
        failure = 'Aucun compte Gmail connecté pour cette société.';
      } else {
        const creator = await this.prisma.user.findUnique({ where: { id: order.createdBy }, select: { name: true } });
        const companyName = order.company.tradeName || order.company.legalName;
        const statusLabel: Record<string, string> = {
          SUBMITTED: 'EN ATTENTE D EXAMEN',
          FINANCE_APPROVED: 'EN ATTENTE DE LA DECISION DE L ASSOCIE-GERANT',
          APPROVED: 'APPROUVE',
          PAID: 'PAYE',
          REJECTED: 'REJETE',
        };
        const currentStatus = statusLabel[order.status] ?? 'A SUIVRE';
        const pdf = makeOrderPdf({
          orderNumber: order.orderNumber,
          date: order.date,
          requestingService: order.requestingService,
          beneficiary: order.beneficiary,
          amount: order.amount.toFixed(2),
          currency: order.currency,
          amountInWords: order.amountInWords,
          reason: order.reason,
          companyName,
          statusLabel: currentStatus,
        });
        const attachments = [{
          filename: `OP-${order.orderNumber.replace(/[^\w.-]/g, '-')}.pdf`,
          contentType: 'application/pdf',
          data: pdf,
        }];
        if (order.attachment) attachments.push({
          filename: order.attachment.fileName.replace(/[\r\n]/g, '_'),
          contentType: order.attachment.mimeType,
          data: Buffer.from(order.attachment.data),
        });
        const amount = `${order.currency} ${order.amount.toFixed(2)}`;
        const requesterName = creator?.name ?? 'l’équipe administrative';
        const text = [
          'Monsieur l’Associé-Gérant,',
          '',
          `Nous vous transmettons l’ordre de paiement ${order.orderNumber} de la société ${companyName} pour examen et suivi.`,
          `Bénéficiaire : ${order.beneficiary}. Montant : ${amount}.`,
          `Statut actuel : ${currentStatus}.`,
          `Motif : ${order.reason}`,
          `Dossier préparé par ${requesterName}. L’OP et l’état de besoin sont joints à ce courriel.`,
          '',
          order.status === 'SUBMITTED' || order.status === 'FINANCE_APPROVED'
            ? 'Nous vous prions de bien vouloir examiner le dossier puis enregistrer votre approbation ou votre rejet dans la plateforme. L’ordre reste en attente de votre décision.'
            : 'Ce message est une copie du dossier pour votre suivi. Le statut affiché correspond à la situation actuelle dans la plateforme.',
          '',
          'Avec nos salutations respectueuses,',
          companyName,
        ].join('\n');
        void attempt;
        await this.mail.send(order.companyId, {
          to: 'ligbakelo@yahoo.fr',
          subject: `${order.status === 'SUBMITTED' || order.status === 'FINANCE_APPROVED' ? 'Pour examen' : 'Pour suivi'} · ${order.orderNumber} · ${companyName}`,
          text,
          senderName: companyName,
          attachments,
        });
        status = 'sent';
      }
    } catch (error) {
      status = 'failed';
      failure = error instanceof Error ? error.message.slice(0, 1000) : 'Erreur e-mail inconnue.';
    }

    const orderRef = await this.prisma.paymentOrder.findUnique({ where: { id }, select: { companyId: true, orderNumber: true } });
    if (orderRef) {
      try {
        await this.prisma.auditLog.create({
          data: {
            companyId: orderRef.companyId,
            userId: submittedBy,
            action: status === 'sent' ? 'PAYMENT_ORDER_EMAIL_SENT' : 'PAYMENT_ORDER_EMAIL_FAILED',
            details: {
              paymentOrderId: id,
              orderNumber: orderRef.orderNumber,
              recipient: 'ligbakelo@yahoo.fr',
              status,
              ...(failure ? { error: failure } : {}),
              ...(status === 'not_configured' ? { reason: failure ?? 'Aucun compte Gmail connecté pour cette société' } : {}),
            },
          },
        });
      } catch {
        // An audit logging outage must not turn a successfully saved OP into an apparent failure.
      }
    }
    return status;
  }

  async resendPendingSubmissionNotices(requestedBy: string) {
    const pending = await this.prisma.paymentOrder.findMany({
      where: { status: { in: ['SUBMITTED', 'FINANCE_APPROVED'] } },
      orderBy: [{ createdAt: 'asc' }],
      take: 500,
      select: { id: true, companyId: true, orderNumber: true, createdAt: true },
    });
    if (!pending.length) {
      return { pending: 0, sent: 0, skippedAlreadySent: 0, failed: 0 };
    }

    const priorSends = await this.prisma.auditLog.findMany({
      where: {
        action: 'PAYMENT_ORDER_EMAIL_SENT',
        companyId: { in: [...new Set(pending.map((order) => order.companyId))] },
        createdAt: { gte: pending[0].createdAt },
      },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: { details: true },
    });
    const alreadySent = new Set<string>();
    for (const row of priorSends) {
      const details = row.details;
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        const orderId = (details as Record<string, unknown>).paymentOrderId;
        if (typeof orderId === 'string') alreadySent.add(orderId);
      }
    }
    const toSend = pending.filter((order) => !alreadySent.has(order.id));
    let sent = 0;
    let failed = 0;
    const attempt = `resend-${Date.now()}`;
    for (const [index, order] of toSend.entries()) {
      const result = await this.sendSubmissionNotice(
        order.id,
        requestedBy,
        `${attempt}-${index}`,
      );
      if (result === 'sent') sent++;
      else failed++;
    }
    return {
      pending: pending.length,
      sent,
      skippedAlreadySent: pending.length - toSend.length,
      failed,
      remaining: pending.length > 500,
    };
  }
}
