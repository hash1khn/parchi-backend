import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OffersController } from './offers.controller';
import { AdminOffersController } from './admin-offers.controller';
import { OffersService } from './offers.service';
import { OffersExpiryTask } from './offers-expiry.task';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [OffersController, AdminOffersController],
  providers: [OffersService, OffersExpiryTask],
  exports: [OffersService],
})
export class OffersModule {}

