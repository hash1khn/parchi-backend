import { Module } from '@nestjs/common';
import { RedemptionsController } from './redemptions.controller';
import { AdminRedemptionsController } from './admin-redemptions.controller';
import { RedemptionsService } from './redemptions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { SohoStrategy } from './strategies/soho.strategy';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RedemptionsController, AdminRedemptionsController],
  providers: [RedemptionsService, SohoStrategy],
  exports: [RedemptionsService, SohoStrategy],
})
export class RedemptionsModule {}
