import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  assertCashAvailable,
  createCashMovement,
  endOfDay,
  ensureCashAccount,
  lockCashAccount,
} from '../cash-vouchers/cash-ledger';
import { amountInWords } from './amount-in-words';
import type {
  CreatePaymentOrderDto,
  RejectPaymentOrderDto,
} from './payment-orders.dto';

@Injectable()
export class PaymentOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.paymentOrder.findMany({
      where: { companyId },
      include: {
        attachment: {
          select: { id: true, fileName: true, mimeType: true, size: true },
        },
        cashVoucher: {
          select: { id: true, voucherNumber: true, date: true, status: true },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async create(dto: CreatePaymentOrderDto, companyId: string, userId: string) {
    const amount = new Prisma.Decimal(dto.amount);
    const initialForecast = new Prisma.Decimal(dto.initialForecast);
    if (amount.lte(0))
      throw new BadRequestException(
        'Le montant demandé doit être supérieur à zéro.',
      );
    if (
      dto.currency === 'CDF' &&
      [amount, initialForecast].some((value) => !value.isInteger())
    ) {
      throw new BadRequestException(
        'Les montants en CDF doivent être des nombres entiers.',
      );
    }
    if (initialForecast.lt(0)) {
      throw new BadRequestException(
        'La prévision initiale ne peut pas être négative.',
      );
    }
    const parsedDate = new Date(dto.date);
    if (Number.isNaN(parsedDate.getTime()))
      throw new BadRequestException('La date de l’OP est invalide.');
    const now = new Date();
    if (parsedDate.getTime() > now.getTime() + 86_400_000) {
      throw new BadRequestException('La date de l’OP ne peut pas être future.');
    }
    const year = parsedDate.getUTCFullYear();
    const words = amountInWords(amount, dto.currency);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`payment-order:${companyId}`}), CAST(${year} AS INTEGER))
      `;
      const budgetOrders = await transaction.paymentOrder.findMany({
        where: {
          companyId,
          budgetAccount: dto.budgetAccount.trim(),
          currency: dto.currency,
          date: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
          status: { not: PaymentOrderStatus.REJECTED },
        },
        select: { initialForecast: true, amount: true, status: true },
      });
      if (
        budgetOrders.some(
          (order) => !order.initialForecast.equals(initialForecast),
        )
      ) {
        throw new ConflictException(
          'La prévision initiale doit rester identique pour un même compte budgétaire, une même devise et un même exercice.',
        );
      }
      const paid = budgetOrders
        .filter((order) => order.status === PaymentOrderStatus.PAID)
        .reduce((sum, order) => sum.add(order.amount), new Prisma.Decimal(0));
      const outstanding = budgetOrders
        .filter(
          (order) =>
            order.status === PaymentOrderStatus.SUBMITTED ||
            order.status === PaymentOrderStatus.FINANCE_APPROVED ||
            order.status === PaymentOrderStatus.APPROVED,
        )
        .reduce((sum, order) => sum.add(order.amount), new Prisma.Decimal(0));
      const availableBefore = initialForecast.sub(paid);
      const availableAfter = availableBefore.sub(outstanding).sub(amount);
      if (availableAfter.lt(0)) {
        throw new BadRequestException(
          `Budget insuffisant : disponible avant engagement ${availableBefore.toFixed(2)}, engagements en attente ${outstanding.toFixed(2)}, demande ${amount.toFixed(2)}.`,
        );
      }
      const existing = await transaction.paymentOrder.findMany({
        where: { companyId, orderNumber: { startsWith: `OP/${year}/` } },
        select: { orderNumber: true },
      });
      const sequence = existing.reduce((max, row) => {
        const match = new RegExp(`^OP/${year}/(\\d+)$`).exec(row.orderNumber);
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      const orderNumber = `OP/${year}/${String(sequence + 1).padStart(4, '0')}`;
      const order = await transaction.paymentOrder.create({
        data: {
          companyId,
          createdBy: userId,
          orderNumber,
          date: parsedDate,
          requestingService: dto.requestingService.trim(),
          amount,
          amountInWords: words,
          currency: dto.currency,
          reason: dto.reason.trim(),
          beneficiary: dto.beneficiary.trim(),
          accountingAllocation: dto.accountingAllocation.trim(),
          budgetAccount: dto.budgetAccount.trim(),
          initialForecast,
          availableBefore,
          outstanding,
          availableAfter,
        },
      });
      if (
        dto.attachmentBase64 ||
        dto.attachmentName ||
        dto.attachmentMimeType
      ) {
        const attachment = this.parseAttachment(dto);
        await transaction.paymentOrderAttachment.create({
          data: { companyId, paymentOrderId: order.id, ...attachment },
        });
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'PAYMENT_ORDER_SUBMITTED',
          details: {
            paymentOrderId: order.id,
            orderNumber,
            amount: amount.toString(),
            currency: dto.currency,
          },
        },
      });
      return transaction.paymentOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          attachment: {
            select: { id: true, fileName: true, mimeType: true, size: true },
          },
        },
      });
    });
  }

  async financeVisa(
    id: string,
    companyId: string,
    userId: string,
    name: string,
  ) {
    return this.transition(id, companyId, userId, name, 'FINANCE');
  }

  async managerVisa(
    id: string,
    companyId: string,
    userId: string,
    name: string,
  ) {
    return this.transition(id, companyId, userId, name, 'MANAGER');
  }

  async reject(
    id: string,
    dto: RejectPaymentOrderDto,
    companyId: string,
    userId: string,
    name: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 4)
      throw new BadRequestException('Indiquez le motif du rejet.');
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.paymentOrder.findFirst({
        where: { id, companyId },
      });
      if (!order) throw new NotFoundException('Ordre de paiement introuvable.');
      if (
        order.status === PaymentOrderStatus.APPROVED ||
        order.status === PaymentOrderStatus.REJECTED
      ) {
        throw new ConflictException('Cette OP est déjà clôturée.');
      }
      if (order.createdBy === userId)
        throw new ConflictException(
          'Le demandeur ne peut pas rejeter sa propre OP.',
        );
      const result = await transaction.paymentOrder.updateMany({
        where: {
          id,
          companyId,
          status: {
            in: [
              PaymentOrderStatus.SUBMITTED,
              PaymentOrderStatus.FINANCE_APPROVED,
            ],
          },
        },
        data: {
          status: PaymentOrderStatus.REJECTED,
          rejectionReason: reason,
          rejectedBy: name,
          rejectedAt: new Date(),
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Cette OP a été traitée entre-temps. Actualisez le registre.',
        );
      const updated = await transaction.paymentOrder.findUniqueOrThrow({
        where: { id },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'PAYMENT_ORDER_REJECTED',
          details: {
            paymentOrderId: id,
            orderNumber: order.orderNumber,
            reason,
          },
        },
      });
      return updated;
    });
  }

  async attachment(id: string, companyId: string) {
    const attachment = await this.prisma.paymentOrderAttachment.findFirst({
      where: { paymentOrderId: id, companyId },
    });
    if (!attachment) throw new NotFoundException('Pièce jointe introuvable.');
    return attachment;
  }

  async pay(id: string, companyId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const header = await transaction.paymentOrder.findFirst({
        where: { id, companyId },
      });
      if (!header)
        throw new NotFoundException('Ordre de paiement introuvable.');
      if (header.status !== PaymentOrderStatus.APPROVED) {
        throw new ConflictException('Seule une OP approuvée peut être payée.');
      }
      const date = new Date();
      const year = date.getUTCFullYear();
      const cashAccount = await ensureCashAccount(
        transaction,
        companyId,
        header.currency as 'CDF' | 'USD',
      );
      await lockCashAccount(transaction, cashAccount.id);
      await assertCashAvailable(
        transaction,
        companyId,
        cashAccount.id,
        header.amount,
        endOfDay(date),
      );
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`cash-voucher:${companyId}`}), CAST(${year} AS INTEGER))
      `;
      const vouchers = await transaction.cashVoucher.findMany({
        where: { companyId, voucherNumber: { startsWith: `BSC/${year}/` } },
        select: { voucherNumber: true },
      });
      const lastSequence = vouchers.reduce((maximum, voucher) => {
        const match = new RegExp(`^BSC/${year}/(\\d+)$`).exec(
          voucher.voucherNumber,
        );
        return Math.max(maximum, match ? Number(match[1]) : 0);
      }, 0);
      const voucherNumber = `BSC/${year}/${String(lastSequence + 1).padStart(4, '0')}`;
      const voucher = await transaction.cashVoucher.create({
        data: {
          companyId,
          voucherNumber,
          date,
          beneficiary: header.beneficiary,
          category: `Règlement de l’OP ${header.orderNumber}`,
          reason: header.reason,
          amount: header.amount,
          currency: header.currency,
          method: header.currency === 'CDF' ? 'CASH_CDF' : 'CASH_USD',
          cashAccountId: cashAccount.id,
          accountCode: cashAccount.code,
          reference: header.orderNumber,
        },
      });
      const updated = await transaction.paymentOrder.updateMany({
        where: {
          id,
          companyId,
          status: PaymentOrderStatus.APPROVED,
          cashVoucherId: null,
        },
        data: {
          status: PaymentOrderStatus.PAID,
          paidAt: date,
          paidBy: userId,
          cashVoucherId: voucher.id,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Cette OP a déjà été payée ou modifiée. Actualisez le registre.',
        );
      await createCashMovement(transaction, {
        companyId,
        cashAccountId: cashAccount.id,
        date,
        direction: 'OUT',
        amount: header.amount,
        sourceType: 'CASH_VOUCHER',
        sourceId: voucher.id,
        description: `${voucher.category} · ${header.beneficiary} · ${header.reason}`,
        reference: voucherNumber,
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'PAYMENT_ORDER_PAID',
          details: {
            paymentOrderId: id,
            orderNumber: header.orderNumber,
            voucherId: voucher.id,
            voucherNumber,
            amount: header.amount.toString(),
            currency: header.currency,
          },
        },
      });
      return transaction.paymentOrder.findUniqueOrThrow({
        where: { id },
        include: {
          attachment: {
            select: { id: true, fileName: true, mimeType: true, size: true },
          },
          cashVoucher: {
            select: { id: true, voucherNumber: true, date: true, status: true },
          },
        },
      });
    });
  }

  private parseAttachment(dto: CreatePaymentOrderDto) {
    if (
      !dto.attachmentBase64 ||
      !dto.attachmentName ||
      !dto.attachmentMimeType
    ) {
      throw new BadRequestException(
        'Le nom, le type et le contenu de la pièce jointe sont requis.',
      );
    }
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    if (!allowed.has(dto.attachmentMimeType))
      throw new BadRequestException(
        'Format de pièce jointe accepté : PDF, JPG, PNG, DOCX ou XLSX.',
      );
    const encoded = dto.attachmentBase64.replace(/^data:[^;]+;base64,/, '');
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    )
      throw new BadRequestException('Le fichier joint est invalide.');
    const data = Buffer.from(encoded, 'base64');
    if (data.length === 0 || data.length > 8 * 1024 * 1024)
      throw new BadRequestException(
        'La pièce jointe doit faire moins de 8 Mo.',
      );
    const signature = data.subarray(0, 8).toString('hex');
    const validSignature =
      dto.attachmentMimeType === 'application/pdf'
        ? data.subarray(0, 5).toString() === '%PDF-'
        : dto.attachmentMimeType === 'image/png'
          ? signature.startsWith('89504e470d0a1a0a')
          : dto.attachmentMimeType === 'image/jpeg'
            ? signature.startsWith('ffd8ff')
            : signature.startsWith('504b0304');
    if (!validSignature)
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas à son format déclaré.',
      );
    return {
      fileName: dto.attachmentName.replace(/[\\/\r\n]/g, '_').slice(0, 180),
      mimeType: dto.attachmentMimeType,
      size: data.length,
      data,
    };
  }

  private async transition(
    id: string,
    companyId: string,
    userId: string,
    name: string,
    visa: 'FINANCE' | 'MANAGER',
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.paymentOrder.findFirst({
        where: { id, companyId },
      });
      if (!order) throw new NotFoundException('Ordre de paiement introuvable.');
      if (order.createdBy === userId)
        throw new ConflictException(
          'Le demandeur ne peut pas viser sa propre OP.',
        );
      const expected =
        visa === 'FINANCE'
          ? PaymentOrderStatus.SUBMITTED
          : PaymentOrderStatus.FINANCE_APPROVED;
      if (order.status !== expected) {
        throw new ConflictException(
          visa === 'FINANCE'
            ? 'Cette OP n’attend plus le visa des Finances.'
            : 'Le visa des Finances doit être enregistré avant celui de l’Associé-Gérant.',
        );
      }
      if (visa === 'MANAGER' && order.financeVisaBy === userId) {
        throw new ConflictException(
          'Le visa de l’Associé-Gérant doit être donné par une autre personne que celui des Finances.',
        );
      }
      const result = await transaction.paymentOrder.updateMany({
        where: { id, companyId, status: expected },
        data:
          visa === 'FINANCE'
            ? {
                status: PaymentOrderStatus.FINANCE_APPROVED,
                financeVisaName: name,
                financeVisaBy: userId,
                financeVisaAt: new Date(),
              }
            : {
                status: PaymentOrderStatus.APPROVED,
                managerVisaName: name,
                managerVisaBy: userId,
                managerVisaAt: new Date(),
              },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Cette OP a été traitée entre-temps. Actualisez le registre.',
        );
      const updated = await transaction.paymentOrder.findUniqueOrThrow({
        where: { id },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action:
            visa === 'FINANCE'
              ? 'PAYMENT_ORDER_FINANCE_VISA'
              : 'PAYMENT_ORDER_MANAGER_VISA',
          details: { paymentOrderId: id, orderNumber: order.orderNumber },
        },
      });
      return updated;
    });
  }
}
