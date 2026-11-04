import { IsIn, IsString, MaxLength, Matches } from 'class-validator';

export const customerDocumentMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export class CreateCustomerDocumentDto {
  @IsString()
  @MaxLength(180)
  name: string;

  @IsIn(customerDocumentMimeTypes)
  mimeType: (typeof customerDocumentMimeTypes)[number];

  @IsString()
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  data: string;
}
