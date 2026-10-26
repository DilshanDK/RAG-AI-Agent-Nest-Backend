import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Connected to PostgreSQL (Neon) database successfully.');
        break;
      } catch (error) {
        this.logger.warn(`Database connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        if (attempt === maxRetries) {
          throw error;
        }
        this.logger.log('Waiting 3 seconds for serverless database to wake up...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
