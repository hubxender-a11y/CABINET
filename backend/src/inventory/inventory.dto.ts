import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const moneyAmount = /^\d{1,16}(?:\.\d{1,2})?$/;
const stockAmount = /^\d{1,15}(?:\.\d{1,3})?$/;

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  sku: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @Matches(moneyAmount)
  purchasePrice: string;

  @IsString()
  @Matches(moneyAmount)
  sellPrice: string;

  @IsOptional()
  @IsString()
  @Matches(stockAmount)
  openingStock?: string;

  @IsOptional()
  @IsString()
  @Matches(stockAmount)
  alertLevel?: string;
}

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nif?: string;
}

export class PurchaseItemDto {
  @IsUUID()
  productId: string;

  @IsString()
  @Matches(stockAmount)
  quantity: string;

  @IsString()
  @Matches(moneyAmount)
  unitPrice: string;
}

export class CreatePurchaseDto {
  @IsUUID()
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

export class CreateStockMovementDto {
  @IsUUID()
  productId: string;

  @IsIn(['IN', 'OUT', 'ADJUSTMENT'])
  movementType: 'IN' | 'OUT' | 'ADJUSTMENT';

  @IsString()
  @Matches(stockAmount)
  quantity: string;

  @IsOptional()
  @IsString()
  @Matches(moneyAmount)
  unitCost?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
