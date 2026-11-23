import {
  IsDateString,
  IsIn,
  IsString,
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

  @IsString()
  @MaxLength(180)
  attachmentName: string;

  @IsString()
  @MaxLength(100)
  attachmentMimeType: string;

  @IsString()
  @MaxLength(12_000_000)
  attachmentBase64: string;
}

export class RejectPaymentOrderDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}
