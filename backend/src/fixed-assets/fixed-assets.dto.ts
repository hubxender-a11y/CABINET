import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const moneyAmount = /^\d{1,16}(?:\.\d{1,2})?$/;
const assetCurrencies = ['CDF', 'USD'] as const;
const movementTypes = [
  'ASSIGNMENT',
  'TRANSFER',
  'MAINTENANCE',
  'RETURN',
  'DISPOSAL',
] as const;

export class CreateFixedAssetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  assetNumber: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsDateString()
  acquiredAt: string;

  @IsString()
  @Matches(moneyAmount)
  acquisitionCost: string;

  @IsString()
  @Matches(moneyAmount)
  residualValue: string;

  @IsInt()
  @Min(12)
  @Max(600)
  usefulLifeMonths: number;

  @IsIn(assetCurrencies)
  currency: (typeof assetCurrencies)[number];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateFixedAssetMovementDto {
  @IsIn(movementTypes)
  movementType: (typeof movementTypes)[number];

  @IsOptional()
  @IsDateString()
  movementDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class SendFixedAssetReportDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period: string;

  @IsString()
  @MaxLength(1000)
  note: string;
}
