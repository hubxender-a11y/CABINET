import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const archiveCategories = [
  'CLIENT',
  'FISCAL',
  'ACCOUNTING',
  'LEGAL',
  'HR',
  'INTERNAL',
] as const;

export const archiveMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export class CreateArchiveDocumentDto {
  @IsIn(archiveCategories)
  category: (typeof archiveCategories)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  binder?: string;

  @IsOptional()
  @IsUUID()
  binderId?: string;

  @IsInt()
  @Min(1900)
  @Max(2200)
  fiscalYear: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  period?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(180)
  originalName: string;

  @IsIn(archiveMimeTypes)
  mimeType: (typeof archiveMimeTypes)[number];

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  data: string;
}

export class ArchiveListQueryDto {
  @IsOptional()
  @IsIn(archiveCategories)
  category?: (typeof archiveCategories)[number];

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  fiscalYear?: number;

  @IsOptional()
  @IsUUID()
  binderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateArchiveBinderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsIn(archiveCategories)
  category: (typeof archiveCategories)[number];

  @IsInt()
  @Min(1900)
  @Max(2200)
  fiscalYear: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  period?: string;
}

export class ArchiveBinderListQueryDto {
  @IsOptional()
  @IsIn(archiveCategories)
  category?: (typeof archiveCategories)[number];

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  fiscalYear?: number;
}
