import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      console.error('Connexion PostgreSQL indisponible.', error);
      throw new ServiceUnavailableException(
        'La base PostgreSQL est inaccessible. Vérifiez DATABASE_URL et le service PostgreSQL.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
