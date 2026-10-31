import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tradeName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  rccm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nif?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  commune?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sector?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxRegime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vatStatus?: string | null;

  @IsOptional()
  @IsIn(['CDF', 'USD'])
  currencyCode?: string;
}
