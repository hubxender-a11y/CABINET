import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCashVoucherDto {
  @IsDateString()
  date: string;

  @IsString()
  @MaxLength(160)
  beneficiary: string;

  @IsString()
  @MaxLength(100)
  category: string;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  amount: string;

  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @IsIn(['CASH_CDF', 'CASH_USD'])
  method: 'CASH_CDF' | 'CASH_USD';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class CancelCashVoucherDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

export class RejectCashVoucherDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

export class ReconcileCashAccountDto {
  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  countedBalance: string;

  @IsString()
  @MaxLength(300)
  reason: string;
}

export class FundCashAccountDto {
  @IsDateString()
  date: string;

  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  amount: string;

  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @IsIn(['ASSOCIE_GERANT'])
  source: 'ASSOCIE_GERANT';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
