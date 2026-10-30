import { PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @MaxLength(100)
  category: string;

  @IsDateString()
  date: string;

  @IsString()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  amount: string;

  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
