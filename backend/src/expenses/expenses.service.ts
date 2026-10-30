import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { CreateExpenseDto } from './expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.expense.findMany({
      where: { companyId: getCompanyId() },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async create(dto: CreateExpenseDto) {
    const companyId = getCompanyId();
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Le montant de la charge doit être positif.');
    }

    if (
      (dto.method === PaymentMethod.CASH_CDF && dto.currency !== 'CDF') ||
      (dto.method === PaymentMethod.CASH_USD && dto.currency !== 'USD')
    ) {
      throw new BadRequestException(
        'La devise du paiement en espèces doit correspondre à celle de la charge.',
      );
    }

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('La date de la charge est invalide.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const expense = await transaction.expense.create({
        data: {
          companyId,
          category: dto.category.trim(),
          date,
          amount,
          currency: dto.currency,
          method: dto.method,
          description: dto.description?.trim() || null,
        },
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'CABINET_EXPENSE_RECORDED',
          details: {
            expenseId: expense.id,
            category: expense.category,
            amount: amount.toString(),
            currency: expense.currency,
          },
        },
      });

      return expense;
    });
  }
}
