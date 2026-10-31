import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateProductDto,
  CreatePurchaseDto,
  CreateStockMovementDto,
  CreateSupplierDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

const inventoryManagers = [
  UserRole.COMPANY_ADMIN,
  UserRole.STOCK_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.FINANCE_MANAGER,
];

@ApiTags('inventory-and-purchasing')
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('products')
  @ApiOperation({ summary: 'List active cabinet products' })
  products() {
    return this.inventory.listProducts();
  }

  @Post('products')
  @UseGuards(RolesGuard)
  @Roles(...inventoryManagers)
  @ApiOperation({ summary: 'Create a product with optional opening stock' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.inventory.createProduct(dto);
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'List cabinet suppliers' })
  suppliers() {
    return this.inventory.listSuppliers();
  }

  @Post('suppliers')
  @UseGuards(RolesGuard)
  @Roles(...inventoryManagers)
  @ApiOperation({ summary: 'Create a cabinet supplier' })
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.inventory.createSupplier(dto);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'List supplier purchases and receiving status' })
  purchases() {
    return this.inventory.listPurchases();
  }

  @Post('purchases')
  @UseGuards(RolesGuard)
  @Roles(...inventoryManagers)
  @ApiOperation({ summary: 'Create a draft supplier purchase' })
  createPurchase(@Body() dto: CreatePurchaseDto) {
    return this.inventory.createPurchase(dto);
  }

  @Post('purchases/:id/receive')
  @UseGuards(RolesGuard)
  @Roles(...inventoryManagers)
  @ApiOperation({ summary: 'Receive a purchase and increase product stocks' })
  receivePurchase(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventory.receivePurchase(id);
  }

  @Get('stock')
  @ApiOperation({ summary: 'Read product stock and recent movements' })
  stock() {
    return this.inventory.getStock();
  }

  @Post('stock/movements')
  @UseGuards(RolesGuard)
  @Roles(...inventoryManagers)
  @ApiOperation({ summary: 'Record a stock movement or inventory adjustment' })
  createStockMovement(@Body() dto: CreateStockMovementDto) {
    return this.inventory.createStockMovement(dto);
  }
}
