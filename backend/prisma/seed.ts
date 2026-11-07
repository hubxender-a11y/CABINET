import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const companyId =
  process.env.DEFAULT_COMPANY_ID ?? '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20';

async function main() {
  await prisma.company.upsert({
    where: { id: companyId },
    update: {},
    create: {
      id: companyId,
      legalName: process.env.CABINET_LEGAL_NAME ?? 'Cabinet Transparency SARL',
      tradeName: 'Cabinet Transparency',
      address:
        'Av. Boulevard du 30 juin, Immeuble MAYUMBE, niveau 3, appartement 18',
      city: 'Kinshasa',
      commune: 'Gombe',
      phone: '+243 98 00 69 950',
      email: 'service@ctrs.cd',
      currencyCode: 'CDF',
      currencies: {
        create: [
          { code: 'CDF', name: 'Franc congolais', symbol: 'CDF' },
          { code: 'USD', name: 'Dollar américain', symbol: 'USD' },
        ],
      },
    },
  });

  console.log(`Cabinet initialisé (${companyId}).`);

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL et ADMIN_PASSWORD sont requis pour créer le premier compte administrateur.',
    );
  }
  if (adminPassword.length < 14) {
    throw new Error('ADMIN_PASSWORD doit contenir au moins 14 caractères.');
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  const admin = existingAdmin ?? await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword, 12),
      name: 'Administrateur du cabinet',
    },
  });
  await prisma.companyMembership.upsert({
    where: {
      userId_companyId: { userId: admin.id, companyId },
    },
    update: { role: UserRole.COMPANY_ADMIN },
    create: {
      userId: admin.id,
      companyId,
      role: UserRole.COMPANY_ADMIN,
    },
  });
  console.log(`Compte administrateur initialisé (${adminEmail}).`);
}

main()
  .catch((error: unknown) => {
    console.error('Échec de l’initialisation du cabinet.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
