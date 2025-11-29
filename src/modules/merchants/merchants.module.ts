import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { AdminMerchantsController } from './admin-merchants.controller';
import { MerchantsService } from './merchants.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MerchantsController, AdminMerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

