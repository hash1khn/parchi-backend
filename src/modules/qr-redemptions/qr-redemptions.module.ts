import { Module } from '@nestjs/common';
import { QrRedemptionsController } from './qr-redemptions.controller';
import { QrRedemptionsService } from './qr-redemptions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RedemptionsModule } from '../redemptions/redemptions.module';

@Module({
  imports: [PrismaModule, AuthModule, RedemptionsModule],
  controllers: [QrRedemptionsController],
  providers: [QrRedemptionsService],
  exports: [QrRedemptionsService],
})
export class QrRedemptionsModule {}
