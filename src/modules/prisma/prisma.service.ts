import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    // Prisma connects lazily by default - no need to call $connect() explicitly
    // This prevents connection pool exhaustion issues
    // Connections are established automatically when queries are executed
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}