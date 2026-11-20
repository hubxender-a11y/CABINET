import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { CreatePlatformAdminDto, CreatePlatformUserDto } from './platform-admin.dto';

const trackedCompanyCounts = {
  memberships: true,
  customers: true,
  invoices: true,
  payments: true,
  expenses: true,
  paymentOrders: true,
  cashVouchers: true,
  archiveDocuments: true,
  auditLogs: true,
} as const;

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreatePlatformUserDto, actorId: string) {
    if (dto.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new BadRequestException(
        'Utilisez le formulaire dédié pour créer un super-admin.',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const passwordHash = dto.password ? await hash(dto.password, 12) : null;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const company = await transaction.company.findUnique({
          where: { id: dto.companyId },
          select: { id: true, legalName: true, tradeName: true, isActive: true },
        });
        if (!company) throw new NotFoundException('Entreprise introuvable.');
        if (!company.isActive) {
          throw new BadRequestException('Réactivez cette entreprise avant d’y ajouter un utilisateur.');
        }

        const existing = await transaction.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, isActive: true, isPlatformAdmin: true, createdAt: true },
        });
        let user: { id: string; email: string; name: string; isActive: boolean; createdAt: Date };

        if (existing) {
          if (!existing.isActive) {
            throw new BadRequestException('Réactivez ce compte avant de lui attribuer un nouvel accès.');
          }
          if (existing.isPlatformAdmin) {
            throw new ConflictException('Ce compte est super-admin. Son accès global ne peut pas être remplacé par un rôle d’entreprise.');
          }
          const membership = await transaction.companyMembership.findUnique({
            where: { userId_companyId: { userId: existing.id, companyId: company.id } },
            select: { id: true },
          });
          if (membership) {
            throw new ConflictException('Ce compte a déjà un accès à cette entreprise.');
          }
          await transaction.companyMembership.create({
            data: { userId: existing.id, companyId: company.id, role: dto.role },
          });
          user = existing;
        } else {
          if (!dto.name?.trim()) {
            throw new BadRequestException('Le nom complet est requis pour créer un nouveau compte.');
          }
          if (!passwordHash) {
            throw new BadRequestException('Un mot de passe provisoire d’au moins 14 caractères est requis pour créer un compte.');
          }
          user = await transaction.user.create({
            data: {
              email,
              name: dto.name.trim(),
              passwordHash,
              memberships: { create: { companyId: company.id, role: dto.role } },
            },
            select: { id: true, email: true, name: true, isActive: true, createdAt: true },
          });
        }

        await transaction.auditLog.create({
          data: {
            companyId: company.id,
            userId: actorId,
            action: existing ? 'PLATFORM_COMPANY_MEMBER_ADDED' : 'PLATFORM_COMPANY_MEMBER_CREATED',
            details: { userId: user.id, email, role: dto.role },
          },
        });

        return {
          ...user,
          role: dto.role,
          company: { id: company.id, name: company.tradeName || company.legalName, isActive: company.isActive },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Un accès existe déjà pour cette adresse dans cette entreprise.');
      }
      throw error;
    }
  }

  async createAdmin(dto: CreatePlatformAdminDto, actorId: string) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = dto.password ? await hash(dto.password, 12) : null;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          WITH advisory_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtext('platform-admin-roster'), 0)
          )
          SELECT 1 FROM advisory_lock
        `;
        const existing = await transaction.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, isActive: true, isPlatformAdmin: true, createdAt: true },
        });
        let admin: { id: string; email: string; name: string; isActive: boolean; createdAt: Date };
        let action: string;

        if (existing) {
          if (!existing.isActive) {
            throw new BadRequestException('Réactivez ce compte avant de lui attribuer le rôle super-admin.');
          }
          if (existing.isPlatformAdmin) {
            throw new ConflictException('Ce compte est déjà super-admin de la plateforme.');
          }
          admin = await transaction.user.update({
            where: { id: existing.id },
            data: { isPlatformAdmin: true },
            select: { id: true, email: true, name: true, isActive: true, createdAt: true },
          });
          action = 'PLATFORM_ADMIN_GRANTED';
        } else {
          if (!dto.name?.trim()) {
            throw new BadRequestException('Le nom complet est requis pour créer un nouveau super-admin.');
          }
          if (!passwordHash) {
            throw new BadRequestException('Un mot de passe provisoire d’au moins 14 caractères est requis pour créer le super-admin.');
          }
          admin = await transaction.user.create({
            data: {
              email,
              name: dto.name.trim(),
              passwordHash,
              isPlatformAdmin: true,
            },
            select: { id: true, email: true, name: true, isActive: true, createdAt: true },
          });
          action = 'PLATFORM_ADMIN_CREATED';
        }

        await transaction.auditLog.create({
          data: {
            companyId: getCompanyId(),
            userId: actorId,
            action,
            details: { userId: admin.id, email },
          },
        });
        return admin;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cette adresse e-mail possède déjà un compte.');
      }
      throw error;
    }
  }

  async activities(pageValue?: string, pageSizeValue?: string, companyId?: string) {
    const parsedPage = Number.parseInt(pageValue ?? '1', 10);
    const parsedPageSize = Number.parseInt(pageSizeValue ?? '10', 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const pageSize = Number.isFinite(parsedPageSize)
      ? Math.min(50, Math.max(5, parsedPageSize))
      : 10;
    const where = companyId ? { companyId } : undefined;
    const [totalCount, events] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          company: { select: { id: true, legalName: true, tradeName: true } },
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    return {
      items: events.map((event) => ({
        ...event,
        company: {
          id: event.company.id,
          name: event.company.tradeName || event.company.legalName,
        },
      })),
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  async users(companyId?: string) {
    const memberships = await this.prisma.companyMembership.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: [{ company: { legalName: 'asc' } }, { user: { name: 'asc' } }],
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        company: { select: { id: true, legalName: true, tradeName: true, isActive: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            isPlatformAdmin: true,
            createdAt: true,
          },
        },
      },
    });
    return memberships.map((membership) => ({
      ...membership.user,
      membershipId: membership.id,
      role: membership.role,
      isActive: membership.isActive && membership.user.isActive,
      joinedAt: membership.createdAt,
      company: {
        id: membership.company.id,
        name: membership.company.tradeName || membership.company.legalName,
        isActive: membership.company.isActive,
      },
    }));
  }

  async overview() {
    const kinshasaDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kinshasa',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const kinshasaDate = (type: string) =>
      kinshasaDateParts.find((part) => part.type === type)?.value ?? '00';
    const today = new Date(
      `${kinshasaDate('year')}-${kinshasaDate('month')}-${kinshasaDate('day')}T00:00:00+01:00`,
    );

    const [
      companies,
      invoiceTotals,
      paymentTotals,
      orderStatuses,
      activityTodayByCompany,
      userCount,
    ] = await Promise.all([
      this.prisma.company.findMany({
        orderBy: [{ tradeName: 'asc' }, { legalName: 'asc' }],
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          email: true,
          city: true,
          isActive: true,
          currencyCode: true,
          createdAt: true,
          subscription: {
            select: { plan: true, status: true, endAt: true },
          },
          _count: { select: trackedCompanyCounts },
        },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId', 'currency'],
        _sum: { totalAmount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['companyId', 'currency'],
        where: { status: 'RECEIVED' },
        _sum: { amount: true },
      }),
      this.prisma.paymentOrder.groupBy({
        by: ['companyId', 'status'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['companyId'],
        where: { createdAt: { gte: today } },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
    ]);

    const invoicesByCompany = new Map<string, typeof invoiceTotals>();
    for (const row of invoiceTotals) {
      const rows = invoicesByCompany.get(row.companyId) ?? [];
      rows.push(row);
      invoicesByCompany.set(row.companyId, rows);
    }

    const paymentsByCompany = new Map<string, typeof paymentTotals>();
    for (const row of paymentTotals) {
      const rows = paymentsByCompany.get(row.companyId) ?? [];
      rows.push(row);
      paymentsByCompany.set(row.companyId, rows);
    }

    const ordersByCompany = new Map<string, typeof orderStatuses>();
    for (const row of orderStatuses) {
      const rows = ordersByCompany.get(row.companyId) ?? [];
      rows.push(row);
      ordersByCompany.set(row.companyId, rows);
    }

    const activityByCompany = new Map(
      activityTodayByCompany.map((row) => [row.companyId, row._count._all]),
    );

    const companyRows = companies.map((company) => ({
      id: company.id,
      name: company.tradeName || company.legalName,
      legalName: company.legalName,
      logoUrl: company.logoUrl,
      primaryColor: company.primaryColor,
      accentColor: company.accentColor,
      email: company.email,
      city: company.city,
      isActive: company.isActive,
      currencyCode: company.currencyCode,
      createdAt: company.createdAt,
      subscription: company.subscription,
      counts: {
        users: company._count.memberships,
        activityToday: activityByCompany.get(company.id) ?? 0,
        clients: company._count.customers,
        invoices: company._count.invoices,
        payments: company._count.payments,
        expenses: company._count.expenses,
        paymentOrders: company._count.paymentOrders,
        pendingPaymentOrders: (ordersByCompany.get(company.id) ?? [])
          .filter(
            (row) =>
              row.status === 'SUBMITTED' || row.status === 'FINANCE_APPROVED',
          )
          .reduce((sum, row) => sum + row._count._all, 0),
        cashVouchers: company._count.cashVouchers,
        archiveDocuments: company._count.archiveDocuments,
        auditEvents: company._count.auditLogs,
      },
      invoicesByCurrency: (invoicesByCompany.get(company.id) ?? []).map(
        (row) => ({
          currency: row.currency,
          count: row._count._all,
          invoiced: row._sum.totalAmount?.toString() ?? '0',
          paid: row._sum.paidAmount?.toString() ?? '0',
        }),
      ),
      paymentsByCurrency: (paymentsByCompany.get(company.id) ?? []).map(
        (row) => ({
          currency: row.currency,
          received: row._sum.amount?.toString() ?? '0',
        }),
      ),
    }));

    const totalsByCurrency = new Map<
      string,
      { invoices: number; paidInvoices: number; payments: number }
    >();
    for (const row of invoiceTotals) {
      const totals = totalsByCurrency.get(row.currency) ?? {
        invoices: 0,
        paidInvoices: 0,
        payments: 0,
      };
      totals.invoices += Number(row._sum.totalAmount ?? 0);
      totals.paidInvoices += Number(row._sum.paidAmount ?? 0);
      totalsByCurrency.set(row.currency, totals);
    }
    for (const row of paymentTotals) {
      const totals = totalsByCurrency.get(row.currency) ?? {
        invoices: 0,
        paidInvoices: 0,
        payments: 0,
      };
      totals.payments += Number(row._sum.amount ?? 0);
      totalsByCurrency.set(row.currency, totals);
    }

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        companies: companies.length,
        activeUsers: userCount,
        invoices: invoiceTotals.reduce((sum, row) => sum + row._count._all, 0),
        pendingPaymentOrders: companyRows.reduce(
          (sum, company) => sum + company.counts.pendingPaymentOrders,
          0,
        ),
        activityToday: activityTodayByCompany.reduce(
          (sum, row) => sum + row._count._all,
          0,
        ),
        totalsByCurrency: [...totalsByCurrency.entries()].map(
          ([currency, totals]) => ({
            currency,
            ...Object.fromEntries(
              Object.entries(totals).map(([key, value]) => [
                key,
                value.toFixed(2),
              ]),
            ),
          }),
        ),
      },
      companies: companyRows,
    };
  }
}
