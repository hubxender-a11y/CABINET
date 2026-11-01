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
} satisfies Prisma.CompanySelect;

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const company = await this.prisma.company.findUnique({
      where: { id: getCompanyId() },
      select: companyFields,
    });
    if (!company) throw new NotFoundException('Cabinet introuvable.');
    return company;
  }

  async update(dto: UpdateCompanyDto, actorId: string) {
    const companyId = getCompanyId();
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Aucune modification à enregistrer.');
    }

    if (typeof dto.legalName === 'string' && !dto.legalName.trim()) {
      throw new BadRequestException('La raison sociale ne peut pas être vide.');
    }
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
    };

    return this.prisma.$transaction(async (transaction) => {
      const company = await transaction.company.update({
        where: { id: companyId },
        data,
        select: companyFields,
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId: actorId,
          action: 'CABINET_PROFILE_UPDATED',
          details: { changedFields: Object.keys(dto) },
        },
      });
      return company;
    });
  }
}
