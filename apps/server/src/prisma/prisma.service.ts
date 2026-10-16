import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** True once a connection to PostgreSQL has succeeded. Hot paths skip DB writes while false. */
  public isAvailable = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL is not set — using the JSON file database only.');
      return;
    }

    const connectPromise = this.$connect()
      .then(() => {
        this.isAvailable = true;
        this.logger.log('Connected to PostgreSQL database via Prisma');
      })
      .catch((err: any) => {
        this.isAvailable = false;
        this.logger.warn(`PostgreSQL unavailable (${err?.message?.split('\n')[0] || 'unknown error'}); using the JSON file database.`);
      });

    // Do not block server startup for long; the connection may still finish in the background.
    await Promise.race([connectPromise, new Promise((resolve) => setTimeout(resolve, 1500))]);
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {}
  }
}
