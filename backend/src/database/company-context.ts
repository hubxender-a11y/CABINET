import { BadRequestException } from '@nestjs/common';

const DEFAULT_COMPANY_ID = '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20';

export function getCompanyId(): string {
  const companyId = process.env.DEFAULT_COMPANY_ID ?? DEFAULT_COMPANY_ID;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(companyId)) {
    throw new BadRequestException(
      'DEFAULT_COMPANY_ID doit être un identifiant UUID valide.',
    );
  }

  return companyId;
}
