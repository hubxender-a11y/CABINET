import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateFixedAssetDto,
  CreateFixedAssetMovementDto,
} from './fixed-assets.dto';

function elapsedMonths(acquiredAt: Date, asOf: Date): number {
  let months =
    (asOf.getUTCFullYear() - acquiredAt.getUTCFullYear()) * 12 +
    asOf.getUTCMonth() -
    acquiredAt.getUTCMonth();
  if (asOf.getUTCDate() < acquiredAt.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

@Injectable()
export class FixedAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { companyId },
      include: {
        movements: {
          orderBy: { movementDate: 'desc' },
          take: 100,
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return assets.map((asset) => {
      const depreciableAmount = new Prisma.Decimal(asset.acquisitionCost).sub(
        asset.residualValue,
      );
      const months = Math.min(
        elapsedMonths(asset.acquiredAt, new Date()),
        asset.usefulLifeMonths,
      );
      const accumulatedDepreciation = depreciableAmount
        .mul(months)
        .div(asset.usefulLifeMonths)
        .toDecimalPlaces(2);
      return {
        ...asset,
        accumulatedDepreciation,
        netBookValue: new Prisma.Decimal(asset.acquisitionCost)
          .sub(accumulatedDepreciation)
          .toDecimalPlaces(2),
      };
    });
  }

  async create(dto: CreateFixedAssetDto, companyId: string, userId: string) {
    const acquisitionCost = new Prisma.Decimal(dto.acquisitionCost);
    const residualValue = new Prisma.Decimal(dto.residualValue);
    const acquiredAt = new Date(dto.acquiredAt);
    if (!dto.assetNumber.trim() || !dto.name.trim() || !dto.category.trim()) {
      throw new BadRequestException(
        'Le numéro, la désignation et la catégorie du bien sont requis.',
      );
    }
    if (!acquisitionCost.gt(0)) {
      throw new BadRequestException(
        'Le coût d’acquisition doit être supérieur à zéro.',
      );
    }
    if (residualValue.gt(acquisitionCost)) {
      throw new BadRequestException(
        'La valeur résiduelle ne peut pas dépasser le coût d’acquisition.',
      );
    }
    if (acquiredAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'La date d’acquisition ne peut pas être dans le futur.',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const asset = await transaction.fixedAsset.create({
          data: {
            companyId,
            assetNumber: dto.assetNumber.trim(),
            name: dto.name.trim(),
            category: dto.category.trim(),
            serialNumber: dto.serialNumber?.trim() || null,
            acquiredAt,
            acquisitionCost,
            residualValue,
            usefulLifeMonths: dto.usefulLifeMonths,
            currency: dto.currency,
            assignedTo: dto.assignedTo?.trim() || null,
            location: dto.location?.trim() || null,
            notes: dto.notes?.trim() || null,
          },
        });
        await transaction.fixedAssetMovement.create({
          data: {
            companyId,
            assetId: asset.id,
            movementType: 'ACQUISITION',
            movementDate: acquiredAt,
            toAssignee: asset.assignedTo,
            toLocation: asset.location,
            description: 'Enregistrement initial du bien.',
          },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'FIXED_ASSET_CREATED',
            details: {
              assetId: asset.id,
              assetNumber: asset.assetNumber,
              acquisitionCost: acquisitionCost.toString(),
              currency: asset.currency,
            },
          },
        });
        return asset;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ce numéro d’inventaire est déjà attribué à un bien du cabinet.',
        );
      }
      throw error;
    }
  }

  async addMovement(
    assetId: string,
    dto: CreateFixedAssetMovementDto,
    companyId: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const asset = await transaction.fixedAsset.findFirst({
        where: { id: assetId, companyId },
      });
      if (!asset) throw new NotFoundException('Bien patrimonial introuvable.');
      if (asset.status === 'DISPOSED') {
        throw new ConflictException(
          'Un bien sorti du patrimoine ne peut plus recevoir de mouvement.',
        );
      }
      if (dto.movementType === 'ASSIGNMENT' && !dto.assignedTo?.trim()) {
        throw new BadRequestException(
          'Indiquez la personne à qui le bien est affecté.',
        );
      }
      if (dto.movementType === 'TRANSFER' && !dto.location?.trim()) {
        throw new BadRequestException(
          'Indiquez le bureau ou le lieu de destination.',
        );
      }
      if (
        ['MAINTENANCE', 'RETURN', 'DISPOSAL'].includes(dto.movementType) &&
        !dto.description?.trim()
      ) {
        throw new BadRequestException(
          'Un commentaire est requis pour cet événement.',
        );
      }

      const nextAssignee =
        dto.movementType === 'ASSIGNMENT'
          ? dto.assignedTo?.trim() || null
          : asset.assignedTo;
      const nextLocation =
        dto.movementType === 'TRANSFER'
          ? dto.location?.trim() || null
          : asset.location;
      const nextStatus =
        dto.movementType === 'DISPOSAL'
          ? 'DISPOSED'
          : dto.movementType === 'MAINTENANCE'
            ? 'MAINTENANCE'
            : dto.movementType === 'RETURN'
              ? 'ACTIVE'
              : asset.status;
      const movementDate = dto.movementDate
        ? new Date(dto.movementDate)
        : new Date();
      if (movementDate < asset.acquiredAt) {
        throw new BadRequestException(
          'La date du mouvement ne peut pas précéder l’acquisition du bien.',
        );
      }
      if (movementDate.getTime() > Date.now()) {
        throw new BadRequestException(
          'La date du mouvement ne peut pas être dans le futur.',
        );
      }
      const lastMovement = await transaction.fixedAssetMovement.findFirst({
        where: { companyId, assetId: asset.id },
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        select: { movementDate: true },
      });
      if (lastMovement && movementDate < lastMovement.movementDate) {
        throw new BadRequestException(
          'La date doit être égale ou postérieure au dernier mouvement enregistré.',
        );
      }

      const updated = await transaction.fixedAsset.updateMany({
        where: { id: asset.id, companyId, status: { not: 'DISPOSED' } },
        data: {
          assignedTo: nextAssignee,
          location: nextLocation,
          status: nextStatus,
        },
      });
      if (!updated.count) {
        throw new ConflictException(
          'Le bien a été modifié simultanément. Actualisez la page.',
        );
      }

      const movement = await transaction.fixedAssetMovement.create({
        data: {
          companyId,
          assetId: asset.id,
          movementType: dto.movementType,
          movementDate,
          fromAssignee: asset.assignedTo,
          toAssignee: nextAssignee,
          fromLocation: asset.location,
          toLocation: nextLocation,
          description: dto.description?.trim() || null,
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'FIXED_ASSET_MOVED',
          details: {
            assetId: asset.id,
            assetNumber: asset.assetNumber,
            movementType: dto.movementType,
            movementId: movement.id,
          },
        },
      });
      return movement;
    });
  }
}
