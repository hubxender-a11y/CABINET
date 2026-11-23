import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentOrderStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  assertCashAvailable,
  assertPaymentOrderFundingAvailable,
  createCashMovement,
  endOfDay,
  ensureCashAccount,
  lockCashAccount,
  getPaymentOrderFundingBalance,
  getPaymentOrderProvisionedTotal,
  getCashBalance,
} from '../cash-vouchers/cash-ledger';
import { amountInWords } from './amount-in-words';
import type {
  CreatePaymentOrderDto,
  RejectPaymentOrderDto,
} from './payment-orders.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentOrdersEmailService } from './payment-orders-email.service';

@Injectable()
export class PaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly orderEmail: PaymentOrdersEmailService,
  ) {}

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

  listAcrossCompanies() {
    return this.prisma.paymentOrder.findMany({
      include: {
        company: { select: { id: true, legalName: true, tradeName: true, logoUrl: true } },
        attachment: { select: { id: true, fileName: true, mimeType: true, size: true } },
        cashVoucher: { select: { id: true, voucherNumber: true, date: true, status: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async managerVisaAcrossCompanies(id: string, userId: string, name: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!order) throw new NotFoundException('Ordre de paiement introuvable.');
    return this.managerVisa(id, order.companyId, userId, name);
  }

  async rejectAcrossCompanies(
    id: string,
    dto: RejectPaymentOrderDto,
    userId: string,
    name: string,
  ) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!order) throw new NotFoundException('Ordre de paiement introuvable.');
    return this.reject(id, dto, order.companyId, userId, name);
  }

  async attachmentAcrossCompanies(id: string) {
    const attachment = await this.prisma.paymentOrderAttachment.findUnique({
      where: { paymentOrderId: id },
    });
    if (!attachment) throw new NotFoundException('État de besoin introuvable.');
    return attachment;
  }

  async create(dto: CreatePaymentOrderDto, companyId: string, userId: string) {
    const attachment = this.parseAttachment(dto);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0))
      throw new BadRequestException(
        'Le montant demandé doit être supérieur à zéro.',
      );
    if (
      dto.currency === 'CDF' &&
      !amount.isInteger()
    ) {
      throw new BadRequestException(
        'Les montants en CDF doivent être des nombres entiers.',
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

    const createdOrder = await this.prisma.$transaction(async (transaction) => {
      const cashAccount = await ensureCashAccount(transaction, companyId, dto.currency);
      await lockCashAccount(transaction, cashAccount.id);
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`payment-order:${companyId}`}), CAST(${year} AS INTEGER))
      `;
      const budgetOrders = await transaction.paymentOrder.findMany({
        where: {
          companyId,
          currency: dto.currency,
          status: { not: PaymentOrderStatus.REJECTED },
        },
        select: { amount: true, status: true },
      });
      const outstanding = budgetOrders
        .filter(
          (order) =>
            order.status === PaymentOrderStatus.SUBMITTED ||
            order.status === PaymentOrderStatus.FINANCE_APPROVED ||
            order.status === PaymentOrderStatus.APPROVED,
        )
        .reduce((sum, order) => sum.add(order.amount), new Prisma.Decimal(0));
      const fundingAvailable = await getPaymentOrderFundingBalance(
        transaction,
        companyId,
        cashAccount.id,
        endOfDay(parsedDate),
      );
      const physicalCash = await getCashBalance(
        transaction,
        companyId,
        cashAccount.id,
        endOfDay(parsedDate),
      );
      const availableBefore = fundingAvailable.lt(physicalCash)
        ? fundingAvailable
        : physicalCash;
      const initialForecast = await getPaymentOrderProvisionedTotal(
        transaction,
        companyId,
        cashAccount.id,
        endOfDay(parsedDate),
      );
      const availableAfter = availableBefore.sub(outstanding).sub(amount);
      if (availableAfter.lt(0)) {
        throw new BadRequestException(
          `Approvisionnement OP insuffisant : solde disponible ${availableBefore.toFixed(2)}, encours ${outstanding.toFixed(2)}, demande ${amount.toFixed(2)}. Enregistrez un approvisionnement de l’Associé-Gérant dans le module Caisse.`,
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
          accountingAllocation: '',
          budgetAccount: 'Fonds remis par l’Associé-Gérant',
          initialForecast,
          availableBefore,
          outstanding,
          availableAfter,
        },
      });
      await transaction.paymentOrderAttachment.create({
        data: { companyId, paymentOrderId: order.id, ...attachment },
      });
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
      const requester = await transaction.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await this.notifications.notifyRoles(
        transaction,
        companyId,
        [UserRole.COMPANY_ADMIN, UserRole.MANAGING_PARTNER, UserRole.PLATFORM_MANAGING_PARTNER],
        `OP à examiner · ${orderNumber}`,
        `${dto.beneficiary.trim()} · ${amount.toString()} ${dto.currency}. Demande préparée par ${requester?.name ?? 'un utilisateur'}; état de besoin annexé. Examinez et visez cette OP.`,
        userId,
      );
      return transaction.paymentOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          attachment: {
            select: { id: true, fileName: true, mimeType: true, size: true },
          },
        },
      });
    });
    const emailNotification = await this.orderEmail.sendSubmissionNotice(
      createdOrder.id,
      userId,
    );
    return { ...createdOrder, emailNotification };
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
      await transaction.notification.create({
        data: {
          companyId,
          userId: order.createdBy,
          title: `OP rejetée · ${order.orderNumber}`,
          message: `L’Associé-Gérant ${name} a rejeté votre OP. Motif : ${reason}`,
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
      const attachment = await transaction.paymentOrderAttachment.findFirst({
        where: { paymentOrderId: id, companyId },
        select: { id: true },
      });
      if (!attachment) {
        throw new ConflictException(
          'Joignez l’état de besoin avant de valider cette OP.',
        );
      }
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
      await assertPaymentOrderFundingAvailable(
        transaction,
        companyId,
        cashAccount.id,
        header.amount,
        endOfDay(date),
      );
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
      const attachment = await transaction.paymentOrderAttachment.findFirst({
        where: { paymentOrderId: id, companyId },
        select: { id: true },
      });
      if (!attachment) {
        throw new ConflictException(
          'Joignez l’état de besoin avant de viser cette OP.',
        );
      }
      if (order.createdBy === userId)
        throw new ConflictException(
          'Le demandeur ne peut pas viser sa propre OP.',
        );
      const expectedStatuses: PaymentOrderStatus[] =
        visa === 'FINANCE'
          ? [PaymentOrderStatus.SUBMITTED]
          : [
              PaymentOrderStatus.SUBMITTED,
              PaymentOrderStatus.FINANCE_APPROVED,
            ];
      if (!expectedStatuses.includes(order.status)) {
        throw new ConflictException(
          visa === 'FINANCE'
            ? 'Cette OP n’attend plus le visa des Finances.'
            : 'Cette OP n’attend plus l’examen de l’Associé-Gérant.',
        );
      }
      if (
        visa === 'MANAGER' &&
        order.status === PaymentOrderStatus.FINANCE_APPROVED &&
        order.financeVisaBy === userId
      ) {
        throw new ConflictException(
          'Le visa de l’Associé-Gérant doit être donné par une autre personne que celui des Finances.',
        );
      }
      if (visa === 'FINANCE') {
        const result = await transaction.paymentOrder.updateMany({
          where: { id, companyId, status: { in: expectedStatuses } },
          data: {
            status: PaymentOrderStatus.FINANCE_APPROVED,
            financeVisaName: name,
            financeVisaBy: userId,
            financeVisaAt: new Date(),
          },
        });
        if (result.count !== 1)
          throw new ConflictException(
            'Cette OP a été traitée entre-temps. Actualisez le registre.',
          );
      }
      let cashVoucherNumber: string | undefined;
      if (visa === 'MANAGER') {
        const approvalDate = new Date();
        const year = approvalDate.getUTCFullYear();
        const cashAccount = await ensureCashAccount(
          transaction,
          companyId,
          order.currency as 'CDF' | 'USD',
        );
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`cash-voucher:${companyId}`}), CAST(${year} AS INTEGER))
        `;
        const vouchers = await transaction.cashVoucher.findMany({
          where: { companyId, voucherNumber: { startsWith: `BSC/${year}/` } },
          select: { voucherNumber: true },
        });
        const lastSequence = vouchers.reduce((maximum, voucher) => {
          const match = new RegExp(`^BSC/${year}/(\\d+)$`).exec(voucher.voucherNumber);
          return Math.max(maximum, match ? Number(match[1]) : 0);
        }, 0);
        cashVoucherNumber = `BSC/${year}/${String(lastSequence + 1).padStart(4, '0')}`;
        const voucher = await transaction.cashVoucher.create({
          data: {
            companyId,
            voucherNumber: cashVoucherNumber,
            date: approvalDate,
            beneficiary: order.beneficiary,
            category: `Règlement de l’OP ${order.orderNumber}`,
            reason: order.reason,
            amount: order.amount,
            currency: order.currency,
            method: order.currency === 'CDF' ? 'CASH_CDF' : 'CASH_USD',
            cashAccountId: cashAccount.id,
            accountCode: cashAccount.code,
            reference: order.orderNumber,
            status: 'READY_FOR_PAYMENT',
            managerApprovalName: name,
            managerApprovalBy: userId,
            managerApprovedAt: approvalDate,
          },
        });
        const linked = await transaction.paymentOrder.updateMany({
          where: {
            id,
            companyId,
            status: { in: expectedStatuses },
            cashVoucherId: null,
          },
          data: {
            status: PaymentOrderStatus.APPROVED,
            managerVisaName: name,
            managerVisaBy: userId,
            managerVisaAt: approvalDate,
            cashVoucherId: voucher.id,
          },
        });
        if (linked.count !== 1)
          throw new ConflictException(
            'Cette OP a été traitée entre-temps. Actualisez le registre.',
          );
      }
      const updated = await transaction.paymentOrder.findUniqueOrThrow({
        where: { id },
        include: {
          attachment: { select: { id: true, fileName: true, mimeType: true, size: true } },
          cashVoucher: { select: { id: true, voucherNumber: true, date: true, status: true } },
        },
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
      if (visa === 'MANAGER') {
        await transaction.notification.create({
          data: {
            companyId,
            userId: order.createdBy,
            title: `OP approuvée · ${order.orderNumber}`,
            message: `L’Associé-Gérant ${name} a approuvé et signé votre OP. Le bon ${cashVoucherNumber} est créé dans le registre de caisse et prêt au paiement.`,
          },
        });
        await this.notifications.notifyRoles(
          transaction,
          companyId,
          [UserRole.COMPANY_ADMIN, UserRole.CASHIER, UserRole.SECRETARY],
          `OP approuvée · ${cashVoucherNumber}`,
          `${order.orderNumber} · ${order.beneficiary} · ${order.amount.toString()} ${order.currency}. Le bon est approuvé par ${name} et prêt au paiement.`,
          userId,
        );
      }
      return updated;
    });
  }
}
