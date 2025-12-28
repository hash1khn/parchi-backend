import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ConfigModule } from './common/config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { OffersModule } from './modules/offers/offers.module';
import { StudentsModule } from './modules/students/students.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    MerchantsModule,
    OffersModule,
    StudentsModule,
    RedemptionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
