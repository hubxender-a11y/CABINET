import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CancelCashVoucherDto,
  CreateCashVoucherDto,
} from './cash-vouchers.dto';

@Injectable()
export class CashVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.cashVoucher.findMany({
      where: { companyId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async create(dto: CreateCashVoucherDto, companyId: string, userId: string) {
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException(
        'Le montant du bon doit être supérieur à zéro.',
      );
    }
    if (
      (dto.method === PaymentMethod.CASH_CDF && dto.currency !== 'CDF') ||
      (dto.method === PaymentMethod.CASH_USD && dto.currency !== 'USD')
    ) {
      throw new BadRequestException(
        'La devise de la caisse doit correspondre à celle du bon.',
      );
    }

    const date = new Date(`${dto.date}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('La date du bon est invalide.');
    }
    const year = Number(dto.date.slice(0, 4));

    return this.prisma.$transaction(async (transaction) => {
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
          beneficiary: dto.beneficiary.trim(),
          category: dto.category.trim(),
          reason: dto.reason.trim(),
          amount,
          currency: dto.currency,
          method: dto.method,
          accountCode: dto.accountCode?.trim() || null,
          reference: dto.reference?.trim() || null,
        },
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_ISSUED',
          details: {
            voucherId: voucher.id,
            voucherNumber,
            beneficiary: voucher.beneficiary,
            amount: amount.toString(),
            currency: voucher.currency,
          },
        },
      });

      return voucher;
    });
  }

  async cancel(
    id: string,
    dto: CancelCashVoucherDto,
    companyId: string,
    userId: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 4) {
      throw new BadRequestException(
        'Précisez le motif d’annulation (au moins 4 caractères).',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const voucher = await transaction.cashVoucher.findFirst({
        where: { id, companyId },
      });
      if (!voucher) throw new NotFoundException('Bon de sortie introuvable.');
      if (voucher.status === 'CANCELLED') {
        throw new ConflictException('Ce bon a déjà été annulé.');
      }

      const cancellation = await transaction.cashVoucher.updateMany({
        where: { id, companyId, status: 'ISSUED' },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
      });
      if (cancellation.count !== 1) {
        throw new ConflictException('Ce bon a déjà été annulé.');
      }
      const cancelled = await transaction.cashVoucher.findUniqueOrThrow({
        where: { id },
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_CANCELLED',
          details: {
            voucherId: voucher.id,
            voucherNumber: voucher.voucherNumber,
            reason,
          },
        },
      });

      return cancelled;
    });
  }
}
