import {
  IsDateString,
  IsIn,
  IsOptional,
  IsInt,
  IsString,
  Max,
  Min,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePaymentOrderDto {
  @IsDateString()
  date: string;

  @IsString()
  @MaxLength(100)
  requestingService: string;

  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  amount: string;

  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsString()
  @MaxLength(160)
  beneficiary: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  expenseCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountingAllocation?: string;

  @IsString()
  @MaxLength(80)
  budgetAccount: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  initialForecast?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  attachmentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  attachmentMimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000_000)
  attachmentBase64?: string;
}

export class RejectPaymentOrderDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

export class SavePaymentOrderBudgetDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @IsString()
  @MaxLength(80)
  budgetAccount: string;

  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  initialForecast: string;
}

export class SavePaymentOrderAccountingRuleDto {
  @IsString()
  @MaxLength(100)
  category: string;

  @IsString()
  @MaxLength(40)
  accountCode: string;

  @IsString()
  @MaxLength(120)
  accountName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  budgetAccount?: string;
}
