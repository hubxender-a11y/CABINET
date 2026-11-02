import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const dossierStatuses = ['À jour', 'À relancer', 'En retard'] as const;

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
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
  @MaxLength(32)
  nif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  rccm?: string;
}

export class UpdateCustomerDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contact?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  nif?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  rccm?: string | null;

  @IsOptional()
  @IsIn(dossierStatuses)
  status?: (typeof dossierStatuses)[number];
}
