import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PostgreSQL timeout')), 350)
    );
    try {
      await Promise.race([this.$connect(), timeout]);
      this.logger.log('Connected to PostgreSQL database via Prisma');
    } catch {
      this.logger.warn(
        'PostgreSQL connection could not be established immediately (using fast in-memory persistence fallback for active game sessions)'
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
