import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import {
  CreateProductDto,
  CreatePurchaseDto,
  CreateStockMovementDto,
  CreateSupplierDto,
} from './inventory.dto';

const amount = (value: string | undefined, field: string) => {
  const parsed = new Prisma.Decimal(value ?? '0');
  if (parsed.isNegative()) {
    throw new BadRequestException(`${field} ne peut pas être négatif.`);
  }
  return parsed;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts() {
    return this.prisma.product.findMany({
      where: { companyId: getCompanyId(), active: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createProduct(dto: CreateProductDto) {
    const companyId = getCompanyId();
    const openingStock = amount(dto.openingStock, 'Le stock initial');
    const purchasePrice = amount(dto.purchasePrice, 'Le prix d’achat');
    const sellPrice = amount(dto.sellPrice, 'Le prix de vente');
    const alertLevel = amount(dto.alertLevel, 'Le seuil d’alerte');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.create({
          data: {
            companyId,
            sku: dto.sku.trim(),
            name: dto.name.trim(),
            unit: dto.unit?.trim() || 'unité',
            description: dto.description?.trim() || null,
            purchasePrice,
            sellPrice,
            stock: openingStock,
            alertLevel,
          },
        });
        if (openingStock.gt(0)) {
          await transaction.stockMovement.create({
            data: {
              companyId,
              productId: product.id,
              movementType: 'IN',
              quantity: openingStock,
              unitCost: purchasePrice,
              description: 'Stock initial',
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            companyId,
            action: 'INVENTORY_PRODUCT_CREATED',
            details: { productId: product.id, sku: product.sku },
          },
        });
        return product;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Un produit portant cette référence existe déjà.',
        );
      }
      throw error;
    }
  }

  listSuppliers() {
    return this.prisma.supplier.findMany({
      where: { companyId: getCompanyId() },
      orderBy: { name: 'asc' },
    });
  }

  createSupplier(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        companyId: getCompanyId(),
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        address: dto.address?.trim() || null,
        nif: dto.nif?.trim() || null,
      },
    });
  }

  listPurchases() {
    return this.prisma.purchase.findMany({
      where: { companyId: getCompanyId() },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createPurchase(dto: CreatePurchaseDto) {
    const companyId = getCompanyId();
    const [supplier, company] = await Promise.all([
      this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { currencyCode: true },
      }),
    ]);
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
    if (!company) throw new NotFoundException('Cabinet introuvable.');

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, companyId, active: true },
      select: { id: true, name: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'Un ou plusieurs produits de l’achat sont indisponibles.',
      );
    }
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const items = dto.items.map((item) => {
      const quantity = amount(item.quantity, 'La quantité');
      const unitPrice = amount(item.unitPrice, 'Le prix unitaire');
      if (quantity.lte(0)) {
        throw new BadRequestException(
          'La quantité doit être supérieure à zéro.',
        );
      }
      const product = productsById.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          'Un ou plusieurs produits de l’achat sont indisponibles.',
        );
      }
      return {
        productId: item.productId,
        name: product.name,
        quantity,
        unitPrice,
        total: quantity.mul(unitPrice),
      };
    });
    const total = items.reduce(
      (sum, item) => sum.add(item.total),
      new Prisma.Decimal(0),
    );
    const number = `ACH-${new Date().getFullYear()}-${Date.now()}`;

    return this.prisma.$transaction(async (transaction) => {
      const purchase = await transaction.purchase.create({
        data: {
          companyId,
          supplierId: supplier.id,
          number,
          total,
          currency: company.currencyCode,
          status: 'DRAFT',
          items: { create: items },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, sku: true, name: true } },
            },
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'SUPPLIER_PURCHASE_CREATED',
          details: {
            purchaseId: purchase.id,
            number: purchase.number,
            total: total.toString(),
            currency: purchase.currency,
          },
        },
      });
      return purchase;
    });
  }

  async receivePurchase(id: string) {
    const companyId = getCompanyId();
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const purchase = await transaction.purchase.findFirst({
            where: { id, companyId },
            include: { items: true },
          });
          if (!purchase) throw new NotFoundException('Achat introuvable.');
          if (purchase.status !== 'DRAFT') {
            throw new ConflictException('Cet achat a déjà été réceptionné.');
          }
          if (purchase.items.some((item) => !item.productId)) {
            throw new BadRequestException(
              'Chaque ligne doit être rattachée à un produit avant réception.',
            );
          }
          const claimed = await transaction.purchase.updateMany({
            where: { id, companyId, status: 'DRAFT' },
            data: { status: 'RECEIVED' },
          });
          if (!claimed.count) {
            throw new ConflictException('Cet achat a déjà été réceptionné.');
          }

          for (const item of purchase.items) {
            const productId = item.productId;
            if (!productId) {
              throw new BadRequestException(
                'Une ligne de cet achat ne possède plus de produit associé.',
              );
            }
            const updatedProduct = await transaction.product.updateMany({
              where: { id: productId, companyId },
              data: {
                stock: { increment: item.quantity },
                purchasePrice: item.unitPrice,
              },
            });
            if (!updatedProduct.count) {
              throw new NotFoundException(
                'Un produit de cet achat n’appartient plus au cabinet.',
              );
            }
            await transaction.stockMovement.create({
              data: {
                companyId,
                productId,
                movementType: 'PURCHASE',
                quantity: item.quantity,
                unitCost: item.unitPrice,
                description: `Réception ${purchase.number}`,
              },
            });
          }
          await transaction.auditLog.create({
            data: {
              companyId,
              action: 'SUPPLIER_PURCHASE_RECEIVED',
              details: { purchaseId: purchase.id, number: purchase.number },
            },
          });
          return {
            id: purchase.id,
            number: purchase.number,
            status: 'RECEIVED',
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'La réception a été modifiée simultanément. Actualisez la page.',
        );
      }
      throw error;
    }
  }

  async getStock() {
    const companyId = getCompanyId();
    const [products, movements] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId, active: true },
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          stock: true,
          alertLevel: true,
          purchasePrice: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stockMovement.findMany({
        where: { companyId },
        include: { product: { select: { id: true, sku: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { products, movements };
  }

  async createStockMovement(dto: CreateStockMovementDto) {
    const companyId = getCompanyId();
    const quantity = amount(dto.quantity, 'La quantité');
    if (quantity.lte(0)) {
      throw new BadRequestException('La quantité doit être supérieure à zéro.');
    }
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const product = await transaction.product.findFirst({
            where: { id: dto.productId, companyId, active: true },
            select: { id: true, stock: true, purchasePrice: true },
          });
          if (!product) throw new NotFoundException('Produit introuvable.');

          const currentStock = new Prisma.Decimal(product.stock);
          const delta =
            dto.movementType === 'IN'
              ? quantity
              : dto.movementType === 'OUT'
                ? quantity.negated()
                : quantity.sub(currentStock);
          const newStock = currentStock.add(delta);
          if (newStock.isNegative()) {
            throw new BadRequestException(
              'La sortie demandée dépasse le stock disponible.',
            );
          }
          if (delta.isZero()) {
            throw new BadRequestException(
              'Le stock compté est identique au stock enregistré.',
            );
          }

          const updated = await transaction.product.updateMany({
            where: { id: product.id, companyId, stock: currentStock },
            data: { stock: newStock },
          });
          if (!updated.count) {
            throw new ConflictException(
              'Le stock a changé simultanément. Actualisez puis recommencez.',
            );
          }
          const movement = await transaction.stockMovement.create({
            data: {
              companyId,
              productId: product.id,
              movementType: dto.movementType,
              quantity: delta,
              unitCost:
                dto.unitCost !== undefined
                  ? amount(dto.unitCost, 'Le coût unitaire')
                  : product.purchasePrice,
              description: dto.description?.trim() || null,
            },
          });
          await transaction.auditLog.create({
            data: {
              companyId,
              action: 'INVENTORY_STOCK_MOVED',
              details: {
                productId: product.id,
                movementType: dto.movementType,
                quantity: delta.toString(),
              },
            },
          });
          return movement;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Le stock a changé simultanément. Actualisez puis recommencez.',
        );
      }
      throw error;
    }
  }
}
