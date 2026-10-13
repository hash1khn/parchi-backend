import { Module } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdminAdsController, AdsController } from './ads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [PrismaModule, AuthModule, SystemConfigModule],
  controllers: [AdsController, AdminAdsController],
  providers: [AdsService],
})
export class AdsModule {}
