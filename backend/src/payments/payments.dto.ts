import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  invoiceId: string;

  @IsString()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  amount: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
