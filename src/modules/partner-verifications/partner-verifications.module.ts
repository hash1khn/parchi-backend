import { Module } from '@nestjs/common';
import { PartnerVerificationsService } from './partner-verifications.service';
import { PartnerVerificationsPartnerController } from './partner-verifications-partner.controller';
import { PartnerVerificationsStudentController } from './partner-verifications-student.controller';
import { PartnerVerificationsCleanupTask } from './partner-verifications-cleanup.task';
import { PartnerApiKeyGuard } from '../../common/guards/partner-api-key.guard';
import { PartnerRateLimitGuard } from '../../common/guards/partner-rate-limit.guard';
import { StudentRateLimitGuard } from '../../common/guards/student-rate-limit.guard';
import { RateLimiterService } from '../../common/rate-limit/rate-limiter.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [
    PartnerVerificationsPartnerController,
    PartnerVerificationsStudentController,
  ],
  providers: [
    PartnerVerificationsService,
    PartnerVerificationsCleanupTask,
    PartnerApiKeyGuard,
    PartnerRateLimitGuard,
    StudentRateLimitGuard,
    RateLimiterService,
  ],
  exports: [PartnerVerificationsService],
})
export class PartnerVerificationsModule {}
