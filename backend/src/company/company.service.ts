import {
  BadRequestException,
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
