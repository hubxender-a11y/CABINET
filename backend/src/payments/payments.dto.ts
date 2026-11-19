import { PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  invoiceId: string;

  @IsString()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  amount: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class CancelPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
