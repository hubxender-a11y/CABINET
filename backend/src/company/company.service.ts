import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { UpdateCompanyDto } from './company.dto';

const companyFields = {
  id: true,
  legalName: true,
  tradeName: true,
  logoUrl: true,
  primaryColor: true,
  accentColor: true,
  isActive: true,
  rccm: true,
  nin: true,
  nif: true,
  taxId: true,
  address: true,
  province: true,
  city: true,
  commune: true,
  phone: true,
  email: true,
  sector: true,
  taxRegime: true,
  vatStatus: true,
  signatureName: true,
  signatureTitle: true,
  signatureDataUrl: true,
  currencyCode: true,
  exchangeRateCdfPerUsd: true,
  invoiceTemplate: true,
} satisfies Prisma.CompanySelect;

const templateBuiltinIds = new Set([
  'logo',
  'qr',
  'title',
  'date',
  'client',
  'period',
  'prestation',
  'items',
  'total',
  'amount-words',
  'payment-terms',
  'signature',
  'footer',
]);

type InvoiceTemplateKind = 'builtin' | 'text' | 'image' | 'shape' | 'line';

function isInvoiceTemplateKind(value: unknown): value is InvoiceTemplateKind {
  return (
    value === 'builtin' ||
    value === 'text' ||
    value === 'image' ||
    value === 'shape' ||
    value === 'line'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateInvoiceTemplate(value: Record<string, unknown>) {
  if (
    value.version !== 1 ||
    !Array.isArray(value.elements) ||
    value.elements.length > 40 ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > 1_800_000
  ) {
    throw new BadRequestException(
      'Le modèle de facture est invalide ou trop volumineux.',
    );
  }

  const ids = new Set<string>();
  const elements = value.elements.map((element) => {
    if (!isRecord(element)) {
      throw new BadRequestException(
        'Un objet du modèle de facture est invalide.',
      );
    }

    const {
      id,
      name,
      kind,
      x,
      y,
      width,
      height,
      fontSize,
      color,
      fill,
      visible,
      content,
    } = element;
    if (
      typeof id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
      ids.has(id) ||
      typeof name !== 'string' ||
      name.length > 80 ||
      !isInvoiceTemplateKind(kind) ||
      (kind === 'builtin' && !templateBuiltinIds.has(id)) ||
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      x < -50 ||
      x > 260 ||
      typeof y !== 'number' ||
      !Number.isFinite(y) ||
      y < -30 ||
      y > 340 ||
      typeof width !== 'number' ||
      !Number.isFinite(width) ||
      width < 0 ||
      width > 210 ||
      typeof height !== 'number' ||
      !Number.isFinite(height) ||
      height < 0 ||
      height > 297 ||
      typeof fontSize !== 'number' ||
      !Number.isFinite(fontSize) ||
      fontSize < 1 ||
      fontSize > 96 ||
      typeof color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(color) ||
      typeof fill !== 'string' ||
      !(fill === 'transparent' || /^#[0-9a-f]{6}$/i.test(fill)) ||
      typeof visible !== 'boolean' ||
      typeof content !== 'string' ||
      content.length > (kind === 'image' ? 65_000 : 2_000) ||
      (kind === 'image' &&
        content.length > 0 &&
        !/^(?:\/[a-zA-Z0-9/_.,%-]+|https:\/\/[^\s]+|data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+)$/i.test(
          content,
        ))
    ) {
      throw new BadRequestException(
        'Un objet du modèle de facture contient des valeurs invalides.',
      );
    }
    ids.add(id);

    return {
      id,
      name,
      kind,
      x,
      y,
      width,
      height,
      fontSize,
      color,
      fill,
      visible,
      content,
    };
  });

  const requiredIds = [...templateBuiltinIds];
  if (requiredIds.some((id) => !ids.has(id))) {
    throw new BadRequestException(
      'Le modèle de facture doit conserver tous ses éléments de base.',
    );
  }

  return { version: 1, elements };
}

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlatformCompanies() {
    return this.prisma.company.findMany({
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        email: true,
        city: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
        isActive: true,
        createdAt: true,
        _count: { select: { memberships: true, invoices: true, customers: true } },
      },
      orderBy: { legalName: 'asc' },
    });
  }

  async createPlatformCompany(
    dto: import('./company.dto').CreateCompanyDto,
    actorId: string,
  ) {
    const company = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.company.create({
        data: {
          legalName: dto.legalName.trim(),
          tradeName: dto.tradeName?.trim() || null,
          address: dto.address?.trim() || null,
          city: dto.city?.trim() || null,
          province: dto.province?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          currencyCode: 'CDF',
          currencies: {
            create: [
              { code: 'CDF', name: 'Franc congolais', symbol: 'CDF' },
              { code: 'USD', name: 'Dollar américain', symbol: 'USD' },
            ],
          },
        },
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          email: true,
          city: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          isActive: true,
          createdAt: true,
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId: created.id,
          userId: actorId,
          action: 'PLATFORM_COMPANY_CREATED',
          details: { legalName: created.legalName, tradeName: created.tradeName },
        },
      });
      return created;
    });
    return company;
  }

  async updatePlatformCompany(id: string, dto: UpdateCompanyDto, actorId: string) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Aucune modification à enregistrer.');
    }
    if (dto.legalName !== undefined && !dto.legalName.trim()) {
      throw new BadRequestException('La raison sociale ne peut pas être vide.');
    }
    const exists = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Entreprise introuvable.');
    return this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.company.update({
        where: { id },
        data: {
          ...(dto.legalName !== undefined ? { legalName: dto.legalName.trim() } : {}),
          ...(dto.tradeName !== undefined ? { tradeName: dto.tradeName?.trim() || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
          ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
          ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
          ...(dto.primaryColor !== undefined ? { primaryColor: dto.primaryColor.toLowerCase() } : {}),
          ...(dto.accentColor !== undefined ? { accentColor: dto.accentColor.toLowerCase() } : {}),
        },
        select: {
          id: true, legalName: true, tradeName: true, email: true, city: true,
          logoUrl: true, primaryColor: true, accentColor: true, createdAt: true,
          isActive: true,
          _count: { select: { memberships: true, invoices: true, customers: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId: getCompanyId(),
          userId: actorId,
          action: 'PLATFORM_COMPANY_UPDATED',
          details: { companyId: id, changedFields: Object.keys(dto) },
        },
      });
      return saved;
    });
  }

  async deletePlatformCompany(id: string, actorId: string) {
    const currentCompanyId = getCompanyId();
    if (id === currentCompanyId) {
      throw new BadRequestException('Ouvrez une autre entreprise avant de supprimer celle-ci.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.company.findUnique({
        where: { id }, select: { legalName: true, tradeName: true },
      });
      if (!target) throw new NotFoundException('Entreprise introuvable.');
      if (await transaction.company.count({ where: { isActive: true } }) <= 1) {
        throw new BadRequestException('La plateforme doit conserver au moins une entreprise.');
      }
      await transaction.auditLog.create({
        data: {
          companyId: currentCompanyId,
          userId: actorId,
          action: 'PLATFORM_COMPANY_ARCHIVED',
          details: { companyId: id, legalName: target.legalName, tradeName: target.tradeName },
        },
      });
      await transaction.company.update({ where: { id }, data: { isActive: false } });
      return { id, archived: true };
    });
  }

  async restorePlatformCompany(id: string, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.company.findUnique({ where: { id }, select: { id: true, legalName: true } });
      if (!target) throw new NotFoundException('Entreprise introuvable.');
      await transaction.company.update({ where: { id }, data: { isActive: true } });
      await transaction.auditLog.create({
        data: {
          companyId: getCompanyId(),
          userId: actorId,
          action: 'PLATFORM_COMPANY_RESTORED',
          details: { companyId: id, legalName: target.legalName },
        },
      });
      return { id, restored: true };
    });
  }

  async listPlatformAdmins() {
    return this.prisma.user.findMany({
      where: { isPlatformAdmin: true },
      select: { id: true, email: true, name: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async addPlatformAdmin(emailInput: string, actorId: string) {
    const email = emailInput.trim().toLowerCase();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin-roster'), 0)`;
      const target = await transaction.user.findUnique({
        where: { email },
        select: { id: true, email: true, isActive: true, isPlatformAdmin: true },
      });
      if (!target) {
        throw new NotFoundException('Aucun compte ne correspond à cet e-mail. Créez d’abord son compte utilisateur dans une entreprise.');
      }
      if (!target.isActive) {
        throw new BadRequestException('Réactivez ce compte avant de lui attribuer le rôle super-admin.');
      }
      if (target.isPlatformAdmin) {
        throw new ConflictException('Ce compte est déjà super-admin de la plateforme.');
      }
      const updated = await transaction.user.update({
        where: { id: target.id },
        data: { isPlatformAdmin: true },
        select: { id: true, email: true, name: true, isActive: true, createdAt: true },
      });
      await transaction.auditLog.create({
        data: {
          companyId: getCompanyId(),
          userId: actorId,
          action: 'PLATFORM_ADMIN_GRANTED',
          details: { userId: target.id, email: target.email },
        },
      });
      return updated;
    });
  }

  async removePlatformAdmin(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('Un super-admin ne peut pas retirer son propre accès.');
    }
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-admin-roster'), 0)`;
      const target = await transaction.user.findUnique({
        where: { id },
        select: { id: true, email: true, isActive: true, isPlatformAdmin: true },
      });
      if (!target?.isPlatformAdmin) {
        throw new NotFoundException('Super-admin introuvable.');
      }
      const activeAdmins = await transaction.user.count({
        where: { isPlatformAdmin: true, isActive: true },
      });
      if (target.isActive && activeAdmins <= 1) {
        throw new BadRequestException('La plateforme doit conserver au moins un super-admin actif.');
      }
      await transaction.user.update({
        where: { id },
        data: { isPlatformAdmin: false },
      });
      await transaction.auditLog.create({
        data: {
          companyId: getCompanyId(),
          userId: actorId,
          action: 'PLATFORM_ADMIN_REVOKED',
          details: { userId: id, email: target.email },
        },
      });
      return { id, isPlatformAdmin: false };
    });
  }

  async get() {
    const company = await this.prisma.company.findUnique({
      where: { id: getCompanyId() },
      select: companyFields,
    });
    if (!company) throw new NotFoundException('Cabinet introuvable.');
    const rateHistory = company.exchangeRateCdfPerUsd
      ? await this.prisma.exchangeRate.findFirst({
          where: {
            companyId: company.id,
            baseCode: 'USD',
            quoteCode: 'CDF',
            source: 'MANUAL_SETTINGS',
          },
          orderBy: { appliedAt: 'desc' },
          select: { appliedAt: true },
        })
      : null;
    return {
      ...company,
      exchangeRateCdfPerUsd: company.exchangeRateCdfPerUsd?.toString() ?? null,
      exchangeRateAppliedAt: rateHistory?.appliedAt ?? null,
    };
  }

  async update(dto: UpdateCompanyDto, actorId: string) {
    const companyId = getCompanyId();
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Aucune modification à enregistrer.');
    }

    if (typeof dto.legalName === 'string' && !dto.legalName.trim()) {
      throw new BadRequestException('La raison sociale ne peut pas être vide.');
    }
    const exchangeRate =
      typeof dto.exchangeRateCdfPerUsd === 'string'
        ? new Prisma.Decimal(dto.exchangeRateCdfPerUsd)
        : null;
    if (exchangeRate && exchangeRate.lte(0)) {
      throw new BadRequestException(
        'Le taux de change doit être supérieur à zéro.',
      );
    }
    const invoiceTemplate =
      dto.invoiceTemplate === undefined
        ? undefined
        : validateInvoiceTemplate(dto.invoiceTemplate);

    const data: Prisma.CompanyUpdateInput = {
      ...(dto.legalName !== undefined
        ? { legalName: dto.legalName.trim() }
        : {}),
      ...(dto.tradeName !== undefined
        ? { tradeName: dto.tradeName?.trim() || null }
        : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      ...(dto.primaryColor !== undefined ? { primaryColor: dto.primaryColor.toLowerCase() } : {}),
      ...(dto.accentColor !== undefined ? { accentColor: dto.accentColor.toLowerCase() } : {}),
      ...(dto.rccm !== undefined ? { rccm: dto.rccm?.trim() || null } : {}),
      ...(dto.nin !== undefined ? { nin: dto.nin?.trim() || null } : {}),
      ...(dto.nif !== undefined ? { nif: dto.nif?.trim() || null } : {}),
      ...(dto.taxId !== undefined ? { taxId: dto.taxId?.trim() || null } : {}),
      ...(dto.address !== undefined
        ? { address: dto.address?.trim() || null }
        : {}),
      ...(dto.province !== undefined
        ? { province: dto.province?.trim() || null }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
      ...(dto.commune !== undefined
        ? { commune: dto.commune?.trim() || null }
        : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
      ...(dto.email !== undefined
        ? { email: dto.email?.trim().toLowerCase() || null }
        : {}),
      ...(dto.sector !== undefined
        ? { sector: dto.sector?.trim() || null }
        : {}),
      ...(dto.taxRegime !== undefined
        ? { taxRegime: dto.taxRegime?.trim() || null }
        : {}),
      ...(dto.vatStatus !== undefined
        ? { vatStatus: dto.vatStatus?.trim() || null }
        : {}),
      ...(dto.signatureName !== undefined
        ? { signatureName: dto.signatureName?.trim() || null }
        : {}),
      ...(dto.signatureTitle !== undefined
        ? { signatureTitle: dto.signatureTitle?.trim() || null }
        : {}),
      ...(dto.signatureDataUrl !== undefined
        ? { signatureDataUrl: dto.signatureDataUrl }
        : {}),
      ...(dto.currencyCode !== undefined
        ? { currencyCode: dto.currencyCode }
        : {}),
      ...(dto.exchangeRateCdfPerUsd !== undefined
        ? { exchangeRateCdfPerUsd: exchangeRate }
        : {}),
      ...(invoiceTemplate !== undefined ? { invoiceTemplate } : {}),
    };

    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { exchangeRateCdfPerUsd: true },
      });
      await transaction.company.update({
        where: { id: companyId },
        data,
      });
      if (
        dto.exchangeRateCdfPerUsd !== undefined &&
        (current.exchangeRateCdfPerUsd?.toString() ?? null) !==
          (exchangeRate?.toString() ?? null) &&
        exchangeRate
      ) {
        await transaction.exchangeRate.create({
          data: {
            companyId,
            baseCode: 'USD',
            quoteCode: 'CDF',
            rate: exchangeRate,
            appliedAt: new Date(),
            source: 'MANUAL_SETTINGS',
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId: actorId,
          action: 'CABINET_PROFILE_UPDATED',
          details: {
            changedFields: Object.keys(dto),
            ...(dto.exchangeRateCdfPerUsd !== undefined
              ? {
                  exchangeRateCdfPerUsd: {
                    from: current.exchangeRateCdfPerUsd?.toString() ?? null,
                    to: exchangeRate?.toString() ?? null,
                  },
                }
              : {}),
          },
        },
      });
    });
    return this.get();
  }

  async updateInvoiceTemplate(
    template: Record<string, unknown>,
    actorId: string,
  ) {
    return this.update({ invoiceTemplate: template }, actorId);
  }
}
