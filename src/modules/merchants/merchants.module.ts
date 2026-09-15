import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { AdminMerchantDigestController } from './admin-merchant-digest.controller';
import { MerchantsService } from './merchants.service';
import { MerchantDigestService } from './merchant-digest.service';
import { MerchantDigestPdfService } from './merchant-digest-pdf.service';
import { MerchantMonthEndDigestTask } from './merchant-month-end-digest.task';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, MailModule],
  controllers: [MerchantsController, AdminMerchantDigestController],
  providers: [
    MerchantsService,
    MerchantDigestService,
    MerchantDigestPdfService,
    MerchantMonthEndDigestTask,
  ],
  exports: [MerchantsService, MerchantDigestService],
})
export class MerchantsModule {}
