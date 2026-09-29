import { Module } from '@nestjs/common';
import { PartnerVerificationsService } from './partner-verifications.service';
import { PartnerVerificationsPartnerController } from './partner-verifications-partner.controller';
import { PartnerVerificationsStudentController } from './partner-verifications-student.controller';
import { PartnerApiKeyGuard } from '../../common/guards/partner-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [
    PartnerVerificationsPartnerController,
    PartnerVerificationsStudentController,
  ],
  providers: [PartnerVerificationsService, PartnerApiKeyGuard],
  exports: [PartnerVerificationsService],
})
export class PartnerVerificationsModule {}
