import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_DAYS = 30;

/**
 * Expiry is enforced on every read/write, so this job only keeps the table tidy:
 *  - persists `expired` for pending rows nobody read after the TTL
 *    (also lets Realtime subscribers see the change)
 *  - drops finished requests after RETENTION_DAYS (audit_logs keep the history)
 */
@Injectable()
export class PartnerVerificationsCleanupTask {
  private readonly logger = new Logger(PartnerVerificationsCleanupTask.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePending(): Promise<void> {
    try {
      const result = await this.prisma.partner_verification_requests.updateMany({
        where: { status: 'pending', expires_at: { lte: new Date() } },
        data: { status: 'expired' },
      });
      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} pending verification request(s) as expired`);
      }
    } catch (err) {
      this.logger.error('Failed to expire pending verification requests', err as Error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOld(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const result = await this.prisma.partner_verification_requests.deleteMany({
        where: { status: { not: 'pending' }, expires_at: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} verification request(s) older than ${RETENTION_DAYS} days`);
      }
    } catch (err) {
      this.logger.error('Failed to purge old verification requests', err as Error);
    }
  }
}
