import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const decimalAmount = /^\d{1,16}(?:\.\d{1,2})?$/;

export class CreateInvoiceItemDto {
  @IsString()
  @MaxLength(250)
  rubric: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @Matches(decimalAmount)
  unitPrice: string;
}

export class CreateInvoiceDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_FISCALIZATION'])
  fiscalStatus?: 'DRAFT' | 'PENDING_FISCALIZATION';

  @IsString()
  @MaxLength(120)
  period: string;

  @IsString()
  @MaxLength(500)
  concern: string;

  @IsString()
  @MaxLength(120)
  madeAt: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}
